import { centsBetween, nearestNote, noteFrequency } from './notes'

/**
 * Turns raw per-frame pitch readings into what the tuner shows: which note (or string) is being
 * tuned, how far off it is, and whether it is in tune. The aim is a reading that is steady on a
 * held note yet follows a change of note at once:
 *
 * - A gate on level and clarity, with hysteresis, so the tuner neither wakes on room noise nor
 *   drops a decaying string early.
 * - A single stray frame (a pick scrape, an octave slip) is ignored; a new pitch that persists
 *   for a few frames is a new note, and the smoothing restarts there instead of gliding to it.
 * - Within a note, the One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass whose
 *   cutoff rises with the speed of change, so a still note is heavily smoothed while vibrato and
 *   a turning peg are followed without lag.
 * - A second, steady reading for the figures and the in-tune verdict: over the last 0.5 s it is
 *   the average where the pitch swings (vibrato is judged by its centre, as the ear judges it) and
 *   the live pitch where it moves one way (a turning peg is followed without lag).
 * - Hysteresis on the target note and string, so a pitch halfway between two never flickers.
 * - "In tune" only after the steady pitch has stayed within the tolerance for a moment.
 * - In instrument mode, a note far from every string is shown as the note it is, not as a string
 *   five semitones out.
 */

export interface Reading {
  /** Seconds, on any steadily increasing clock (the audio clock). */
  time: number
  /** Detected fundamental in Hz, or null when nothing periodic was found. */
  frequency: number | null
  /** Periodicity of the detection, 0–1. */
  clarity: number
  /** Input level in dBFS. */
  level: number
}

export interface TrackerConfig {
  a4: number
  /** Temperament offsets per pitch class (notes.temperamentOffsets). */
  offsets: readonly number[]
  /** MIDI numbers of the instrument's strings; empty for chromatic. */
  strings: readonly number[]
  /** Index of the string chosen by hand, or null to follow whichever is played. */
  lockedString: number | null
  /** ± cents counted as in tune. */
  tolerance: number
  /** Level below which input is ignored, in dBFS. */
  gate: number
}

export type TunerStatus = 'waiting' | 'sounding' | 'held'

export interface TunerState {
  /** waiting: nothing heard yet (or for a while); sounding: a note now; held: the last note. */
  status: TunerStatus
  /** The note being tuned to, as a MIDI number. */
  midi: number | null
  /** Index of that string, in instrument mode. */
  string: number | null
  /** Measured frequency at the pitch's centre, Hz. */
  frequency: number | null
  /** Target frequency of the note, Hz. */
  target: number | null
  /** Smoothed deviation from the target, cents: the live pitch, vibrato and all. */
  cents: number | null
  /** The pitch's centre, cents from the target: what the figures show and "in tune" judges. */
  steady: number | null
  clarity: number
  level: number
  inTune: boolean
}

/** Clarity needed to start a note, and to keep one going. */
const START_CLARITY = 0.88
const KEEP_CLARITY = 0.75
/** The gate closes this far below where it opens. */
const GATE_HYSTERESIS = 8
/** A jump larger than this (cents) is either a stray frame or a new note. */
const JUMP = 60
/** Frames a jump must persist to count as a new note. */
const NEW_NOTE_FRAMES = 3
/** Readings agreeing within this (cents) are the same new note. */
const SAME_NOTE = 35
/** How long the last note stays on screen after the sound stops, seconds. */
const HOLD_TIME = 2.5
/** The pitch must sit within tolerance this long before it counts as in tune, seconds. */
const SETTLE_TIME = 0.25
/** Cents past the halfway point before the target switches to the neighbouring note. */
const NOTE_HYSTERESIS = 8
/** A different string takes over only when it is this much closer, cents. */
const STRING_HYSTERESIS = 40
/** Beyond this distance from every string, a note is shown as itself, cents. */
const STRING_REACH = 300
/** The steady reading looks back this far, seconds: a few cycles of any vibrato. */
const STEADY_WINDOW = 0.5

/** One Euro filter, on pitch in cents. Parameters tuned at ~90 readings/s. */
const MIN_CUTOFF = 0.5
const BETA = 0.05
const D_CUTOFF = 1

class OneEuro {
  private x: number | null = null
  private dx = 0
  private t = 0

