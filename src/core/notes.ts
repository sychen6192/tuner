/**
 * Notes, temperaments and naming. Pitches are MIDI numbers (A4 = 69, middle C = C4 = 60).
 * Frequencies are concert pitch; transposition only changes what a note is called.
 */

export const DEFAULT_A4 = 440
/** Peterson's range: Baroque A = 415, modern orchestras 440–446, early pitches lower and higher. */
export const MIN_A4 = 390
export const MAX_A4 = 490

export function clampA4(a4: number): number {
  if (!Number.isFinite(a4)) return DEFAULT_A4
  return Math.min(MAX_A4, Math.max(MIN_A4, Math.round(a4 * 10) / 10))
}

// ---------------------------------------------------------------------------------------------
// Temperaments

export const TEMPERAMENTS = [
  'equal',
  'just',
  'pythagorean',
  'meantone',
  'werckmeister3',
  'kirnberger3',
  'vallotti',
] as const
export type TemperamentId = (typeof TEMPERAMENTS)[number]

const PURE_FIFTH = 1200 * Math.log2(3 / 2)
const SYNTONIC_COMMA = 1200 * Math.log2(81 / 80)

/** Cents above the root of each pitch class, from a chain of equal fifths E♭…G♯. */
function chainOfFifths(fifth: number): number[] {
  const steps = [0, 7, 2, -3, 4, -1, 6, 1, 8, 3, -2, 5] // fifths from the root, per pitch class
  return steps.map((n) => (((n * fifth) % 1200) + 1200) % 1200)
}

/** 5-limit just intonation of the major scale, with the usual chromatic ratios. */
const JUST_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]

/** Well temperaments as published, cents from equal temperament with C = 0. */
const WELL: Record<'werckmeister3' | 'kirnberger3' | 'vallotti', readonly number[]> = {
  // Andreas Werckmeister, Musicalische Temperatur (1691): ¼ comma on C–G, G–D, D–A and B–F♯.
  werckmeister3: [0, -9.78, -7.82, -5.87, -9.78, -1.96, -11.73, -3.91, -7.82, -11.73, -3.91, -7.82],
  // Johann Philipp Kirnberger (1779): pure C–E, ¼ comma on C–G–D–A–E.
  kirnberger3: [0, -9.78, -6.84, -5.87, -13.69, -1.96, -9.78, -3.42, -7.82, -10.26, -3.91, -11.73],
  // Francesco Vallotti: ⅙ comma on the six fifths F–C–G–D–A–E–B.
  vallotti: [0, -5.87, -3.91, -1.96, -7.82, 1.96, -7.82, -1.96, -3.91, -5.87, 0, -9.78],
}

/** Fixed well temperaments are laid out from C; the others are built on the chosen root. */
export function temperamentHasRoot(id: TemperamentId): boolean {
  return id === 'just' || id === 'pythagorean' || id === 'meantone'
}

/**
 * Deviation of each pitch class (index 0 = C) from equal temperament in cents, for a temperament
 * built on `root`. Normalised so that A has none: the reference pitch (A4 = 440) always sounds as
 * set, and the temperament decides everything else relative to it.
 */
export function temperamentOffsets(id: TemperamentId, root = 0): number[] {
  let fromC: number[]
  switch (id) {
    case 'equal':
      return new Array<number>(12).fill(0)
    case 'werckmeister3':
    case 'kirnberger3':
    case 'vallotti':
      fromC = [...WELL[id]]
      break
    default: {
      const aboveRoot =
        id === 'just'
          ? JUST_RATIOS.map((r) => 1200 * Math.log2(r))
          : chainOfFifths(id === 'pythagorean' ? PURE_FIFTH : PURE_FIFTH - SYNTONIC_COMMA / 4)
      fromC = Array.from({ length: 12 }, (_, pc) => {
        const degree = (pc - root + 12) % 12
        return aboveRoot[degree]! - degree * 100
      })
    }
  }
  const a = fromC[9]!
  return fromC.map((c) => c - a)
}

// ---------------------------------------------------------------------------------------------
// Pitch

/** Equal-tempered frequency of a MIDI note. */
export function equalFrequency(midi: number, a4: number): number {
  return a4 * 2 ** ((midi - 69) / 12)
}

/** Target frequency of a MIDI note in a temperament (offsets from temperamentOffsets). */
export function noteFrequency(midi: number, a4: number, offsets: readonly number[]): number {
  return equalFrequency(midi, a4) * 2 ** ((offsets[pitchClass(midi)] ?? 0) / 1200)
}

