import { describe, expect, it } from 'vitest'
import { phaseDelta, strobeBands } from '../src/core/strobe'
import { tone } from './support/signals'

const SR = 48000

/** The same continuous tone, cut at two moments of the audio clock. */
function bandsAt(frequency: number, target: number, endFrame: number, harmonics?: number[]) {
  const length = 4096
  const signal = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const frame = endFrame - length + i
    signal[i] =
      0.5 * Math.sin((2 * Math.PI * frequency * frame) / SR) +
      0.25 * Math.sin((4 * Math.PI * frequency * frame) / SR + 1)
  }
  return strobeBands(signal, endFrame, SR, target, harmonics)
}

describe('strobe', () => {
  it('stands still when in tune', () => {
    const a = bandsAt(440, 440, 100_000)
    const b = bandsAt(440, 440, 100_000 + 4800)
    for (let k = 0; k < a.length; k++) expect(Math.abs(phaseDelta(a[k]!.phase, b[k]!.phase))).toBeLessThan(1e-3)
  })

  it('turns at k·Δf when off, forwards when sharp', () => {
    // 1 Hz sharp: over 0.1 s band 1 turns 0.1, band 2 turns 0.2.
    const a = bandsAt(441, 440, 1_000_000, [1, 2])
    const b = bandsAt(441, 440, 1_000_000 + 4800, [1, 2])
    expect(phaseDelta(a[0]!.phase, b[0]!.phase)).toBeCloseTo(0.1, 2)
    expect(phaseDelta(a[1]!.phase, b[1]!.phase)).toBeCloseTo(0.2, 2)
    const flat = [bandsAt(439, 440, 0, [1]), bandsAt(439, 440, 4800, [1])]
    expect(phaseDelta(flat[0]![0]!.phase, flat[1]![0]!.phase)).toBeCloseTo(-0.1, 2)
  })

  it('stays precise far into a long session', () => {
    const hour = SR * 3600
    const a = bandsAt(440, 440, hour)
    const b = bandsAt(440, 440, hour + 480)
    expect(Math.abs(phaseDelta(a[0]!.phase, b[0]!.phase))).toBeLessThan(1e-3)
  })

  it('reports how strong each harmonic is', () => {
    const [first, second, fourth] = bandsAt(440, 440, 50_000)
    expect(first!.strength).toBeGreaterThan(second!.strength)
    expect(second!.strength).toBeGreaterThan(0.2)
    expect(fourth!.strength).toBeLessThan(0.05)
    expect(strobeBands(new Float32Array(2048), 2048, SR, 440)[0]!.strength).toBe(0)
  })

  it('ignores harmonics above Nyquist', () => {
    expect(strobeBands(tone({ frequency: 8000 }), 8192, SR, 8000, [4])[0]!.strength).toBe(0)
  })

  it('wraps phase differences the short way round', () => {
    expect(phaseDelta(0.95, 0.05)).toBeCloseTo(0.1, 9)
    expect(phaseDelta(0.05, 0.95)).toBeCloseTo(-0.1, 9)
  })
})
