import { describe, expect, it } from 'vitest'
import { Analyser, type Reading } from '../src/core/analyser'
import { cents, random } from './support/signals'

const SR = 48000
const HOP = 512

/** A continuous phase-coherent tone whose frequency (and spectrum) can change over time. */
function stream(segments: { seconds: number; frequency: number; harmonics?: number[] }[], noise = 0) {
  const total = Math.round(segments.reduce((s, x) => s + x.seconds, 0) * SR)
  const out = new Float32Array(total)
  const rand = random(9)
  let i = 0
  let phase = 0
  for (const segment of segments) {
    const n = Math.round(segment.seconds * SR)
    const harmonics = segment.harmonics ?? [1]
    const norm = harmonics.reduce((a, b) => a + b, 0)
    for (let k = 0; k < n; k++, i++) {
      phase += (2 * Math.PI * segment.frequency) / SR
      let v = 0
      harmonics.forEach((a, h) => (v += a * Math.sin((h + 1) * phase + h)))
      out[i] = (0.4 * v) / norm + noise * (rand() * 2 - 1)
    }
  }
  return out
}

/** Feed a signal through the analyser hop by hop, as the worker does. */
function run(analyser: Analyser, signal: Float32Array): Reading[] {
  const readings: Reading[] = []
  for (let end = HOP; end <= signal.length; end += HOP) {
    const reading = analyser.push(signal.slice(end - HOP, end), end, end / SR)
    if (reading) readings.push(reading)
  }
  return readings
}

describe('Analyser', () => {
  it('follows an upward octave leap instead of locking an octave low', () => {
    for (const [low, harmonics] of [
      [220, [1]],
      [110, [1, 0.7, 0.5, 0.4, 0.2]],
      [82.41, [0.35, 1, 0.8, 0.45, 0.5, 0.25]],
    ] as const) {
      const analyser = new Analyser(SR)
      const readings = run(
        analyser,
        stream([
          { seconds: 1, frequency: low, harmonics: [...harmonics] },
          { seconds: 1.5, frequency: 2 * low, harmonics: [...harmonics] },
        ]),
      )
      // Once the buffer (180 ms) holds only the new note, every reading is the new note.
      const after = readings.filter((r) => r.time > 1.25 && r.frequency !== null)
      expect(after.length, `${low} Hz`).toBeGreaterThan(50)
      for (const r of after) expect(Math.abs(cents(r.frequency!, 2 * low)), `${low} Hz at ${r.time}`).toBeLessThan(5)
    }
  })

  it('follows an upward octave leap high up, where the hint stands aside', () => {
    const analyser = new Analyser(SR)
    const readings = run(
      analyser,
      stream(
        [
          { seconds: 1, frequency: 1174.7, harmonics: [1, 0.6, 0.4, 0.3] },
          { seconds: 1, frequency: 2349.3, harmonics: [1, 0.6, 0.4, 0.3] },
        ],
        0.005,
      ),
    )
    const after = readings.filter((r) => r.time > 1.15 && r.frequency !== null)
    for (const r of after) expect(Math.abs(cents(r.frequency!, 2349.3)), `at ${r.time}`).toBeLessThan(5)
  })

  it('holds a low string in its octave while its fundamental fades', () => {
    // Bright attack, then a held tone that is nearly all 2nd harmonic: the case the hint is for.
    for (const low of [110, 41.2, 220]) {
      const analyser = new Analyser(SR)
      const readings = run(
        analyser,
        stream(
          [
            { seconds: 0.4, frequency: low, harmonics: [0.6, 1, 0.5, 0.3] },
            { seconds: 2, frequency: low, harmonics: [0.05, 1, 0.04, 0.3] },
          ],
          0.01,
        ),
      )
      const held = readings.filter((r) => r.time > 0.5 && r.frequency !== null)
      expect(held.length).toBeGreaterThan(100)
      for (const r of held) expect(Math.abs(cents(r.frequency!, low)), `${low} Hz at ${r.time}`).toBeLessThan(50)
    }
  })

  it('follows a downward octave leap too', () => {
    const analyser = new Analyser(SR)
    const readings = run(
      analyser,
      stream([
        { seconds: 1, frequency: 440, harmonics: [1, 0.5, 0.3] },
        { seconds: 1.5, frequency: 220, harmonics: [1, 0.5, 0.3] },
      ]),
    )
    const after = readings.filter((r) => r.time > 1.25 && r.frequency !== null)
    for (const r of after) expect(Math.abs(cents(r.frequency!, 220))).toBeLessThan(5)
  })

  it('measures the strobe against the target once one is set', () => {
    const analyser = new Analyser(SR)
    analyser.setTarget(440)
    const readings = run(analyser, stream([{ seconds: 0.5, frequency: 440 }]))
    const last = readings.at(-1)!
    expect(last.strobeTarget).toBe(440)
    expect(last.strobe).toHaveLength(3)
  })

  it('skips hops to catch up when analysis is slower than real time', () => {
    // Every analysis "takes" three hops of time: one hop in three is analysed.
    let now = 0
    const slow = new Analyser(SR, () => {
      now += ((3 * HOP) / SR) * 1000
      return now
    })
    const signal = stream([{ seconds: 1, frequency: 330 }])
    const readings = run(slow, signal)
    const hops = Math.floor(signal.length / HOP)
    expect(readings.length).toBeGreaterThan(hops / 4)
    expect(readings.length).toBeLessThan(hops / 2)
    // The readings that are made are still current: they carry their own hop's time.
    expect(readings.at(-1)!.time).toBeGreaterThan(0.95)
  })

  it('keeps what it heard across a change of range, and forgets it on reset', () => {
    const analyser = new Analyser(SR)
    run(analyser, stream([{ seconds: 0.3, frequency: 196 }]))
    analyser.setRange(60, 1400)
    const next = analyser.push(new Float32Array(HOP), 0.3 * SR + HOP, 0.31)!
    expect(next.frequency).not.toBeNull()
    analyser.reset()
    expect(analyser.push(new Float32Array(HOP), 0, 0)!.frequency).toBeNull()
  })
})