/** Fractional MIDI number of a frequency in equal temperament. */
export function frequencyToMidi(frequency: number, a4: number): number {
  return 69 + 12 * Math.log2(frequency / a4)
}

export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference)
}

export const pitchClass = (midi: number) => ((Math.round(midi) % 12) + 12) % 12

/** The tempered note a frequency is closest to, and how far from it, in cents. */
export function nearestNote(
  frequency: number,
  a4: number,
  offsets: readonly number[],
): { midi: number; cents: number } {
  const approx = Math.round(frequencyToMidi(frequency, a4))
  let best = { midi: approx, cents: Infinity }
  for (const midi of [approx - 1, approx, approx + 1]) {
    const cents = centsBetween(frequency, noteFrequency(midi, a4, offsets))
    if (Math.abs(cents) < Math.abs(best.cents)) best = { midi, cents }
  }
  return best
}

// ---------------------------------------------------------------------------------------------
// Names

export const NAMINGS = ['letter', 'solfege'] as const
export type Naming = (typeof NAMINGS)[number]

export const ACCIDENTALS = ['mixed', 'sharp', 'flat'] as const
export type AccidentalStyle = (typeof ACCIDENTALS)[number]

/**
 * Transposing instruments: how many semitones the written note sits above the sounding one.
 * A B♭ trumpet reading C sounds B♭, so written = concert + 2.
 */
export const TRANSPOSITIONS = [0, 2, 3, 7, 9] as const
export type Transposition = (typeof TRANSPOSITIONS)[number]
/** Key of each transposition, as a pitch class (C, B♭, A, F, E♭). */
export const TRANSPOSITION_KEY: Record<Transposition, number> = { 0: 0, 2: 10, 3: 9, 7: 5, 9: 3 }

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'] as const

/** Natural step (0 = C … 6 = B) and accidental (+1 sharp, -1 flat) of each pitch class, from names. */
function spelling(names: string): ReadonlyArray<readonly [number, -1 | 0 | 1]> {
  return names.split(' ').map((name) => {
    const step = LETTERS.indexOf(name[0] as (typeof LETTERS)[number])
    return [step, name[1] === '♯' ? 1 : name[1] === '♭' ? -1 : 0] as const
  })
}

/** How each pitch class (from C) is spelled; "mixed" is what players meet most. */
const SPELLINGS: Record<AccidentalStyle, ReadonlyArray<readonly [number, -1 | 0 | 1]>> = {
  mixed: spelling('C C♯ D E♭ E F F♯ G A♭ A B♭ B'),
  sharp: spelling('C C♯ D D♯ E F F♯ G G♯ A A♯ B'),
  flat: spelling('C D♭ D E♭ E F G♭ G A♭ A B♭ B'),
}

export interface NoteName {
  /** Letter or syllable: "A", "Sol". */
  step: string
  /** -1 flat, 0 natural, 1 sharp. */
  accidental: -1 | 0 | 1
  /** Scientific octave: C4 is middle C (C♭ and B♯ never appear, so it is always the MIDI one). */
  octave: number
}

export interface NamingOptions {
  naming: Naming
  accidentals: AccidentalStyle
  transposition: Transposition
}

export function noteName(midi: number, options: NamingOptions): NoteName {
  const written = Math.round(midi) + options.transposition
  const pc = pitchClass(written)
  const [step, accidental] = SPELLINGS[options.accidentals][pc]!
  return {
    step: (options.naming === 'solfege' ? SOLFEGE : LETTERS)[step]!,
    accidental,
    octave: Math.floor(written / 12) - 1,
  }
}

/** Plain-text name, e.g. "F♯3", for labels and tests. */
export function formatNote(name: NoteName, withOctave = true): string {
  const sign = name.accidental === 1 ? '♯' : name.accidental === -1 ? '♭' : ''
  return `${name.step}${sign}${withOctave ? name.octave : ''}`
}

/** Parse "E2", "F#3", "Bb1", "C♯4" into a MIDI number. */
export function parseNote(text: string): number {
  const match = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(text.trim())
  if (!match) throw new Error(`Not a note: ${text}`)
  const [, letter, accidental, octave] = match
  const base = [0, 2, 4, 5, 7, 9, 11][LETTERS.indexOf(letter!.toUpperCase() as (typeof LETTERS)[number])]!
  const shift = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0
  return (Number(octave) + 1) * 12 + base + shift
}
