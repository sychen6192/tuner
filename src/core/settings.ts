import { INSTRUMENTS, strings, type InstrumentId } from './instruments'
import {
  ACCIDENTALS,
  DEFAULT_A4,
  NAMINGS,
  TEMPERAMENTS,
  TRANSPOSITIONS,
  clampA4,
  type AccidentalStyle,
  type Naming,
  type TemperamentId,
  type Transposition,
} from './notes'

/** Interface language; "auto" follows the browser until the user picks one. */
export const LANGUAGE_PREFERENCES = ['auto', 'zh-Hant', 'en'] as const
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]

/** ± cents counted as in tune. */
export const TOLERANCES = [1, 2, 3, 5, 10] as const
export type Tolerance = (typeof TOLERANCES)[number]

/** Reference tone voices: a pure sine, or a reed-like tone whose low notes carry on phone speakers. */
export const TONE_VOICES = ['reed', 'sine'] as const
export type ToneVoice = (typeof TONE_VOICES)[number]

export interface Settings {
  /** Reference pitch, Hz, 0.1 Hz steps. */
  a4: number
  instrument: InstrumentId
  temperament: TemperamentId
  /** Root of the temperament, pitch class 0–11 (C = 0). */
  root: number
  transposition: Transposition
  naming: Naming
  accidentals: AccidentalStyle
  tolerance: Tolerance
  /** Microphone sensitivity 0–1: higher hears quieter sounds (and more of the room). */
  sensitivity: number
  toneVoice: ToneVoice
  /** Reference tone volume, 0–1. */
  toneVolume: number
  language: LanguagePreference
}

export const STORAGE_KEY = 'tuner:settings:v1'

export function defaultSettings(): Settings {
  return {
    a4: DEFAULT_A4,
    instrument: 'chromatic',
    temperament: 'equal',
    root: 0,
    transposition: 0,
    naming: 'letter',
    accidentals: 'mixed',
    tolerance: 3,
    sensitivity: 0.6,
    toneVoice: 'reed',
    toneVolume: 0.6,
    language: 'auto',
  }
}

/** The input level gate, in dBFS, for a sensitivity setting: 0 → -30 dB, 1 → -75 dB. */
export function gateFor(sensitivity: number): number {
  return -30 - 45 * sensitivity
}

/** Strings of the chosen instrument (empty for chromatic). */
export function instrumentStrings(settings: Pick<Settings, 'instrument'>): number[] {
  return strings(settings.instrument)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneOf<T extends string | number>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

function unit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
}

/** Turn anything (e.g. JSON from localStorage written by an older version) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const defaults = defaultSettings()
  if (!isRecord(raw)) return defaults
  return {
    a4: typeof raw.a4 === 'number' ? clampA4(raw.a4) : defaults.a4,
    instrument: oneOf(INSTRUMENTS, raw.instrument, defaults.instrument),
    temperament: oneOf(TEMPERAMENTS, raw.temperament, defaults.temperament),
    root:
      typeof raw.root === 'number' && Number.isInteger(raw.root) && raw.root >= 0 && raw.root < 12
        ? raw.root
        : defaults.root,
    transposition: oneOf(TRANSPOSITIONS, raw.transposition, defaults.transposition),
    naming: oneOf(NAMINGS, raw.naming, defaults.naming),
    accidentals: oneOf(ACCIDENTALS, raw.accidentals, defaults.accidentals),
    tolerance: oneOf(TOLERANCES, raw.tolerance, defaults.tolerance),
    sensitivity: unit(raw.sensitivity, defaults.sensitivity),
    toneVoice: oneOf(TONE_VOICES, raw.toneVoice, defaults.toneVoice),
    toneVolume: unit(raw.toneVolume, defaults.toneVolume),
    language: oneOf(LANGUAGE_PREFERENCES, raw.language, defaults.language),
  }
}

/** Storage can throw (Safari private mode, disabled cookies), so failures fall back to defaults. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings {
  try {
    const json = storage?.getItem(STORAGE_KEY)
    return sanitizeSettings(json ? JSON.parse(json) : null)
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Quota exceeded or storage disabled: settings simply won't persist.
  }
}
