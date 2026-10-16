import { autocorrelate, nextPowerOfTwo } from './fft'

/**
 * Pitch detection with the McLeod Pitch Method (P. McLeod & G. Wyvill, "A Smarter Way to Find
 * Pitch", ICMC 2005), the algorithm behind Tartini and TarsosDSP's MPM:
 *
 * 1. The normalised square difference function (NSDF) n(τ) = 2·r(τ) / m(τ) rates how well the
 *    window repeats after τ samples, from -1 to 1, whatever the loudness. r comes from an FFT
 *    autocorrelation, m is updated incrementally.
 * 2. Of the "key maxima" (the highest point of each positive lobe), the first one within k of the
 *    tallest is the period. Its height is the clarity: how periodic, so how trustworthy, it is.
 *
 * Beyond the paper, what this tuner relies on:
 * - Sub-sample accuracy: parabolic interpolation at the period, then a least-squares fit over
 *   every repeat of the period that still fits in the window (2T, 3T, …). The interpolation error
 *   is divided by the number of repeats.
 * - Low notes get a second, longer window once the period is known, so a bass string is measured
 *   over several repeats too instead of one.
 * - Octave defence: a period that repeats noticeably better at twice its length is the half of a
 *   longer period (a low string whose 2nd harmonic outweighs its fundamental), and a reading an
 *   octave away from the note just held is checked against that note before it is believed.
 * - A lag range taken from the instrument, so a guitar is never heard an octave off its strings.
 */

export interface DetectorOptions {
  sampleRate: number
  /** Lowest pitch to look for, in Hz. Sets the window: at least 2 of its periods. */
  minFrequency: number
  /** Highest pitch to look for, in Hz. */
  maxFrequency: number
  /** MPM's k: how close to the tallest key maximum the chosen one must be (0.93 in Tartini). */
  threshold?: number
}

export interface PitchEstimate {
  /** Fundamental frequency in Hz. */
  frequency: number
  /** NSDF height at the period, 0–1: 1 is perfectly periodic. */
  clarity: number
  /** True when the octave came from the hint rather than from the window alone. */
  fromHint: boolean
}

/** Periods per window at the lowest frequency; the NSDF needs more than 2 to see one repeat. */
const PERIODS_PER_WINDOW = 2.3
/** Window limits in seconds, so behaviour doesn't change with the device's sample rate. */
const MIN_WINDOW_S = 0.021
const MAX_WINDOW_S = 0.18
/** A period repeating this much better at twice its length is half of the real one. */
const OCTAVE_MARGIN = 0.035
/**
 * With a hint an octave below, the longer period wins on a smaller margin than OCTAVE_MARGIN,
 * but it must still repeat better: a clean tone repeats equally well at T and 2T, and a tie
 * belongs to T (or every upward octave leap would read an octave low).
 */
const HINT_MARGIN = 0.003
/**
 * Below this many samples per period the interpolated peak heights are too coarse for
 * HINT_MARGIN to decide between T and 2T, so the hint does not pull a high note down an octave.
 */
const HINT_MIN_LAG = 40
/** Headroom above the highest frequency searched, so a sharp top note keeps its octave. */
const MAX_HEADROOM = 2 ** (100 / 1200)
/** Repeats used for refinement must stay this periodic (relative to the period's own peak). */
const REPEAT_TOLERANCE = 0.2
/** Fewer repeats than this in the base window: measure again over the long window. */
const MIN_REPEATS = 3
/** The long window is only worth its FFT for a period this clear (the tracker wants 0.75). */
const LONG_WINDOW_CLARITY = 0.5

export function windowSizeFor(sampleRate: number, minFrequency: number): number {
  const size = Math.ceil((PERIODS_PER_WINDOW * sampleRate) / minFrequency)
  return Math.min(Math.round(MAX_WINDOW_S * sampleRate), Math.max(Math.round(MIN_WINDOW_S * sampleRate), size))
}

/** Samples the detector wants: the long window used to refine low notes. */
export function bufferSizeFor(sampleRate: number): number {
  return Math.round(MAX_WINDOW_S * sampleRate)
}

interface Peak {
  lag: number
  value: number
}

/** The NSDF of the most recent `size` samples, with the buffers to compute it every frame. */
class Nsdf {
  readonly values: Float64Array
  private readonly signal: Float64Array
  private readonly scratch: { re: Float64Array; im: Float64Array }

