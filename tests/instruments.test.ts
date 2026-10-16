import { describe, expect, it } from 'vitest'
import { CHROMATIC_RANGE, INSTRUMENTS, INSTRUMENT_GROUPS, searchRange, strings } from '../src/core/instruments'
import { PitchDetector } from '../src/core/pitch'
import { equalFrequency } from '../src/core/notes'

describe('instruments', () => {
  it('lists every instrument once', () => {
    expect(new Set(INSTRUMENTS).size).toBe(INSTRUMENTS.length)
    expect(INSTRUMENT_GROUPS.flatMap(([, ids]) => ids)).toEqual([...INSTRUMENTS])
  })

  it('tunes the common instruments as players expect', () => {
    expect(strings('guitar')).toEqual([40, 45, 50, 55, 59, 64])
    expect(strings('guitar-drop-d')[0]).toBe(38)
    expect(strings('bass-5')).toEqual([23, 28, 33, 38, 43])
    expect(strings('ukulele')).toEqual([67, 60, 64, 69])
    expect(strings('violin')).toEqual([55, 62, 69, 76])
    expect(strings('cello')).toEqual([36, 43, 50, 57])
    expect(strings('erhu')).toEqual([62, 69])
    expect(strings('chromatic')).toEqual([])
  })

  it('searches a fifth below the lowest string to an octave and a fifth above the highest', () => {
    const range = searchRange(strings('guitar'), 440)
    expect(range.min).toBeCloseTo(equalFrequency(33, 440), 6)
    expect(range.max).toBeCloseTo(equalFrequency(83, 440), 6)
    expect(searchRange([], 440)).toEqual(CHROMATIC_RANGE)
    // Never below the chromatic floor, even for a 5-string bass.
    expect(searchRange(strings('bass-5'), 440).min).toBe(CHROMATIC_RANGE.min)
  })

  it('gives every instrument a detector that hears all its strings', () => {
    for (const id of INSTRUMENTS) {
      const range = searchRange(strings(id), 440)
      const detector = new PitchDetector({ sampleRate: 48000, minFrequency: range.min, maxFrequency: range.max })
      for (const midi of strings(id)) {
        const f = equalFrequency(midi, 440)
        const signal = new Float32Array(detector.bufferSize).map(
          (_, i) => 0.4 * Math.sin((2 * Math.PI * f * i) / 48000),
        )
        expect(detector.detect(signal)?.frequency, `${id} ${midi}`).toBeCloseTo(f, 2)
      }
    }
  })
})
