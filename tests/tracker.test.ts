import { describe, expect, it } from 'vitest'
import { strings } from '../src/core/instruments'
import { temperamentOffsets } from '../src/core/notes'
import { PitchTracker, type TrackerConfig } from '../src/core/tracker'
import { midiToHz, random } from './support/signals'

const EQUAL = temperamentOffsets('equal')
const BASE: TrackerConfig = { a4: 440, offsets: EQUAL, strings: [], lockedString: null, tolerance: 3, gate: -60 }
const HOP = 512 / 48000

const detuned = (midi: number, cents: number) => midiToHz(midi) * 2 ** (cents / 1200)

/** Feed `seconds` of readings from a pitch function and return the tracker. */
function run(
  tracker: PitchTracker,
  from: number,
  seconds: number,
  pitch: (t: number) => number | null,
  extra: { clarity?: number; level?: number } = {},
): number {
  let t = from
  for (; t < from + seconds; t += HOP) {
    const frequency = pitch(t)
    tracker.push({ time: t, frequency, clarity: extra.clarity ?? 0.97, level: extra.level ?? -20 })
  }
  return t
}

describe('PitchTracker', () => {
  it('finds the note and the deviation, and settles into "in tune"', () => {
    const tracker = new PitchTracker(BASE)
    run(tracker, 0, 0.1, () => detuned(69, 2))
    expect(tracker.current).toMatchObject({ status: 'sounding', midi: 69, inTune: false })
    expect(tracker.current.cents).toBeCloseTo(2, 1)
    run(tracker, 0.1, 0.3, () => detuned(69, 2))
    expect(tracker.current.inTune).toBe(true)
    expect(tracker.current.target).toBeCloseTo(440, 9)
  })

  it('smooths jitter on a held note to a fraction of a cent', () => {
    const tracker = new PitchTracker(BASE)
    const rand = random(3)
    let t = run(tracker, 0, 0.5, () => detuned(57, 10 + (rand() - 0.5) * 4))
    const seen: number[] = []
    for (let i = 0; i < 100; i++, t += HOP) {
      tracker.push({ time: t, frequency: detuned(57, 10 + (rand() - 0.5) * 4), clarity: 0.97, level: -20 })
      seen.push(tracker.current.cents!)
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeLessThan(1.6) // raw spread is 4 cents
    expect(seen.reduce((a, b) => a + b) / seen.length).toBeCloseTo(10, 0)
  })

  it('holds a steady note to within a tenth of a cent at the detector noise level', () => {
    // The detector's single-frame noise on a clean note is about ±0.3 cents.
    const tracker = new PitchTracker(BASE)
    const rand = random(5)
    let t = run(tracker, 0, 1, () => detuned(57, 10 + (rand() - 0.5) * 0.6))
    const pen: number[] = []
    const figure: number[] = []
    for (let i = 0; i < 200; i++, t += HOP) {
      tracker.push({ time: t, frequency: detuned(57, 10 + (rand() - 0.5) * 0.6), clarity: 0.97, level: -20 })
      pen.push(tracker.current.cents!)
      figure.push(tracker.current.steady!)
    }
    expect((Math.max(...pen) - Math.min(...pen)) / 2).toBeLessThan(0.1)
    expect((Math.max(...figure) - Math.min(...figure)) / 2).toBeLessThan(0.1)
  })

  it('follows a turning peg without lagging behind', () => {
    const tracker = new PitchTracker(BASE)
    // Sweeping up 40 cents per second, as when tightening a string, then stopping at +10.
    const sweep = (t: number) => detuned(64, -30 + 40 * Math.min(t, 1))
    let t = run(tracker, 0, 1 - HOP, sweep)
    expect(tracker.current.cents).toBeGreaterThan(8) // about 25 ms behind
    t = run(tracker, t, 0.1, sweep)
    expect(Math.abs(tracker.current.cents! - 10)).toBeLessThan(0.3)
    // The steady figure is with it a moment later.
    run(tracker, t, 0.3, sweep)
    expect(Math.abs(tracker.current.steady! - 10)).toBeLessThan(0.5)
  })

  it('ignores a single stray frame but follows a real change of note', () => {
    const tracker = new PitchTracker(BASE)
    let t = run(tracker, 0, 0.3, () => detuned(69, 0))
    tracker.push({ time: t, frequency: detuned(81, 0), clarity: 0.95, level: -20 }) // octave slip
    expect(tracker.current.midi).toBe(69)
    t = run(tracker, t + HOP, 0.05, () => detuned(72, 5))
    expect(tracker.current.midi).toBe(72)
    expect(tracker.current.cents).toBeCloseTo(5, 0)
  })

  it('judges vibrato by its centre: in tune when it swings evenly around the note', () => {
    const tracker = new PitchTracker(BASE)
    const vibrato = (centre: number) => (t: number) => detuned(67, centre + 15 * Math.sin(2 * Math.PI * 5.5 * t))
    let t = run(tracker, 0, 1.5, vibrato(1))
    expect(Math.abs(tracker.current.steady! - 1)).toBeLessThan(1.5)
    expect(Math.abs(tracker.current.cents!)).toBeGreaterThan(0) // the live pitch still swings
    expect(tracker.current.inTune).toBe(true)
    run(tracker, t, 1.5, vibrato(9))
    expect(tracker.current.inTune).toBe(false)
    expect(tracker.current.steady).toBeCloseTo(9, -0.5)
  })

  it('does not flicker between neighbours halfway between notes', () => {
    const tracker = new PitchTracker(BASE)
    const notes = new Set<number>()
    let t = run(tracker, 0, 0.2, () => detuned(69, 45))
    for (let i = 0; i < 100; i++, t += HOP) {
      tracker.push({ time: t, frequency: detuned(69, 50 + 4 * Math.sin(i)), clarity: 0.97, level: -20 })
      notes.add(tracker.current.midi!)
    }
    expect([...notes]).toEqual([69])
  })

  it('holds the last note after the sound stops, then lets it go', () => {
    const tracker = new PitchTracker(BASE)
    let t = run(tracker, 0, 0.5, () => detuned(64, 1))
    expect(tracker.current.inTune).toBe(true)
    t = run(tracker, t, 1, () => null)
    expect(tracker.current).toMatchObject({ status: 'held', midi: 64, inTune: true })
    run(tracker, t, 2, () => null)
    expect(tracker.current).toMatchObject({ status: 'waiting', midi: null, cents: null, inTune: false })
  })

  it('gates quiet and unclear input, with hysteresis', () => {
    const tracker = new PitchTracker(BASE)
    let t = run(tracker, 0, 0.2, () => 440, { level: -65 })
    expect(tracker.current.status).toBe('waiting')
    t = run(tracker, t, 0.2, () => 440, { clarity: 0.8 })
    expect(tracker.current.status).toBe('waiting')
    t = run(tracker, t, 0.2, () => 440)
    expect(tracker.current.status).toBe('sounding')
    // A fading note stays heard a little below the gate and at lower clarity.
    run(tracker, t, 0.2, () => 440, { level: -64, clarity: 0.8 })
    expect(tracker.current.status).toBe('sounding')
  })

  it('picks the nearest string, and the locked one when chosen', () => {
    const guitar = strings('guitar')
    const tracker = new PitchTracker({ ...BASE, strings: guitar })
    run(tracker, 0, 0.2, () => detuned(45, -20))
    expect(tracker.current).toMatchObject({ string: 1, midi: 45 })
    expect(tracker.current.cents).toBeCloseTo(-20, 0)

    // Locked to the low E while playing a flat A: measured against E, far sharp.
    tracker.configure({ ...BASE, strings: guitar, lockedString: 0 })
    expect(tracker.current).toMatchObject({ string: 0, midi: 40 })
    expect(tracker.current.cents).toBeCloseTo(480, 0)
  })

  it('shows a note far from every string as itself', () => {
    const tracker = new PitchTracker({ ...BASE, strings: strings('guitar') })
    run(tracker, 0, 0.2, () => detuned(69, 12)) // A4: a fourth above the top string
    expect(tracker.current).toMatchObject({ string: null, midi: 69 })
    expect(tracker.current.cents).toBeCloseTo(12, 0)
  })

  it('does not flicker between a string and a note three semitones beyond it', () => {
    const rand = random(11)
    for (const offset of [-2, 0, 2]) {
      const tracker = new PitchTracker({ ...BASE, strings: strings('guitar') })
      const seen = new Set<string>()
      let t = run(tracker, 0, 0.3, () => detuned(67, offset))
      for (let i = 0; i < 200; i++, t += HOP) {
        tracker.push({ time: t, frequency: detuned(67, offset + (rand() - 0.5)), clarity: 0.97, level: -20 })
        seen.add(`${tracker.current.string}/${tracker.current.midi}`)
      }
      expect([...seen], `G4 ${offset} cents`).toEqual(['null/67'])
      expect(tracker.current.inTune).toBe(true)
    }
  })

  it('switches notes past the true midpoint in unequal temperaments', () => {
    // Quarter-comma meantone: C to C♯ is a 76-cent chromatic semitone.
    const meantone = temperamentOffsets('meantone', 0)
    const tracker = new PitchTracker({ ...BASE, offsets: meantone })
    const c4 = 440 * 2 ** ((meantone[0]! - 900) / 1200)
    const cSharp4 = 440 * 2 ** ((meantone[1]! - 800) / 1200)
    let t = run(tracker, 0, 0.3, () => c4)
    expect(tracker.current.midi).toBe(60)
    // Glide up to 20 cents below C♯: well past the midpoint (38 cents above C).
    t = run(
      tracker,
      t,
      0.5,
      (time) => c4 * 2 ** ((Math.min(1, (time - t) / 0.4) * (1200 * Math.log2(cSharp4 / c4) - 20)) / 1200),
    )
    expect(tracker.current.midi).toBe(61)
  })

  it('measures against the temperament and the reference pitch', () => {
    const just = temperamentOffsets('just', 0)
    const tracker = new PitchTracker({ ...BASE, offsets: just })
    // A pure major third above C4 (C4 itself sits at A440 minus a just sixth).
    const e = 440 * (3 / 5) * (5 / 4)
    run(tracker, 0, 0.3, () => e)
    expect(tracker.current.midi).toBe(64)
    expect(Math.abs(tracker.current.cents!)).toBeLessThan(0.1)

    tracker.configure({ ...BASE, a4: 442 })
    run(tracker, 1, 0.3, () => 442)
    expect(tracker.current).toMatchObject({ midi: 69 })
    expect(Math.abs(tracker.current.cents!)).toBeLessThan(0.1)
  })

  it('starts from nothing after reset', () => {
    const tracker = new PitchTracker(BASE)
    run(tracker, 0, 0.2, () => 440)
    tracker.reset()
    expect(tracker.current).toMatchObject({ status: 'waiting', midi: null })
  })
})