  constructor(
    readonly size: number,
    readonly maxLag: number,
  ) {
    this.signal = new Float64Array(size)
    this.values = new Float64Array(maxLag + 2)
    const fftSize = nextPowerOfTwo(size + maxLag + 2)
    this.scratch = { re: new Float64Array(fftSize), im: new Float64Array(fftSize) }
  }

  /** False for silence (or a constant signal). */
  compute(samples: Float32Array | Float64Array): boolean {
    const W = this.size
    const x = this.signal
    const offset = samples.length - W
    let mean = 0
    for (let i = 0; i < W; i++) mean += samples[offset + i]!
    mean /= W
    let energy = 0
    for (let i = 0; i < W; i++) {
      const v = samples[offset + i]! - mean
      x[i] = v
      energy += v * v
    }
    if (energy < 1e-12) return false

    const n = this.values
    const r = autocorrelate(x, n.length, this.scratch)
    // m(τ) = Σ x[j]² + x[j+τ]² over the overlapping part, updated as τ grows.
    let m = 2 * energy
    n[0] = 1
    for (let tau = 1; tau < n.length; tau++) {
      m -= x[tau - 1]! * x[tau - 1]! + x[W - tau]! * x[W - tau]!
      n[tau] = m > 1e-12 ? (2 * r[tau]!) / m : 0
    }
    return true
  }

  /** The local maximum nearest a fractional lag, interpolated. */
  peakNear(position: number, radius = Math.max(2, Math.round(position * 0.03))): Peak | null {
    const n = this.values
    const centre = Math.round(position)
    let best = -1
    for (let tau = centre - radius; tau <= centre + radius; tau++) {
      if (tau < 1 || tau > this.maxLag) continue
      if (n[tau]! >= n[tau - 1]! && n[tau]! >= n[tau + 1]! && (best < 0 || n[tau]! > n[best]!)) best = tau
    }
    return best < 0 ? null : interpolate(n, best)
  }

  /**
   * Least-squares period through the origin over every repeat that fits: the k-th repeat's
   * interpolated lag carries the same absolute error as the first, so it pins T k times finer.
   */
  refine(lag: number, value: number): { lag: number; repeats: number } {
    let sumKL = lag
    let sumKK = 1
    let k = 2
    for (; k * lag < this.maxLag - 1; k++) {
      const repeat = this.peakNear(k * (sumKL / sumKK), Math.max(2, Math.round(lag * 0.05)))
      if (!repeat || repeat.value < value - REPEAT_TOLERANCE) break
      sumKL += k * repeat.lag
      sumKK += k * k
    }
    return { lag: sumKL / sumKK, repeats: k - 1 }
  }
}

export class PitchDetector {
  readonly sampleRate: number
  /** Samples the base detection looks at. */
  readonly windowSize: number
  /** Samples `detect` should be given: the long window that refines low notes. */
  readonly bufferSize: number
  private readonly minLag: number
  private readonly threshold: number
  private readonly base: Nsdf
  private readonly long: Nsdf

  constructor(options: DetectorOptions) {
    this.sampleRate = options.sampleRate
    this.threshold = options.threshold ?? 0.93
    this.windowSize = windowSizeFor(options.sampleRate, options.minFrequency)
    this.bufferSize = Math.max(this.windowSize, bufferSizeFor(options.sampleRate))
    // The NSDF is only meaningful while at least half the window overlaps itself.
    const maxLag = Math.min(Math.floor(this.windowSize / 2), Math.ceil(options.sampleRate / options.minFrequency) + 2)
    this.minLag = Math.max(2, Math.floor(options.sampleRate / (options.maxFrequency * MAX_HEADROOM)))
    this.base = new Nsdf(this.windowSize, maxLag)
    this.long = new Nsdf(this.bufferSize, Math.floor(this.bufferSize / 2))
  }

