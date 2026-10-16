import { describe, expect, it } from 'vitest'
import { CHROMATIC_RANGE } from '../src/core/instruments'
import { PitchDetector } from '../src/core/pitch'
import { acf2plus } from './support/acf2plus'
import { cents, midiToHz, tone, type ToneOptions } from './support/signals'

/**
 * Accuracy against the most-starred web tuner's detector (cwilso/PitchDetect's ACF2+, ported in
 * support/acf2plus.ts), on the same synthetic recordings: one analysis per recording, no
 * smoothing on either side. `npm run benchmark` prints the table used in the README.
 */

interface Case {
  name: string
  midis: readonly number[]
  tone: Partial<ToneOptions>
}

const CASES: Case[] = [
  { name: 'Pure tones, A0–C8', midis: range(21, 108, 3), tone: {} },
  {
    name: 'Guitar strings (weak fundamental, decay, noise)',
    midis: [40, 45, 50, 55, 59, 64],
    tone: { harmonics: [0.35, 1, 0.8, 0.45, 0.5, 0.25, 0.2, 0.12, 0.1, 0.06], decay: 1.2, noise: 0.01 },
  },
  {
    name: 'Bass strings E1–G2, B0',
    midis: [23, 28, 33, 38, 43],
    tone: { harmonics: [0.6, 1, 0.5, 0.35, 0.2, 0.1], decay: 1.2, noise: 0.01 },
  },
  {
    name: 'Missing fundamental',
    midis: [40, 52, 64, 76],
    tone: { harmonics: [0, 1, 0.8, 0.6, 0.4, 0.3], noise: 0.005 },
  },
  {
    name: 'Voice-like tone in noise (SNR ≈ 14 dB)',
    midis: [48, 55, 60, 64, 67, 72],
    tone: { harmonics: [1, 0.7, 0.5, 0.4, 0.2, 0.1], noise: 0.06 },
  },
]

const SEEDS = 10

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let m = from; m <= to; m += step) out.push(m)
  return out
}

interface Score {
  octaveErrors: number
  meanError: number
  maxError: number
  count: number
}

function score(errors: number[]): Score {
  const usable = errors.filter((e) => Number.isFinite(e) && Math.abs(e) < 50)
  return {
    octaveErrors: errors.length - usable.length,
    meanError: usable.reduce((s, e) => s + Math.abs(e), 0) / Math.max(1, usable.length),
    maxError: Math.max(0, ...usable.map(Math.abs)),
    count: errors.length,
  }
}

function run(test: Case) {
  const detector = new PitchDetector({
    sampleRate: 48000,
    minFrequency: CHROMATIC_RANGE.min,
    maxFrequency: CHROMATIC_RANGE.max,
  })
  const ours: number[] = []
  const theirs: number[] = []
  for (const midi of test.midis) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = midiToHz(midi) * 2 ** (((seed % 7) - 3) / 120)
      const signal = tone({ frequency: f, length: detector.bufferSize, seed, ...test.tone })
      const mine = detector.detect(signal)
      ours.push(mine ? cents(mine.frequency, f) : NaN)
      // cwilso analyses a 2048-sample AnalyserNode buffer.
      const baseline = acf2plus(signal.slice(-2048), 48000)
      theirs.push(baseline > 0 ? cents(baseline, f) : NaN)
    }
  }
  return { ours: score(ours), theirs: score(theirs) }
}

describe('benchmark against cwilso/PitchDetect (ACF2+)', () => {
  const results = CASES.map((test) => ({ test, ...run(test) }))

  it('is at least as accurate in every case, with no octave errors', () => {
    for (const { test, ours, theirs } of results) {
      expect(ours.octaveErrors, test.name).toBe(0)
      expect(ours.meanError, test.name).toBeLessThanOrEqual(theirs.meanError)
    }
  })

  it.runIf(process.env.BENCHMARK)('prints the table', () => {
    const cell = (s: Score) => `${s.meanError.toFixed(2)} / ${s.maxError.toFixed(2)} | ${s.octaveErrors} / ${s.count}`
    const lines = [
      '| Signal | Tuner: mean / max error (cents) | Tuner: wrong note | cwilso ACF2+: mean / max error (cents) | cwilso ACF2+: wrong note |',
      '| --- | --- | --- | --- | --- |',
      ...results.map(({ test, ours, theirs }) => `| ${test.name} | ${cell(ours)} | ${cell(theirs)} |`),
    ]
    console.log(lines.join('\n'))
  })
})
