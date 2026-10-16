import captureUrl from './capture.worklet.ts?worker&url'
import { useAudioSession } from '../platform/audioSession'
import type { AnalysisCommand, AnalysisResult } from './messages'
import { ReferenceTone } from './tone'

/** Why listening could not start. */
export type ListenError = 'denied' | 'no-device' | 'busy' | 'insecure' | 'unsupported' | 'failed'

export class ListenFailure extends Error {
  constructor(readonly reason: ListenError) {
    super(reason)
  }
}

/** Listening stopped without the page asking: the microphone went away, or a call took the audio. */
export type ListenEnd = 'device' | 'interrupted'

/** Let the audio device sleep this long after everything stops (saves battery on phones). */
const SUSPEND_AFTER_MS = 1500
/** Without a user gesture (e.g. returning to the app) resume() can wait forever; give up then. */
const RESUME_TIMEOUT_MS = 4000

/**
 * Microphone input for the tuner, and the reference tone. The signal path:
 *
 *   microphone → AudioWorklet (mono, hops, audio-clock frames) → MessagePort → analysis Worker
 *              → readings → main thread
 *
 * The browser's voice processing (echo cancellation, noise suppression, automatic gain) is
 * switched off: it is built for speech, and it smears pitch and pumps the level of a held note.
 * Nothing heavy runs on the audio thread or the main thread.
 */
export class TunerEngine {
  readonly tone: ReferenceTone
  private ctx: AudioContext | null = null
  private moduleReady: Promise<void> | null = null
  private worker: Worker | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private capture: AudioWorkletNode | null = null
  private suspendTimer: number | undefined
  private running = false
  /** Bumped by every start/stop so a start() still awaiting the microphone can tell it is stale. */
  private generation = 0
  private range: Extract<AnalysisCommand, { type: 'range' }> | null = null
  private target: number | null = null
  /** Voice processing the browser kept on despite being asked not to, from the track settings. */
  private processing: string[] = []

  constructor(
    private readonly onReading: (reading: AnalysisResult) => void,
    private readonly onEnd: (reason: ListenEnd) => void,
  ) {
    this.tone = new ReferenceTone(
      () => this.ensureContext(),
      () => {
        if (!this.running) useAudioSession('auto')
        this.scheduleSuspend()
      },
    )
  }

  get listening(): boolean {
    return this.running
  }

  /** Voice processing still applied to the microphone (e.g. "noiseSuppression"), if any. */
  get forcedProcessing(): readonly string[] {
    return this.processing
  }

  /** Must be called from a user gesture (click/keydown): browsers keep audio off until then. */
  async start(): Promise<void> {
    if (this.running) return
    const media = navigator.mediaDevices
    if (!media?.getUserMedia) throw new ListenFailure(window.isSecureContext ? 'unsupported' : 'insecure')
    if (typeof AudioWorkletNode === 'undefined') throw new ListenFailure('unsupported')

    this.running = true
    const generation = ++this.generation
    clearTimeout(this.suspendTimer)
    useAudioSession('play-and-record')
    let stream: MediaStream | null = null
    try {
      const ctx = this.ensureContext()
      // Resume inside the gesture (Safari), then wait for the microphone.
      const resumed = ctx.resume()
      stream = await media.getUserMedia({ audio: RAW_AUDIO, video: false })
      await withTimeout(resumed, RESUME_TIMEOUT_MS)
      await this.loadModule(ctx)
      if (generation !== this.generation) {
        stopTracks(stream)
        return
      }
      this.connect(ctx, stream)
    } catch (error) {
      if (stream) stopTracks(stream)
      if (generation === this.generation) {
        this.running = false
        useAudioSession(this.tone.playing ? 'playback' : 'auto')
        this.scheduleSuspend()
      }
      throw error instanceof ListenFailure ? error : new ListenFailure(listenError(error))
    }
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.generation++
    this.disconnect()
    useAudioSession(this.tone.playing ? 'playback' : 'auto')
    this.scheduleSuspend()
  }