  /**
   * Estimate the pitch at the end of `samples` (give it `bufferSize` samples; with fewer, low
   * notes are measured over the base window only). `hint` is the frequency held just before, if
   * any: a reading exactly an octave away from it is double-checked before it is believed.
   */
  detect(samples: Float32Array | Float64Array, hint?: number): PitchEstimate | null {
    if (samples.length < this.windowSize || !this.base.compute(samples)) return null
    const n = this.base.values
    const keyMaxima = this.keyMaxima(n)
    if (keyMaxima.length === 0) return null

    // Compare interpolated heights: at short lags the integer samples straddle the true peak
    // unevenly, enough to tip the choice to a multiple of the period.
    const height = (lag: number) => interpolate(n, lag).value
    let tallest = 0
    for (const lag of keyMaxima) tallest = Math.max(tallest, height(lag))
    const chosen = keyMaxima.find((lag) => height(lag) >= this.threshold * tallest)!
    // Above the range: no reading, rather than a confident one an octave or a twelfth low.
    if (chosen < this.minLag) return null
    let period = interpolate(n, chosen)

    // Half of a longer period? (Weak fundamental, strong 2nd harmonic.)
    const double = this.base.peakNear(2 * period.lag)
    if (double && double.value > period.value + OCTAVE_MARGIN) period = double

    let fromHint = false
    if (hint !== undefined && hint > 0) {
      const hinted = this.followHint(period, hint)
      fromHint = hinted !== period
      period = hinted
    }

    let refined = this.base.refine(period.lag, period.value)
    const lowNote = refined.repeats < MIN_REPEATS && period.value >= LONG_WINDOW_CLARITY
    if (lowNote && samples.length >= this.bufferSize && this.long.compute(samples)) {
      // A low note: measure the same period over the long window. If the note only just began,
      // the long window still holds the previous one and its peak is weaker; keep the base then.
      const peak = this.long.peakNear(refined.lag)
      if (peak && peak.value >= period.value - 0.05) {
        const longer = this.long.refine(peak.lag, peak.value)
        if (longer.repeats >= refined.repeats) refined = longer
      }
    }
    return { frequency: this.sampleRate / refined.lag, clarity: Math.min(1, period.value), fromHint }
  }

  /**
   * The highest lag of each positive lobe after the first negative dip, up to the longest lag.
   * Lobes below minLag are kept, so a note above the range is recognised (and refused) rather
   * than read at a multiple of its period.
   */
  private keyMaxima(n: Float64Array): number[] {
    const maxLag = this.base.maxLag
    const result: number[] = []
    let tau = 1
    // Skip the lobe around τ = 0: every signal matches itself at small lags.
    while (tau < maxLag && n[tau]! > 0) tau++
    let best = -1
    for (; tau <= maxLag; tau++) {
      const v = n[tau]!
      const prev = n[tau - 1]!
      if (prev <= 0 && v > 0) best = tau // lobe begins
      if (best >= 0) {
        if (v > n[best]!) best = tau
        if (prev > 0 && v <= 0) {
          result.push(best)
          best = -1
        }
      }
    }
    // A lobe still open at the end counts only if its peak is a real peak, not the cut-off.
    if (best >= 0 && best < maxLag && n[best]! >= n[best + 1]!) result.push(best)
    return result
  }

  /**
   * A reading an octave from the note just held may be the same note heard through its 2nd
   * harmonic (or a passing sub-harmonic). Keep the held octave only where the window itself
   * favours it, however slightly; where it doesn't, the new octave is real.
   */
  private followHint(period: Peak, hint: number): Peak {
    const cents = 1200 * Math.log2(this.sampleRate / period.lag / hint)
    if (Math.abs(cents - 1200) < 60 && period.lag >= HINT_MIN_LAG) {
      const longer = this.base.peakNear(2 * period.lag)
      if (longer && longer.value >= 0.8 && longer.value > period.value + HINT_MARGIN) return longer
    } else if (Math.abs(cents + 1200) < 60 && period.lag / 2 >= this.minLag) {
      const shorter = this.base.peakNear(period.lag / 2)
      if (shorter && shorter.value >= 0.85 && shorter.value >= period.value - HINT_MARGIN) return shorter
    }
    return period
  }
}

/** Vertex of the parabola through the three points around an integer peak. */
function interpolate(n: Float64Array, tau: number): Peak {
  const a = n[tau - 1] ?? n[tau]!
  const b = n[tau]!
  const c = n[tau + 1] ?? n[tau]!
  const curvature = a - 2 * b + c
  if (curvature >= 0) return { lag: tau, value: b }
  const shift = (a - c) / (2 * curvature)
  return { lag: tau + shift, value: b - ((a - c) * shift) / 4 }
}

/** Root-mean-square level of the last `count` samples in dBFS (-Infinity for silence). */
export function levelDb(samples: Float32Array | Float64Array, count = samples.length): number {
  const from = Math.max(0, samples.length - count)
  let sum = 0
  for (let i = from; i < samples.length; i++) sum += samples[i]! * samples[i]!
  const n = samples.length - from
  return n > 0 ? 10 * Math.log10(sum / n) : -Infinity
}
