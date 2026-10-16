import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  defaultSettings,
  gateFor,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from '../src/core/settings'

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings())
    expect(sanitizeSettings('nope')).toEqual(defaultSettings())
    expect(sanitizeSettings([1, 2])).toEqual(defaultSettings())
  })

  it('clamps numbers and rejects unknown options', () => {
    expect(
      sanitizeSettings({
        a4: 1000,
        instrument: 'kazoo',
        temperament: 'wonky',
        root: 12,
        transposition: 5,
        naming: 'german',
        accidentals: 'double',
        tolerance: 4,
        sensitivity: 3,
        toneVoice: 'saw',
        toneVolume: -1,
        letterShortcuts: 'no',
      }),
    ).toEqual({ ...defaultSettings(), a4: 490, sensitivity: 1, toneVolume: 0 })
  })

  it('keeps valid values', () => {
    const settings = {
      ...defaultSettings(),
      a4: 415.3,
      instrument: 'cello' as const,
      temperament: 'just' as const,
      root: 7,
      transposition: 9 as const,
      naming: 'solfege' as const,
      accidentals: 'flat' as const,
      tolerance: 1 as const,
      toneVoice: 'sine' as const,
      letterShortcuts: false,
      language: 'en' as const,
    }
    expect(sanitizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })
})

describe('storage', () => {
  it('round-trips settings and survives broken storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    saveSettings(storage, { ...defaultSettings(), a4: 442 })
    expect(store.has(STORAGE_KEY)).toBe(true)
    expect(loadSettings(storage).a4).toBe(442)
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadSettings(broken)).toEqual(defaultSettings())
    expect(() => saveSettings(broken, defaultSettings())).not.toThrow()
    store.set(STORAGE_KEY, '{not json')
    expect(loadSettings(storage)).toEqual(defaultSettings())
  })
})

describe('gateFor', () => {
  it('maps sensitivity to a level gate', () => {
    expect(gateFor(0)).toBe(-30)
    expect(gateFor(1)).toBe(-75)
  })
})