  reset(): void {
    this.x = null
  }

  filter(value: number, time: number): number {
    if (this.x === null) {
      this.x = value
      this.dx = 0
      this.t = time
      return value
    }
    const dt = Math.max(1e-4, time - this.t)
    this.t = time
    const rawDx = (value - this.x) / dt
    this.dx += smoothing(D_CUTOFF, dt) * (rawDx - this.dx)
    const cutoff = MIN_CUTOFF + BETA * Math.abs(this.dx)
    this.x += smoothing(cutoff, dt) * (value - this.x)
    return this.x
  }
}

const smoothing = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))

/**
 * The centre of a pitch that may swing: a Hann-weighted average of the last half second (which
 * cancels a vibrato's swing whatever its rate), pulled towards the latest value by how
 * one-directional the movement was: net change over distance travelled, squared.
 */
class Steady {
  private times: number[] = []
  private values: number[] = []

  reset(): void {
    this.times = []
    this.values = []
  }

  add(value: number, time: number): number {
    this.times.push(time)
    this.values.push(value)
    let drop = 0
    while (drop < this.times.length - 1 && time - this.times[drop]! > STEADY_WINDOW) drop++
    if (drop > 0) {
      this.times.splice(0, drop)
      this.values.splice(0, drop)
    }
    const n = this.values.length
    if (n < 3) return value
    let sum = 0
    let weights = 0
    let travelled = 0
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / (n + 1))
      sum += w * this.values[i]!
      weights += w
      if (i > 0) travelled += Math.abs(this.values[i]! - this.values[i - 1]!)
    }
    const mean = sum / weights
    if (travelled < 1e-9) return value
    const direction = (Math.abs(value - this.values[0]!) / travelled) ** 2
    return mean + (value - mean) * direction
  }
}

const EMPTY: TunerState = {
  status: 'waiting',
  midi: null,
  string: null,
  frequency: null,
  target: null,
  cents: null,
  steady: null,
  clarity: 0,
  level: -Infinity,
  inTune: false,
}

export class PitchTracker {
  private state: TunerState = { ...EMPTY }
  private readonly euro = new OneEuro()
  private readonly centre = new Steady()
  /** Smoothed pitch in cents relative to A4. */
  private pitch: number | null = null
  /** Its steady centre, in cents relative to A4. */
  private steadyPitch: number | null = null
  private pending: number[] = []
  private lastSound = -Infinity
  private inTuneSince: number | null = null

  constructor(private config: TrackerConfig) {}

  get current(): TunerState {
    return this.state
  }

  /** Change settings; the note being tracked carries on, retargeted. */
  configure(config: TrackerConfig): void {
    const retarget =
      config.a4 !== this.config.a4 ||
      config.offsets !== this.config.offsets ||
      config.strings !== this.config.strings ||
      config.lockedString !== this.config.lockedString
    this.config = config
    if (retarget) {
      this.state = { ...this.state, midi: null, string: null }
      this.inTuneSince = null
      if (this.pitch !== null) {
        this.retarget(this.lastSound)
        // A held note was never measured against the new target, so it can't be in tune with it.
        if (this.state.status !== 'sounding') this.state = { ...this.state, inTune: false }
      }
    }
  }

  reset(): void {
    this.state = { ...EMPTY }
    this.euro.reset()
    this.centre.reset()
    this.pitch = null
    this.steadyPitch = null
    this.pending = []
    this.lastSound = -Infinity
    this.inTuneSince = null
  }

