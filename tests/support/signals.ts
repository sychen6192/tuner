/** Deterministic test signals: tones with chosen harmonics, decay, vibrato and noise. */

export interface ToneOptions {
  frequency: number
  sampleRate?: number
  /** Length in samples. */
  length?: number
  /** Amplitude of each harmonic, fundamental first. Default: a pure sine. */
  harmonics?: readonly number[]
  /** Decay time constant in seconds (plucked strings); 0 for none. */
  decay?: number
  /** White-noise amplitude relative to a full-scale sine. */
  noise?: number
  /** Vibrato depth in cents and rate in Hz. */
  vibrato?: { cents: number; rate: number }
  /** Inharmonicity coefficient B (stiff strings): partial k sits at k·f·√(1 + B·k²). */
  inharmonicity?: number
  amplitude?: number
  seed?: number
}

/** Small seeded PRNG (mulberry32) so failures reproduce. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function tone(options: ToneOptions): Float32Array {
  const {
    frequency,
    sampleRate = 48000,
    length = 8192,
    harmonics = [1],
    decay = 0,
    noise = 0,
    vibrato,
    inharmonicity = 0,
    amplitude = 0.5,
    seed = 1,
  } = options
  const rand = random(seed)
  const phases = harmonics.map(() => rand() * 2 * Math.PI)
  const norm = harmonics.reduce((sum, a) => sum + Math.abs(a), 0) || 1
  const out = new Float32Array(length)
  let phase = 0
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const bend = vibrato ? 2 ** ((vibrato.cents * Math.sin(2 * Math.PI * vibrato.rate * t)) / 1200) : 1
    phase += (2 * Math.PI * frequency * bend) / sampleRate
    let v = 0
    harmonics.forEach((a, k) => {
      const partial = (k + 1) * Math.sqrt(1 + inharmonicity * (k + 1) ** 2)
      v += a * Math.sin(partial * phase + phases[k]!)
    })
    const envelope = decay > 0 ? Math.exp(-t / decay) : 1
    out[i] = (amplitude * envelope * v) / norm + noise * (rand() * 2 - 1)
  }
  return out
}

export const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected)

export const midiToHz = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12)
