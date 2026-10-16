/// <reference lib="webworker" />
// Pitch analysis off the main thread: keeps the last few hundred milliseconds of microphone
// signal, and for every hop the capture worklet delivers, runs the detector and the strobe and
// posts one reading. The main thread only draws.

import { CHROMATIC_RANGE } from '../core/instruments'
import { PitchDetector, levelDb } from '../core/pitch'
import { strobeBands } from '../core/strobe'
import type { AnalysisCommand, AnalysisResult, CaptureChunk } from './messages'

/** Clarity a reading needs to serve as the octave hint for the next one. */
const HINT_CLARITY = 0.9
/** How long a hint stays valid, seconds. */
const HINT_TIME = 0.3

let sampleRate = 48000
let range: { minFrequency: number; maxFrequency: number } = {
  minFrequency: CHROMATIC_RANGE.min,
  maxFrequency: CHROMATIC_RANGE.max,
}
let detector: PitchDetector | null = null
let history = new Float32Array(0)
let target: number | null = null
let hint: { frequency: number; time: number } | null = null
let input: MessagePort | null = null

function rebuild(): void {
  detector = new PitchDetector({ sampleRate, ...range })
  const next = new Float32Array(detector.bufferSize)
  // Keep what was already heard so a change of instrument doesn't blank the reading.
  next.set(history.subarray(Math.max(0, history.length - next.length)), Math.max(0, next.length - history.length))
  history = next
}

function analyse(chunk: CaptureChunk): void {
  if (!detector) return
  const { samples } = chunk
  const hop = Math.min(samples.length, history.length)
  history.copyWithin(0, hop)
  history.set(samples.subarray(samples.length - hop), history.length - hop)

  const time = chunk.endTime
  if (hint && time - hint.time > HINT_TIME) hint = null
  const level = levelDb(history, detector.windowSize)
  const estimate = detector.detect(history, hint?.frequency)
  if (estimate && estimate.clarity >= HINT_CLARITY) hint = { frequency: estimate.frequency, time }

  const strobe =
    target !== null && estimate && estimate.clarity >= 0.8
      ? strobeBands(history, chunk.endFrame, sampleRate, target)
      : null
  const result: AnalysisResult = {
    type: 'reading',
    time,
    frequency: estimate?.frequency ?? null,
    clarity: estimate?.clarity ?? 0,
    level,
    strobe,
    strobeTarget: strobe ? target : null,
  }
  self.postMessage(result)
}

self.onmessage = (event: MessageEvent<AnalysisCommand>) => {
  const command = event.data
  switch (command.type) {
    case 'connect':
      input?.close()
      input = command.port
      input.onmessage = (message: MessageEvent<CaptureChunk>) => analyse(message.data)
      sampleRate = command.sampleRate
      history = new Float32Array(0)
      hint = null
      rebuild()
      break
    case 'range':
      range = { minFrequency: command.minFrequency, maxFrequency: command.maxFrequency }
      hint = null
      rebuild()
      break
    case 'target':
      target = command.frequency
      break
    case 'disconnect':
      input?.close()
      input = null
      history.fill(0)
      hint = null
      break
  }
}