  /** Pitch range to search (follows the instrument). */
  setRange(minFrequency: number, maxFrequency: number): void {
    this.range = { type: 'range', minFrequency, maxFrequency }
    this.post(this.range)
  }

  /** The note being tuned to, for the strobe. */
  setTarget(frequency: number | null): void {
    if (frequency === this.target) return
    this.target = frequency
    this.post({ type: 'target', frequency })
  }

  private ensureContext(): AudioContext {
    if (this.ctx) {
      clearTimeout(this.suspendTimer)
      return this.ctx
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    ctx.addEventListener('statechange', () => {
      // A phone call or Siri ('interrupted'), or the context closing, takes the microphone away.
      // The page only suspends the context itself when nothing is running.
      const state: string = ctx.state
      if (state === 'running') return
      if (this.running) {
        this.stop()
        this.onEnd('interrupted')
      }
      if (state !== 'suspended') this.tone.stop()
    })
    this.ctx = ctx
    return ctx
  }

  private loadModule(ctx: AudioContext): Promise<void> {
    this.moduleReady ??= ctx.audioWorklet.addModule(captureUrl).catch((error: unknown) => {
      this.moduleReady = null
      throw error
    })
    return this.moduleReady
  }

  private connect(ctx: AudioContext, stream: MediaStream): void {
    this.stream = stream
    const track = stream.getAudioTracks()[0]
    const settings = (track?.getSettings() ?? {}) as Record<string, unknown>
    this.processing = ['echoCancellation', 'noiseSuppression', 'autoGainControl'].filter(
      (key) => settings[key] === true,
    )
    track?.addEventListener('ended', () => {
      if (!this.running || this.stream !== stream) return
      this.stop()
      this.onEnd('device')
    })

    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<AnalysisResult>) => {
        if (this.running) this.onReading(event.data)
      }
    }
    const channel = new MessageChannel()
    this.post({ type: 'connect', port: channel.port1, sampleRate: ctx.sampleRate }, [channel.port1])
    if (this.range) this.post(this.range)
    this.post({ type: 'target', frequency: this.target })

    // About 10 ms per hop at any sample rate (512 samples at 44.1 and 48 kHz).
    const hop = 2 ** Math.round(Math.log2(ctx.sampleRate * 0.0107))
    this.source = ctx.createMediaStreamSource(stream)
    this.capture = new AudioWorkletNode(ctx, 'tuner-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: 'explicit',
      channelCount: 2,
      channelInterpretation: 'discrete',
      processorOptions: { hop },
    })
    this.capture.port.postMessage({ port: channel.port2 }, [channel.port2])
    this.source.connect(this.capture)
    // Pulled by the destination so it keeps running; its output is silence.
    this.capture.connect(ctx.destination)
  }

  private disconnect(): void {
    this.source?.disconnect()
    this.capture?.disconnect()
    this.source = null
    this.capture = null
    if (this.stream) stopTracks(this.stream)
    this.stream = null
    this.post({ type: 'disconnect' })
  }

  private post(command: AnalysisCommand, transfer: Transferable[] = []): void {
    this.worker?.postMessage(command, transfer)
  }

  private scheduleSuspend(): void {
    clearTimeout(this.suspendTimer)
    this.suspendTimer = window.setTimeout(() => {
      if (!this.running && !this.tone.playing) void this.ctx?.suspend()
    }, SUSPEND_AFTER_MS)
  }
}

/** Raw microphone: every voice-processing stage off, one channel if the device allows. */
const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  // Newer browsers' speech isolation; browsers ignore constraints they don't know.
  voiceIsolation: false,
  channelCount: { ideal: 1 },
} as MediaTrackConstraints

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ListenFailure('failed')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

function listenError(error: unknown): ListenError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-device'
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'failed'
  }
}
