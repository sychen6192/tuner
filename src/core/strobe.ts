/**
 * A true strobe, as in a Peterson strobe tuner or x42's Tuna: each band shows the phase of one
 * harmonic of the input measured against a reference oscillator running at that harmonic of the
 * target note, on the audio clock. In tune, the phase stands still; off by Δf, band k turns at
 * k·Δf revolutions per second, so the higher bands show smaller errors (and a stiff string's
 * sharp upper partials, which a needle averages away).
 */

/** Harmonics shown, one band each: the fundamental and its two octaves. */
export const STROBE_HARMONICS = [1, 2, 4] as const

export interface StrobeBand {
  /** Phase in turns, 0–1. */
  phase: number
  /** Share of the signal at this harmonic, 0–1 (about 1 for a pure tone at the fundamental). */
  strength: number
}

/** Periods of the target covered by the measurement: enough to separate neighbouring harmonics. */
const PERIODS = 4

/**
 * Measure each harmonic's phase over the end of `samples`, whose last sample is absolute frame
 * `endFrame - 1` of the audio clock.
 */
export function strobeBands(
  samples: Float32Array | Float64Array,
  endFrame: number,
  sampleRate: number,
  target: number,
  harmonics: readonly number[] = STROBE_HARMONICS,
): StrobeBand[] {
  const length = Math.min(samples.length, Math.round((PERIODS * sampleRate) / target))
  const offset = samples.length - length
  const startFrame = endFrame - length
  let windowSum = 0
  let energy = 0
  for (let i = 0; i < length; i++) {
    const v = samples[offset + i]!
    energy += v * v
    windowSum += hann(i, length)
  }
  const rms = Math.sqrt(energy / Math.max(1, length))

  return harmonics.map((k) => {
    const cycles = (k * target) / sampleRate // reference cycles per sample
    if (cycles >= 0.5 || rms === 0) return { phase: 0, strength: 0 }
    // Reference phase at the first sample, in turns, kept small for precision.
    const start = (startFrame * cycles) % 1
    let cr = Math.cos(-2 * Math.PI * start)
    let ci = Math.sin(-2 * Math.PI * start)
    const sr = Math.cos(-2 * Math.PI * cycles)
    const si = Math.sin(-2 * Math.PI * cycles)
    let re = 0
    let im = 0
    for (let i = 0; i < length; i++) {
      const v = samples[offset + i]! * hann(i, length)
      re += v * cr
      im += v * ci
      const nr = cr * sr - ci * si
      ci = cr * si + ci * sr
      cr = nr
    }
    const amplitude = (2 * Math.hypot(re, im)) / windowSum
    return {
      phase: (((Math.atan2(im, re) / (2 * Math.PI)) % 1) + 1) % 1,
      strength: Math.min(1, amplitude / (rms * Math.SQRT2)),
    }
  })
}

const hann = (i: number, length: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / length)

/** Shortest signed distance between two phases, in turns (-0.5 to 0.5). */
export function phaseDelta(from: number, to: number): number {
  return ((((to - from) % 1) + 1.5) % 1) - 0.5
}