  push(reading: Reading): TunerState {
    const sounding = this.state.status === 'sounding'
    const gate = sounding ? this.config.gate - GATE_HYSTERESIS : this.config.gate
    const clarity = sounding ? KEEP_CLARITY : START_CLARITY
    const valid =
      reading.frequency !== null && reading.frequency > 0 && reading.level >= gate && reading.clarity >= clarity

    if (!valid) return this.silence(reading)

    const pitch = 1200 * Math.log2(reading.frequency! / this.config.a4)
    if (this.pitch === null || !sounding) {
      // A note begins (or resumes after a pause): no history to protect, take it at once.
      if (this.pitch === null || Math.abs(pitch - this.pitch) > JUMP) {
        this.euro.reset()
        this.centre.reset()
      }
      this.pending = []
      this.pitch = this.euro.filter(pitch, reading.time)
    } else if (Math.abs(pitch - this.pitch) > JUMP) {
      // A stray frame, or the first frames of a new note: wait to see which.
      if (this.pending.length > 0 && Math.abs(pitch - this.pending[0]!) > SAME_NOTE) this.pending = []
      this.pending.push(pitch)
      if (this.pending.length < NEW_NOTE_FRAMES) return this.keep(reading)
      this.euro.reset()
      this.centre.reset()
      for (const p of this.pending) this.pitch = this.euro.filter(p, reading.time)
      this.pending = []
      this.state = { ...this.state, midi: null, string: null }
      this.inTuneSince = null
    } else {
      this.pending = []
      this.pitch = this.euro.filter(pitch, reading.time)
    }

    this.steadyPitch = this.centre.add(this.pitch!, reading.time)
    this.lastSound = reading.time
    this.state = { ...this.state, status: 'sounding', clarity: reading.clarity, level: reading.level }
    this.retarget(reading.time)
    return this.state
  }

  /** Nothing usable this frame: hold the last note for a while, then let it go. */
  private silence(reading: Reading): TunerState {
    this.pending = []
    if (this.pitch !== null && reading.time - this.lastSound <= HOLD_TIME) {
      // Holding keeps an earned "in tune" (the string rang true, then faded) but never earns one.
      if (!this.state.inTune) this.inTuneSince = null
      this.state = { ...this.state, status: 'held', level: reading.level, clarity: reading.clarity }
      return this.state
    }
    this.pitch = null
    this.steadyPitch = null
    this.euro.reset()
    this.centre.reset()
    this.inTuneSince = null
    this.state = { ...EMPTY, level: reading.level }
    return this.state
  }

  /** A rejected frame inside a note: show the note as it was. */
  private keep(reading: Reading): TunerState {
    this.state = { ...this.state, level: reading.level }
    return this.state
  }

  /** Choose the target for the current pitch and work out the deviation. */
  private retarget(time: number): void {
    const { a4, offsets, strings, tolerance } = this.config
    const frequency = a4 * 2 ** (this.pitch! / 1200)
    const centre = a4 * 2 ** ((this.steadyPitch ?? this.pitch!) / 1200)
    const string = strings.length > 0 ? this.chooseString(centre) : null
    const midi = string !== null ? strings[string]! : this.chooseNote(centre)

    const target = noteFrequency(midi, a4, offsets)
    const cents = centsBetween(frequency, target)
    const steady = centsBetween(centre, target)

    const within = Math.abs(steady) <= tolerance
    const outside = Math.abs(steady) > tolerance + Math.max(1, tolerance * 0.3)
    if (midi !== this.state.midi || outside) this.inTuneSince = null
    else if (within && this.inTuneSince === null) this.inTuneSince = time
    const inTune = this.inTuneSince !== null && time - this.inTuneSince >= SETTLE_TIME

    this.state = { ...this.state, midi, string, frequency: centre, target, cents, steady, inTune }
  }

  private chooseNote(frequency: number): number {
    const { a4, offsets } = this.config
    const nearest = nearestNote(frequency, a4, offsets)
    const current = this.state.midi
    if (current !== null && current !== nearest.midi) {
      const fromCurrent = centsBetween(frequency, noteFrequency(current, a4, offsets))
      if (Math.abs(fromCurrent) < 50 + NOTE_HYSTERESIS) return current
    }
    return nearest.midi
  }

  /** The string being tuned, or null for a note that belongs to none of them. */
  private chooseString(frequency: number): number | null {
    const { a4, offsets, strings, lockedString } = this.config
    if (lockedString !== null && lockedString < strings.length) return lockedString
    const distance = (i: number) => Math.abs(centsBetween(frequency, noteFrequency(strings[i]!, a4, offsets)))
    let best = 0
    for (let i = 1; i < strings.length; i++) if (distance(i) < distance(best)) best = i
    if (distance(best) > STRING_REACH) return null
    const current = this.state.string
    if (current !== null && current < strings.length && current !== best) {
      if (distance(current) - distance(best) < STRING_HYSTERESIS) return current
    }
    return best
  }
}
