import { CHROMATIC_RANGE } from './instruments'
import { PitchDetector, levelDb } from './pitch'
import { strobeBands, type StrobeBand } from './strobe'

/**
 * The analysis loop the worker runs, kept free of worker APIs so it can be tested: it keeps the
 * last few hundred milliseconds of signal, and for each hop runs the detector and the strobe.
 *
 * - The octave hint is renewed by readings the detector made on its own, and, for low notes
 *   only, by readings the hint decided. A held low string whose fundamental fades depends on
 *   the hint for as long as it rings; there the detector's tie-break between T and 2T is
 *   reliable, so a real octave leap still gets through. Higher up it is not, and a reading the
 *   hint decided must not keep a wrong octave alive.
 * - When detection is slower than real time (a slow phone, the long window of a bass string),
 *   hops are taken in without analysis until the time is paid back, so readings stay current
 *   instead of queueing up behind the instrument.
 */

export interface Reading {
  /** Audio-clock time at the end of the hop, seconds. */
  time: number
  frequency: number | null
  clarity: number
  /** Input level in dBFS. */
  level: number
  /** Phase of the strobe bands against the target, when one is set and the signal is clear. */
  strobe: StrobeBand[] | null
  /** The target these bands were measured against. */
  strobeTarget: number | null
}

/** Clarity a reading needs to serve as the octave hint for the next one. */
const HINT_CLARITY = 0.9
/** How long a hint stays valid, seconds. */
const HINT_TIME = 0.3
/** Readings the hint decided renew it only below this frequency, as samples per period. */
const HINT_RENEW_PERIOD = 80
/** Clarity needed before the strobe is measured. */
const STROBE_CLARITY = 0.8

export class Analyser {
  private detector: PitchDetector
  private history: Float32Array
  private range: { minFrequency: number; maxFrequency: number } = {
    minFrequency: CHROMATIC_RANGE.min,
    maxFrequency: CHROMATIC_RANGE.max,
  }
  private target: number | null = null
  private hint: { frequency: number; time: number } | null = null
  /** Seconds of analysis time still owed to real time. */
  private debt = 0

  constructor(
    readonly sampleRate: number,
    /** Milliseconds, for measuring how long analysis takes (injectable for tests). */
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.detector = new PitchDetector({ sampleRate, ...this.range })
    this.history = new Float32Array(this.detector.bufferSize)
  }

  setRange(minFrequency: number, maxFrequency: number): void {
    this.range = { minFrequency, maxFrequency }
    this.detector = new PitchDetector({ sampleRate: this.sampleRate, ...this.range })
    const next = new Float32Array(this.detector.bufferSize)
    // Keep what was already heard, so a change of instrument doesn't blank the reading.
    const keep = Math.min(next.length, this.history.length)
    next.set(this.history.subarray(this.history.length - keep), next.length - keep)
    this.history = next
    this.hint = null
  }

  setTarget(frequency: number | null): void {
    this.target = frequency
  }

  /** Forget what was heard (listening stopped). */
  reset(): void {
    this.history.fill(0)
    this.hint = null
    this.debt = 0
  }

  /**
   * Take in one hop whose last sample is just before audio-clock frame `endFrame` (time
   * `endTime`). Returns the reading, or null when this hop is skipped to catch up.
   */
  push(samples: Float32Array, endFrame: number, endTime: number): Reading | null {
    const history = this.history
    const hop = Math.min(samples.length, history.length)
    history.copyWithin(0, hop)
    history.set(samples.subarray(samples.length - hop), history.length - hop)

    const hopSeconds = samples.length / this.sampleRate
    if (this.debt > 0) {
      this.debt = Math.max(0, this.debt - hopSeconds)
      return null
    }
    const started = this.clock()
    const reading = this.analyse(endFrame, endTime)
    this.debt = Math.max(0, (this.clock() - started) / 1000 - hopSeconds)
    return reading
  }

  private analyse(endFrame: number, time: number): Reading {
    const history = this.history
    if (this.hint && time - this.hint.time > HINT_TIME) this.hint = null
    const level = levelDb(history, this.detector.windowSize)
    const estimate = this.detector.detect(history, this.hint?.frequency)
    const renews = estimate && (!estimate.fromHint || estimate.frequency < this.sampleRate / HINT_RENEW_PERIOD)
    if (estimate && renews && estimate.clarity >= HINT_CLARITY) {
      this.hint = { frequency: estimate.frequency, time }
    }
    const target = this.target
    const strobe =
      target !== null && estimate && estimate.clarity >= STROBE_CLARITY
        ? strobeBands(history, endFrame, this.sampleRate, target)
        : null
    return {
      time,
      frequency: estimate?.frequency ?? null,
      clarity: estimate?.clarity ?? 0,
      level,
      strobe,
      strobeTarget: strobe ? target : null,
    }
  }
}
