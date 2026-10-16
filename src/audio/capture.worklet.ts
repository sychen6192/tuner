/// <reference lib="webworker" />
// Runs on the audio rendering thread: mixes the microphone to mono and hands it to the analysis
// worker in hops, with the audio-clock frame of each, through a MessagePort set up at start.
// Nothing heavy happens here, so the audio thread never misses a render quantum.

import type { CaptureChunk } from './messages'

declare const sampleRate: number
declare const currentFrame: number
declare function registerProcessor(name: string, ctor: new (options: { processorOptions?: unknown }) => unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

interface CaptureOptions {
  /** Samples per hop. */
  hop: number
}

class CaptureProcessor extends AudioWorkletProcessor {
  /** Samples per hop (kept apart from the buffer: a transferred buffer reads as empty). */
  private readonly hop: number
  private buffer: Float32Array
  private filled = 0
  private target: MessagePort | null = null
  /** Told to stop: process() returns false so the node can be collected. */
  private done = false

  constructor(options: { processorOptions?: unknown }) {
    super()
    this.hop = ((options.processorOptions ?? { hop: 512 }) as CaptureOptions).hop
    this.buffer = new Float32Array(this.hop)
    this.port.onmessage = (event: MessageEvent<{ port?: MessagePort; stop?: boolean }>) => {
      if (event.data.stop) {
        this.target = null
        this.done = true
        this.port.onmessage = null
        return
      }
      this.target = event.data.port ?? null
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0]
    if (!channels || channels.length === 0 || !this.target) return !this.done
    const frames = channels[0]!.length
    for (let i = 0; i < frames; i++) {
      // Mono mix. Some phones deliver the microphone on one channel of a stereo pair (WebKit
      // 281978), so take the louder side instead of averaging it down by half.
      let sample = channels[0]![i]!
      for (let c = 1; c < channels.length; c++) {
        const other = channels[c]![i]!
        if (Math.abs(other) > Math.abs(sample)) sample = other
      }
      this.buffer[this.filled++] = sample
      if (this.filled === this.hop) {
        const endFrame = currentFrame + i + 1
        const chunk: CaptureChunk = { samples: this.buffer, endFrame, endTime: endFrame / sampleRate }
        this.target.postMessage(chunk, [this.buffer.buffer])
        this.buffer = new Float32Array(this.hop)
        this.filled = 0
      }
    }
    return !this.done
  }
}

registerProcessor('tuner-capture', CaptureProcessor)
