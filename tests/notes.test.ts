import { describe, expect, it } from 'vitest'
import {
  TEMPERAMENTS,
  centsBetween,
  clampA4,
  equalFrequency,
  formatNote,
  frequencyToMidi,
  nearestNote,
  noteFrequency,
  noteName,
  parseNote,
  temperamentOffsets,
  type NamingOptions,
} from '../src/core/notes'

const LETTER: NamingOptions = { naming: 'letter', accidentals: 'mixed', transposition: 0 }
const name = (midi: number, options: Partial<NamingOptions> = {}) =>
  formatNote(noteName(midi, { ...LETTER, ...options }))

describe('pitch', () => {
  it('converts between MIDI numbers and frequencies', () => {
    expect(equalFrequency(69, 440)).toBe(440)
    expect(equalFrequency(60, 440)).toBeCloseTo(261.626, 3)
    expect(equalFrequency(28, 440)).toBeCloseTo(41.203, 3)
    expect(frequencyToMidi(440, 440)).toBe(69)
    expect(frequencyToMidi(442, 442)).toBe(69)
    expect(centsBetween(880, 440)).toBe(1200)
  })

  it('finds the nearest note and the deviation', () => {
    const equal = temperamentOffsets('equal')
    expect(nearestNote(440, 440, equal)).toEqual({ midi: 69, cents: 0 })
    const sharp = nearestNote(440 * 2 ** (20 / 1200), 440, equal)
    expect(sharp.midi).toBe(69)
    expect(sharp.cents).toBeCloseTo(20, 9)
    expect(nearestNote(440 * 2 ** (60 / 1200), 440, equal).midi).toBe(70)
    expect(nearestNote(445, 445, equal).cents).toBeCloseTo(0, 9)
  })

  it('clamps the reference pitch to 390–490 Hz in 0.1 Hz steps', () => {
    expect(clampA4(442.34)).toBe(442.3)
    expect(clampA4(100)).toBe(390)
    expect(clampA4(1000)).toBe(490)
    expect(clampA4(Number.NaN)).toBe(440)
  })
})

describe('temperaments', () => {
  it('keeps A at the reference pitch in every temperament and root', () => {
    for (const id of TEMPERAMENTS) {
      for (let root = 0; root < 12; root++) {
        expect(temperamentOffsets(id, root)[9]).toBe(0)
        expect(noteFrequency(69, 440, temperamentOffsets(id, root))).toBeCloseTo(440, 9)
      }
    }
  })

  it('makes just intonation pure: a 5:4 third and 3:2 fifth over the root', () => {
    const offsets = temperamentOffsets('just', 0) // C major
    const c = noteFrequency(60, 440, offsets)
    expect(noteFrequency(64, 440, offsets) / c).toBeCloseTo(5 / 4, 9)
    expect(noteFrequency(67, 440, offsets) / c).toBeCloseTo(3 / 2, 9)
    // In D major, D–A is the pure fifth and the A stays at 440.
    const d = temperamentOffsets('just', 2)
    expect(440 / noteFrequency(62, 440, d)).toBeCloseTo(3 / 2, 9)
  })

  it('builds Pythagorean and meantone from pure and quarter-comma fifths', () => {
    const fifth = (id: 'pythagorean' | 'meantone') => {
      const offsets = temperamentOffsets(id, 0)
      return 1200 * Math.log2(noteFrequency(67, 440, offsets) / noteFrequency(60, 440, offsets))
    }
    expect(fifth('pythagorean')).toBeCloseTo(701.955, 3)
    expect(fifth('meantone')).toBeCloseTo(696.578, 3)
    // Quarter-comma meantone's whole point: pure major thirds.
    const meantone = temperamentOffsets('meantone', 0)
    expect(noteFrequency(64, 440, meantone) / noteFrequency(60, 440, meantone)).toBeCloseTo(5 / 4, 6)
  })

  it('matches the published Werckmeister III, Kirnberger III and Vallotti tables', () => {
    // Relative to A, as the tuner uses them (A stays at the reference pitch).
    const relC = (id: 'werckmeister3' | 'kirnberger3' | 'vallotti') => temperamentOffsets(id)[0]
    expect(relC('werckmeister3')).toBeCloseTo(11.73, 2)
    expect(relC('kirnberger3')).toBeCloseTo(10.26, 2)
    expect(relC('vallotti')).toBeCloseTo(5.87, 2)
    expect(temperamentOffsets('vallotti')[10]).toBeCloseTo(5.87, 2) // B♭ beats nothing in Vallotti
  })

  it('treats equal temperament as all zeros', () => {
    expect(temperamentOffsets('equal', 5)).toEqual(new Array(12).fill(0))
  })
})

describe('names', () => {
  it('spells with the common accidentals by default', () => {
    expect([61, 63, 66, 68, 70].map((m) => name(m))).toEqual(['C♯4', 'E♭4', 'F♯4', 'A♭4', 'B♭4'])
    expect(name(61, { accidentals: 'flat' })).toBe('D♭4')
    expect(name(70, { accidentals: 'sharp' })).toBe('A♯4')
  })

  it('uses scientific octaves', () => {
    expect(name(60)).toBe('C4')
    expect(name(59)).toBe('B3')
    expect(name(21)).toBe('A0')
    expect(name(108)).toBe('C8')
  })

  it('names notes in fixed-do solfège', () => {
    expect(name(67, { naming: 'solfege' })).toBe('Sol4')
    expect(name(71, { naming: 'solfege' })).toBe('Si4')
    expect(name(66, { naming: 'solfege' })).toBe('Fa♯4')
  })

  it('shows the written note for transposing instruments', () => {
    // A B♭ trumpet playing concert B♭3 reads C4; an alto sax playing concert E♭3 reads C4.
    expect(name(58, { transposition: 2 })).toBe('C4')
    expect(name(51, { transposition: 9 })).toBe('C4')
    expect(name(53, { transposition: 7 })).toBe('C4') // horn in F
    expect(name(57, { transposition: 3 })).toBe('C4') // clarinet in A
  })

  it('parses note names', () => {
    expect(parseNote('E2')).toBe(40)
    expect(parseNote('F#3')).toBe(54)
    expect(parseNote('Bb1')).toBe(34)
    expect(parseNote('C♯4')).toBe(61)
    expect(parseNote('B0')).toBe(23)
    expect(() => parseNote('H2')).toThrow()
  })
})
