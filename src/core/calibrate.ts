import { MAX_A4, MIN_A4 } from './notes'

/**
 * Calibration: set the reference pitch from an A heard through the microphone (the orchestra's
 * oboe, a piano or organ that isn't at 440), as hardware tuners and Cleartune do. Readings are
 * collected while the A sounds; any octave counts, and the median becomes the new A4.
 */

/** Readings needed (about half a second of steady tone at ~90 readings/s). */
export const MIN_CALIBRATION_READINGS = 40
/** Readings may not spread wider than this (cents, middle half), or the tone wasn't steady. */
const MAX_SPREAD = 8

/** The A4 a reading would be, if it is an A in some octave within the reference range. */
function asA4(frequency: number): number | null {
  if (!(frequency > 0)) return null
  const folded = frequency * 2 ** Math.ceil(Math.log2(MIN_A4 / frequency))
  return folded <= MAX_A4 ? folded : null
}

export function calibrate(frequencies: readonly number[]): number | null {
  if (frequencies.length < MIN_CALIBRATION_READINGS) return null
  const candidates = frequencies.map(asA4).filter((a): a is number => a !== null)
  if (candidates.length < frequencies.length * 0.75) return null
  candidates.sort((a, b) => a - b)
  const quantile = (q: number) => candidates[Math.min(candidates.length - 1, Math.floor(q * candidates.length))]!
  const median = quantile(0.5)
  // Readings an octave apart fold together; anything else wide means the pitch wasn't steady.
  if (1200 * Math.log2(quantile(0.75) / quantile(0.25)) > MAX_SPREAD) return null
  return Math.min(MAX_A4, Math.max(MIN_A4, Math.round(median * 10) / 10))
}
