import type { ToneVoice } from '../core/settings'
import { useAudioSession } from '../platform/audioSession'

/** Attack and release, seconds: soft enough not to click, quick enough to feel immediate. */
const ATTACK = 0.04
const RELEASE = 0.12
/** Pitch glides this fast (time constant) when the note changes while sounding. */
const GLIDE = 0.015

/**
 * Harmonic amplitudes of the reed voice, like a pitch pipe or a soft organ reed. A sine at E1
 * (41 Hz) is all but silent on a phone speaker; these harmonics carry the pitch where the
 * fundamental can't be reproduced, and the ear still hears the fundamental.
 */
const REED = [0, 1, 0.62, 0.48, 0.32, 0.24, 0.16, 0.11, 0.07, 0.05, 0.03]

/** Perceived loudness is roughly logarithmic; squaring makes the slider feel even. */
const volumeToGain = (volume: number) => 0.45 * volume * volume

/** A sustained reference note to tune by ear (a drone), in the tuner's temperament. */
export class ReferenceTone {
  private oscillator: OscillatorNode | null = null
  private envelope: GainNode | null = null
  private voice: ToneVoice = 'reed'
  private frequency = 440

  constructor(
    private readonly context: () => AudioContext,
    /** Called once the tone has stopped, so the device can sleep. */
    private readonly onIdle: () => void,
  ) {}

  get playing(): boolean {
    return this.oscillator !== null
  }

  /** Start sounding (from a user gesture), or move to a new note if already sounding. */
  async play(frequency: number, voice: ToneVoice, volume: number): Promise<void> {
    if (this.oscillator && voice === this.voice) {
      this.setFrequency(frequency)
      this.setVolume(volume)
      return
    }
    this.stop(0.03)
    this.frequency = frequency
    this.voice = voice
    // Sound even with the ring/silent switch on (iOS).
    useAudioSession('playback')
    const ctx = this.context()
    const resumed = ctx.resume()
    const oscillator = ctx.createOscillator()
    if (voice === 'reed') {
      const imag = new Float32Array(REED.length)
      oscillator.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(REED), imag))
    }
    oscillator.frequency.value = frequency
    const envelope = ctx.createGain()
    envelope.gain.value = 0
    oscillator.connect(envelope).connect(ctx.destination)
    this.oscillator = oscillator
    this.envelope = envelope
    await resumed
    if (this.oscillator !== oscillator) return // stopped while resuming
    const now = ctx.currentTime
    oscillator.start(now)
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(volumeToGain(volume), now + ATTACK)
  }

  setFrequency(frequency: number): void {
    this.frequency = frequency
    if (!this.oscillator) return
    const ctx = this.context()
    this.oscillator.frequency.setTargetAtTime(frequency, ctx.currentTime, GLIDE)
  }

  setVolume(volume: number): void {
    if (!this.envelope) return
    const ctx = this.context()
    this.envelope.gain.setTargetAtTime(volumeToGain(volume), ctx.currentTime, 0.02)
  }

  get currentFrequency(): number {
    return this.frequency
  }

  stop(release = RELEASE): void {
    const oscillator = this.oscillator
    const envelope = this.envelope
    if (!oscillator || !envelope) return
    this.oscillator = null
    this.envelope = null
    const ctx = this.context()
    const now = ctx.currentTime
    envelope.gain.cancelScheduledValues(now)
    envelope.gain.setValueAtTime(envelope.gain.value, now)
    envelope.gain.linearRampToValueAtTime(0, now + release)
    try {
      oscillator.stop(now + release + 0.02)
    } catch {
      // Never started (the context was still resuming): nothing is sounding.
    }
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    this.onIdle()
  }
}
