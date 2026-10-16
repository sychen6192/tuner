import { describe, expect, it } from 'vitest'
import { PitchDetector, levelDb, windowSizeFor } from '../src/core/pitch'
import { CHROMATIC_RANGE, searchRange, strings } from '../src/core/instruments'
import { acf2plus } from './support/acf2plus'
import { cents, midiToHz, random, tone, type ToneOptions } from './support/signals'

const chromatic = new PitchDetector({
  sampleRate: 48000,
  minFrequency: CHROMATIC_RANGE.min,
  maxFrequency: CHROMATIC_RANGE.max,
})

/** Plucked-string spectra: the fundamental is weaker than the 2nd harmonic on low strings. */
const GUITAR = [0.35, 1, 0.8, 0.45, 0.5, 0.25, 0.2, 0.12, 0.1, 0.06]
const BASS = [0.6, 1, 0.5, 0.35, 0.2, 0.1]
const NO_FUNDAMENTAL = [0, 1, 0.8, 0.6, 0.4, 0.3]

function detectCents(detector: PitchDetector, frequency: number, options: Partial<ToneOptions>) {
  const result = detector.detect(tone({ frequency, length: detector.bufferSize, ...options }))
  return result ? cents(result.frequency, frequency) : NaN
}

describe('PitchDetector', () => {
  it('measures pure tones from A0 to C8 within 0.01 cent', () => {
    for (let midi = 21; midi <= 108; midi++) {
      const f = midiToHz(midi) * 2 ** (((midi % 11) - 5) / 1200) // a few cents off the note
      expect(Math.abs(detectCents(chromatic, f, {})), `MIDI ${midi}`).toBeLessThan(0.01)
    }
  })

  it('works at 44.1 kHz and 96 kHz too', () => {
    for (const sampleRate of [44100, 96000]) {
      const detector = new PitchDetector({ sampleRate, minFrequency: 26, maxFrequency: 4500 })
      for (const f of [41.2, 110, 440, 1760]) {
        const r = detector.detect(tone({ frequency: f, sampleRate, length: detector.bufferSize, harmonics: GUITAR }))
        expect(Math.abs(cents(r!.frequency, f))).toBeLessThan(0.05)
      }
    }
  })

  it('stays within half a cent on noisy plucked strings, and never slips an octave', () => {
    let worst = 0
    for (const [spectrum, midis] of [
      [BASS, [23, 28, 33, 38, 43]],
      [GUITAR, [40, 45, 50, 55, 59, 64]],
      [NO_FUNDAMENTAL, [40, 52, 64, 76]],
    ] as const) {
      for (const midi of midis) {
        for (let seed = 1; seed <= 12; seed++) {
          const f = midiToHz(midi) * 2 ** (((seed % 7) - 3) / 120)
          const error = detectCents(chromatic, f, { harmonics: spectrum, decay: 1.2, noise: 0.01, seed })
          expect(Math.abs(error), `MIDI ${midi} seed ${seed}`).toBeLessThan(50)
          worst = Math.max(worst, Math.abs(error))
        }
      }
    }
    expect(worst).toBeLessThan(0.75)
  })

  it('beats the most-starred web tuner (cwilso/PitchDetect) on bass strings', () => {
    let ours = 0
    let theirs = 0
    for (const midi of [23, 28, 33, 38, 43]) {
      for (let seed = 1; seed <= 20; seed++) {
        const f = midiToHz(midi) * 2 ** (((seed % 7) - 3) / 120)
        const signal = tone({
          frequency: f,
          length: chromatic.bufferSize,
          harmonics: BASS,
          decay: 1.2,
          noise: 0.01,
          seed,
        })
        const mine = chromatic.detect(signal)
        const baseline = acf2plus(signal.slice(-2048), 48000)
        if (!mine || Math.abs(cents(mine.frequency, f)) > 50) ours++
        if (baseline <= 0 || Math.abs(cents(baseline, f)) > 50) theirs++
      }
    }
    expect(ours).toBe(0)
    expect(theirs).toBeGreaterThan(5)
  })

  it('reads the 2nd harmonic as the octave it is when it dominates a low string', () => {
    // E2 whose fundamental is barely there: a period of T/2 nearly repeats, T repeats exactly.
    const error = detectCents(chromatic, 82.41, { harmonics: [0.12, 1, 0.15, 0.6, 0.1, 0.3], decay: 2, noise: 0.005 })
    expect(Math.abs(error)).toBeLessThan(1)
  })

  it('keeps the held octave when a reading slips to it', () => {
    const detector = new PitchDetector({ sampleRate: 48000, minFrequency: 60, maxFrequency: 1400 })
    // Mostly 2nd harmonic: without the hint this can read A3 instead of A2.
    const signal = tone({ frequency: 110, length: detector.bufferSize, harmonics: [0.05, 1, 0.04, 0.3], noise: 0.01 })
    const plain = detector.detect(signal)!
    const hinted = detector.detect(signal, 110)!
    expect(Math.abs(cents(hinted.frequency, 110))).toBeLessThan(1)
    expect([110, 220].some((f) => Math.abs(cents(plain.frequency, f)) < 1)).toBe(true)
  })

  it('reports high clarity for tones and finds nothing in silence or noise', () => {
    expect(chromatic.detect(tone({ frequency: 440, length: chromatic.bufferSize }))!.clarity).toBeGreaterThan(0.99)
    expect(chromatic.detect(new Float32Array(chromatic.bufferSize))).toBeNull()
    const rand = random(7)
    const noise = Float32Array.from({ length: chromatic.bufferSize }, () => rand() * 2 - 1)
    const heard = chromatic.detect(noise)
    expect(heard === null || heard.clarity < 0.6).toBe(true)
  })

  it('keeps a sharp top note in its octave, and refuses notes far above the range', () => {
    const range = searchRange(strings('bass'), 440)
    const bass = new PitchDetector({ sampleRate: 48000, minFrequency: range.min, maxFrequency: range.max })
    // 7th-fret harmonic on the G string (D4), played 40 cents sharp.
    const d4 = midiToHz(62) * 2 ** (40 / 1200)
    const harmonic = bass.detect(tone({ frequency: d4, length: bass.bufferSize, harmonics: [1, 0.3] }))
    expect(Math.abs(cents(harmonic!.frequency, d4))).toBeLessThan(1)
    // G4 is far above a bass: no reading, rather than a confident one an octave low.
    const g4 = bass.detect(tone({ frequency: midiToHz(67), length: bass.bufferSize, harmonics: [1, 0.3] }))
    expect(g4).toBeNull()
  })

  it('does not report pitches outside the instrument range', () => {
    const guitar = new PitchDetector({ sampleRate: 48000, minFrequency: 55, maxFrequency: 1400 })
    const result = guitar.detect(tone({ frequency: 30, length: guitar.bufferSize }))
    expect(result === null || result.frequency >= 55).toBe(true)
  })

  it('sizes the window for two periods of the lowest note, within limits', () => {
    expect(windowSizeFor(48000, 26)).toBe(Math.ceil((2.3 * 48000) / 26))
    expect(windowSizeFor(48000, 1000)).toBe(1008) // 21 ms floor
    expect(windowSizeFor(48000, 5)).toBe(8640) // 180 ms ceiling
  })

  it('needs a full window', () => {
    expect(chromatic.detect(new Float32Array(100))).toBeNull()
  })
})

describe('levelDb', () => {
  it('measures RMS level in dBFS', () => {
    expect(levelDb(new Float32Array(1000).fill(1))).toBeCloseTo(0, 6)
    expect(levelDb(tone({ frequency: 440, amplitude: 1, length: 4800 }))).toBeCloseTo(-3.01, 1)
    expect(levelDb(new Float32Array(10))).toBe(-Infinity)
    expect(levelDb(Float32Array.from([1, 1, 0, 0]), 2)).toBe(-Infinity)
  })
})
