import { describe, expect, it } from 'vitest'
import { calibrate } from '../src/core/calibrate'

const readings = (frequency: number, count = 60, wobble = 0.5) =>
  Array.from({ length: count }, (_, i) => frequency * 2 ** ((wobble * Math.sin(i)) / 1200))

describe('calibrate', () => {
  it('takes the A it hears as the new A4, in any octave', () => {
    expect(calibrate(readings(442))).toBe(442)
    expect(calibrate(readings(415.3))).toBe(415.3)
    expect(calibrate(readings(221))).toBe(442)
    expect(calibrate(readings(1720))).toBe(430)
  })

  it('ignores a few stray readings', () => {
    expect(calibrate([...readings(443), 300, 700])).toBe(443)
  })

  it('needs enough steady readings', () => {
    expect(calibrate(readings(442, 10))).toBeNull()
    expect(calibrate(readings(442, 60, 30))).toBeNull()
  })

  it('refuses a note that cannot be an A in the reference range', () => {
    expect(calibrate(readings(329.6))).toBeNull() // E4: folds to 659, outside 390–490
    expect(calibrate(readings(Number.NaN))).toBeNull()
  })
})
