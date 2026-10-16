import { parseNote } from './notes'

/**
 * Instruments and their tunings, low string first. "chromatic" has no strings: any note is
 * the target. Strings also narrow the pitch search to the instrument, which keeps a low string
 * from ever being read an octave off.
 */
export const INSTRUMENT_GROUPS = [
  ['chromatic', ['chromatic']],
  [
    'guitar',
    ['guitar', 'guitar-drop-d', 'guitar-half-down', 'guitar-dadgad', 'guitar-open-g', 'guitar-open-d', 'guitar-7'],
  ],
  ['bass', ['bass', 'bass-5']],
  ['ukulele', ['ukulele', 'ukulele-low-g', 'ukulele-baritone']],
  ['strings', ['violin', 'viola', 'cello', 'double-bass']],
  ['folk', ['mandolin', 'banjo', 'erhu', 'pipa']],
] as const

export type InstrumentGroup = (typeof INSTRUMENT_GROUPS)[number][0]
export type InstrumentId = (typeof INSTRUMENT_GROUPS)[number][1][number]

const TUNINGS: Record<InstrumentId, string> = {
  chromatic: '',
  guitar: 'E2 A2 D3 G3 B3 E4',
  'guitar-drop-d': 'D2 A2 D3 G3 B3 E4',
  'guitar-half-down': 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4',
  'guitar-dadgad': 'D2 A2 D3 G3 A3 D4',
  'guitar-open-g': 'D2 G2 D3 G3 B3 D4',
  'guitar-open-d': 'D2 A2 D3 F#3 A3 D4',
  'guitar-7': 'B1 E2 A2 D3 G3 B3 E4',
  bass: 'E1 A1 D2 G2',
  'bass-5': 'B0 E1 A1 D2 G2',
  // Re-entrant: the G string is above C, so the strings are listed as they lie, not by pitch.
  ukulele: 'G4 C4 E4 A4',
  'ukulele-low-g': 'G3 C4 E4 A4',
  'ukulele-baritone': 'D3 G3 B3 E4',
  violin: 'G3 D4 A4 E5',
  viola: 'C3 G3 D4 A4',
  cello: 'C2 G2 D3 A3',
  'double-bass': 'E1 A1 D2 G2',
  mandolin: 'G3 D4 A4 E5',
  // 5-string open G: the short 5th string (G4) comes first.
  banjo: 'G4 D3 G3 B3 D4',
  erhu: 'D4 A4',
  pipa: 'A2 D3 E3 A3',
}

export const INSTRUMENTS = INSTRUMENT_GROUPS.flatMap(([, ids]) => ids) as readonly InstrumentId[]

/** MIDI numbers of the instrument's strings, in playing order. */
export function strings(id: InstrumentId): number[] {
  const tuning = TUNINGS[id]
  return tuning ? tuning.split(' ').map(parseNote) : []
}

/** Lowest audible fundamental of anything a tuner meets (A0 is 27.5 Hz; 5-string bass B0 30.9). */
export const CHROMATIC_RANGE = { min: 26, max: 4500 } as const

/**
 * Pitch search range in Hz: a fifth below the lowest string (drop tunings, a slack string) to an
 * octave and a fifth above the highest (harmonics at the 12th and 7th frets).
 */
export function searchRange(midis: readonly number[], a4: number): { min: number; max: number } {
  if (midis.length === 0) return { ...CHROMATIC_RANGE }
  const hz = (midi: number) => a4 * 2 ** ((midi - 69) / 12)
  const low = Math.min(...midis)
  const high = Math.max(...midis)
  return {
    min: Math.max(CHROMATIC_RANGE.min, hz(low - 7)),
    max: Math.min(CHROMATIC_RANGE.max, hz(high + 19)),
  }
}
