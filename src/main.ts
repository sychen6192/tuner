import './style.css'
import { ListenFailure, TunerEngine, type ListenEnd } from './audio/engine'
import type { AnalysisResult } from './audio/messages'
import { MIN_CALIBRATION_READINGS, calibrate } from './core/calibrate'
import { INSTRUMENT_GROUPS, searchRange } from './core/instruments'
import {
  ACCIDENTALS,
  MAX_A4,
  MIN_A4,
  NAMINGS,
  TEMPERAMENTS,
  TRANSPOSITIONS,
  TRANSPOSITION_KEY,
  clampA4,
  noteFrequency,
  noteName,
  temperamentHasRoot,
  temperamentOffsets,
  type NoteName,
} from './core/notes'
import {
  TOLERANCES,
  TONE_VOICES,
  gateFor,
  instrumentStrings,
  loadSettings,
  saveSettings,
  type Settings,
} from './core/settings'
import { PitchTracker, type TrackerConfig, type TunerState } from './core/tracker'
import {
  LANGUAGES,
  currentLanguage,
  resolveLanguage,
  setLanguage,
  t,
  translatePage,
  type Language,
  type MessageKey,
} from './i18n'
import { setupPwa } from './platform/pwa'
import { ScreenWakeLock } from './platform/wakeLock'
import { Chart, type PenState } from './ui/chart'
import { accidentalHtml, noteHtml, noteText, spokenNote } from './ui/notation'
import { dismissToast, render as renderToast, showToast } from './ui/toast'

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  noteMark: byId('note-mark'),
  note: byId<HTMLButtonElement>('note'),
  noteStep: byId('note-step'),
  noteAccidental: byId('note-accidental'),
  noteOctave: byId('note-octave'),
  lower: byId<HTMLButtonElement>('lower'),
  higher: byId<HTMLButtonElement>('higher'),
  cents: byId<HTMLOutputElement>('cents'),
  centsSign: byId('cents-sign'),
  hz: byId<HTMLOutputElement>('hz'),
  strobe: byId('strobe'),
  scale: document.getElementById('scale') as unknown as SVGSVGElement,
  trace: byId<HTMLCanvasElement>('trace'),
  swatches: document.querySelector<HTMLElement>('.trace-swatches')!,
  hint: byId('hint'),
  stringsRow: byId('strings-row'),
  strings: byId('strings'),
  calibrate: byId<HTMLButtonElement>('calibrate'),
  calibrateLabel: byId('calibrate-label'),
  listen: byId<HTMLButtonElement>('listen'),
  listenLabel: byId('listen-label'),
  tone: byId<HTMLButtonElement>('tone'),
  status: byId('status'),
  a4Down: byId<HTMLButtonElement>('a4-down'),
  a4Up: byId<HTMLButtonElement>('a4-up'),
  a4Value: byId('a4-value'),
  a4Output: byId<HTMLOutputElement>('a4-output'),
  instrument: byId<HTMLSelectElement>('instrument'),
  temperament: byId<HTMLSelectElement>('temperament'),
  root: byId<HTMLSelectElement>('root'),
  transpositions: byId('transpositions'),
  namings: byId('namings'),
  accidentalStyles: byId('accidental-styles'),
  tolerances: byId('tolerances'),
  sensitivity: byId<HTMLInputElement>('sensitivity'),
  levelLamp: byId('level-lamp'),
  voices: byId('voices'),
  volume: byId<HTMLInputElement>('volume'),
  install: byId<HTMLButtonElement>('install'),
  languageButtons: document.querySelectorAll<HTMLButtonElement>('[data-language]'),
}

// ---------------------------------------------------------------------------------------------
// State

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

// Web fonts can be blocked (e.g. iOS Lockdown Mode); accidentals then fall back to # and b.
const withoutEngraved = () => document.documentElement.classList.add('no-engraved')
document.fonts?.load('1em "Tuner Engraved"', '♯').then((faces) => {
  if (faces.length === 0) withoutEngraved()
}, withoutEngraved)

let settings: Settings = loadSettings(storage())
setLanguage(resolveLanguage(settings.language))

/** The target chosen by hand: a note (chromatic) or a string (instrument). Not saved. */
type Lock = { kind: 'note'; midi: number } | { kind: 'string'; index: number }
let lock: Lock | null = null
/** The last note heard, so Tone and the ♭/♯ buttons start from it. */
let lastMidi: number | null = null
/** What the reference tone is sounding, while it sounds. */
let toneMidi: number | null = null

const memo = <K, V>(compute: (key: K) => V) => {
  let last: { key: string; value: V } | null = null
  return (key: K) => {
    const id = JSON.stringify(key)
    if (last?.key !== id) last = { key: id, value: compute(key) }
    return last.value
  }
}
const offsetsFor = memo(([temperament, root]: [Settings['temperament'], number]) =>
  temperamentOffsets(temperament, root),
)
const stringsFor = memo((instrument: Settings['instrument']) => instrumentStrings({ instrument }))
const lockedNoteStrings = memo((midi: number) => [midi])

const offsets = () => offsetsFor([settings.temperament, settings.root])
const strings = () => stringsFor(settings.instrument)
const isInstrument = () => strings().length > 0

function trackerConfig(): TrackerConfig {
  const base = {
    a4: settings.a4,
    offsets: offsets(),
    tolerance: settings.tolerance,
    gate: gateFor(settings.sensitivity),
  }
  if (lock?.kind === 'note') return { ...base, strings: lockedNoteStrings(lock.midi), lockedString: 0 }
  return { ...base, strings: strings(), lockedString: lock?.kind === 'string' ? lock.index : null }
}

const tracker = new PitchTracker(trackerConfig())
let tuner: TunerState = tracker.current
let level = -Infinity

const engine = new TunerEngine(onReading, onListenEnd)
const wakeLock = new ScreenWakeLock()
const chart = new Chart(els.scale, els.trace, els.strobe, els.swatches)

let saveTimer: number | undefined
function update(patch: Partial<Settings>): void {
  const before = settings
  settings = { ...settings, ...patch }
  if (patch.instrument !== undefined && patch.instrument !== before.instrument) {
    lock = null
    chart.clear()
    buildStrings()
  }
  if (patch.instrument !== undefined || patch.a4 !== undefined) applyRange()
  if (patch.toneVolume !== undefined) engine.tone.setVolume(settings.toneVolume)
  if (patch.tolerance !== undefined) chart.setTolerance(settings.tolerance)
  if (patch.naming !== undefined || patch.accidentals !== undefined || patch.transposition !== undefined) {
    buildStrings()
    buildRootOptions()
    chart.relabel((midi) => noteText(nameOf(midi)))
  }
  retune()
  render()
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => saveSettings(storage(), settings), 300)
}

/** Settings or the lock changed: the tracker, strobe and tone follow. */
function retune(): void {
  tracker.configure(trackerConfig())
  tuner = tracker.current
  engine.setTarget(tuner.target)
  if (toneMidi !== null) {
    toneMidi = toneTarget()
    engine.tone.setFrequency(frequencyOf(toneMidi))
  }
}

function applyRange(): void {
  const range = searchRange(strings(), settings.a4)
  engine.setRange(range.min, range.max)
}

const nameOf = (midi: number): NoteName =>
  noteName(midi, { naming: settings.naming, accidentals: settings.accidentals, transposition: settings.transposition })
const frequencyOf = (midi: number) => noteFrequency(midi, settings.a4, offsets())

// ---------------------------------------------------------------------------------------------
// Readings

function onReading(reading: AnalysisResult): void {
  tuner = tracker.push(reading)
  level = reading.level
  if (tuner.target !== null) engine.setTarget(tuner.target)

  if (tuner.status === 'sounding' && tuner.midi !== null && tuner.cents !== null) {
    lastMidi = tuner.midi
    chart.add({
      time: performance.now() / 1000,
      cents: tuner.cents,
      clarity: reading.clarity,
      midi: tuner.midi,
      label: noteText(nameOf(tuner.midi)),
      inTune: tuner.inTune,
    })
  }
  const strobeOn = tuner.status === 'sounding' && reading.strobeTarget !== null && reading.strobeTarget === tuner.target
  chart.strobe(strobeOn ? reading.strobe : null, tuner.target, tuner.cents)

  if (
    calibration &&
    reading.frequency !== null &&
    reading.clarity >= 0.9 &&
    reading.level >= gateFor(settings.sensitivity)
  ) {
    calibration.readings.push(reading.frequency)
    if (calibration.readings.length >= MIN_CALIBRATION_READINGS * 1.5) finishCalibration()
  }
  requestFrame()
}

function onListenEnd(reason: ListenEnd): void {
  afterStop()
  showToast(reason === 'device' ? 'micEnded' : 'audioInterrupted')
}

// ---------------------------------------------------------------------------------------------
// Rendering

let frameRequested = false
function requestFrame(): void {
  if (frameRequested) return
  frameRequested = true
  requestAnimationFrame(frame)
}

function frame(): void {
  frameRequested = false
  renderTuner()
  // Keep the paper moving while listening; stopped, it holds still for reading.
  if (engine.listening) requestFrame()
}

/** What the note disc shows: the tone's note, what is heard, or the locked target. */
function shownNote(): { midi: number; frequency: number | null; cents: number | null; state: string } | null {
  if (toneMidi !== null) return { midi: toneMidi, frequency: frequencyOf(toneMidi), cents: 0, state: 'tone' }
  if (tuner.midi !== null && tuner.status !== 'waiting') {
    return {
      midi: tuner.midi,
      frequency: tuner.frequency,
      cents: tuner.steady,
      state: tuner.inTune ? 'true' : tuner.status,
    }
  }
  const target = lockedMidi()
  if (target !== null) return { midi: target, frequency: frequencyOf(target), cents: null, state: 'waiting' }
  return null
}

function lockedMidi(): number | null {
  if (!lock) return null
  return lock.kind === 'note' ? lock.midi : (strings()[lock.index] ?? null)
}

function renderTuner(): void {
  const shown = shownNote()
  const state = shown ? shown.state : engine.listening ? 'waiting' : 'idle'
  els.note.dataset.state = state
  els.note.classList.toggle('locked', lock !== null)
  const locked = lockedMidi()
  const label =
    locked !== null
      ? t('noteLocked', { note: spokenNote(nameOf(locked)) })
      : shown
        ? t('noteAuto', { note: spokenNote(nameOf(shown.midi)) })
        : t('noteAutoIdle')
  if (els.note.getAttribute('aria-label') !== label) els.note.setAttribute('aria-label', label)
  if (shown) {
    const name = nameOf(shown.midi)
    setText(els.noteStep, name.step)
    els.noteStep.classList.toggle('syllable', name.step.length > 1)
    setHtml(els.noteAccidental, accidentalHtml(name.accidental))
    setText(els.noteOctave, String(name.octave))
  } else {
    setText(els.noteStep, '–')
    els.noteStep.classList.remove('syllable')
    setHtml(els.noteAccidental, '')
    setText(els.noteOctave, '')
  }
  const cents = shown?.cents != null ? formatCents(shown.cents) : { sign: '', digits: '–' }
  setText(els.centsSign, cents.sign)
  setText(els.cents, cents.digits)
  setText(els.hz, shown?.frequency != null ? shown.frequency.toFixed(1) : '–')
  els.note.dataset.side = shown?.cents == null ? '' : shown.cents < -0.05 ? 'flat' : shown.cents > 0.05 ? 'sharp' : ''

  const pen: PenState = toneMidi !== null ? 'idle' : !engine.listening ? 'idle' : tuner.status
  chart.draw(performance.now() / 1000, {
    state: pen,
    cents: pen === 'idle' || pen === 'waiting' ? null : tuner.cents,
    inTune: tuner.inTune && toneMidi === null,
  })
  if (!engine.listening || tuner.status !== 'sounding') chart.strobe(null, null, null)

  // Strings: the one being tuned rings, the locked one is yellow, in tune it fills.
  for (const button of els.strings.querySelectorAll<HTMLButtonElement>('.string')) {
    const index = Number(button.dataset.index)
    const current = toneMidi === null && tuner.string === index && tuner.status !== 'waiting'
    button.classList.toggle('current', current || (toneMidi !== null && lockedMidi() === strings()[index]))
    button.classList.toggle('in-tune', current && tuner.inTune)
  }
  renderLevel()
  announce()
}

/** Sign and figures apart: the score face's + and − are math-width, so they are set smaller. */
function formatCents(cents: number): { sign: string; digits: string } {
  const magnitude = Math.abs(cents)
  const digits = magnitude < 99.95 ? magnitude.toFixed(1) : magnitude.toFixed(0)
  if (digits === '0.0') return { sign: '', digits }
  return { sign: cents < 0 ? '\u2212' : '+', digits }
}

/** The lamp beside the sensitivity slider: lit while the input is above the gate. */
function renderLevel(): void {
  els.levelLamp.classList.toggle('heard', engine.listening && level >= gateFor(settings.sensitivity))
}

let lastAnnouncement = { text: '', time: 0, midi: null as number | null, inTune: false }
/** Tell screen readers what the tuner hears: on a new note or tuning state, else every few seconds. */
function announce(): void {
  if (!engine.listening || tuner.status !== 'sounding' || tuner.midi === null || tuner.steady === null) return
  const now = performance.now()
  const changed = tuner.midi !== lastAnnouncement.midi || tuner.inTune !== lastAnnouncement.inTune
  if (!changed && now - lastAnnouncement.time < 3000) return
  if (changed && now - lastAnnouncement.time < 700) return
  const note = spokenNote(nameOf(tuner.midi))
  const cents = Math.round(Math.abs(tuner.steady))
  const text = tuner.inTune
    ? t('statusInTune', { note })
    : t(tuner.steady < 0 ? 'statusFlat' : 'statusSharp', { note, cents })
  lastAnnouncement = { text, time: now, midi: tuner.midi, inTune: tuner.inTune }
  els.status.textContent = text
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text
}

function setHtml(element: HTMLElement, html: string): void {
  if (element.dataset.html !== html) {
    element.dataset.html = html
    element.innerHTML = html
  }
}

/** Custom slider styling draws the filled part of the track from --p (0–1). */
function setSlider(input: HTMLInputElement, value: number): void {
  input.value = String(value)
  const min = Number(input.min)
  const max = Number(input.max)
  input.style.setProperty('--p', String((value - min) / (max - min)))
}

function render(): void {
  const a4 = settings.a4
  const a4Text = Number.isInteger(a4) ? String(a4) : a4.toFixed(1)
  els.a4Value.textContent = a4Text
  els.a4Output.value = t('a4Value', { hz: a4Text })
  els.a4Down.disabled = a4 <= MIN_A4
  els.a4Up.disabled = a4 >= MAX_A4

  els.instrument.value = settings.instrument
  els.temperament.value = settings.temperament
  els.root.value = String(settings.root)
  els.root.disabled = !temperamentHasRoot(settings.temperament)
  for (const [group, value] of [
    [els.transpositions, settings.transposition],
    [els.namings, settings.naming],
    [els.accidentalStyles, settings.accidentals],
    [els.tolerances, settings.tolerance],
    [els.voices, settings.toneVoice],
  ] as const) {
    for (const radio of group.querySelectorAll<HTMLInputElement>('input')) radio.checked = radio.value === String(value)
  }
  setSlider(els.sensitivity, Math.round(settings.sensitivity * 100))
  els.sensitivity.setAttribute(
    'aria-valuetext',
    t('sensitivityValue', { n: Math.round(settings.sensitivity * 100), db: Math.round(gateFor(settings.sensitivity)) }),
  )
  setSlider(els.volume, Math.round(settings.toneVolume * 100))

  // The ♭/♯ buttons pick a note in chromatic mode; strings have their own buttons.
  els.noteMark.classList.toggle('instrument', isInstrument())
  els.stringsRow.hidden = !isInstrument()
  for (const button of els.strings.querySelectorAll<HTMLButtonElement>('.string')) {
    const index = Number(button.dataset.index)
    const locked = lock?.kind === 'string' && lock.index === index
    button.setAttribute('aria-pressed', String(locked))
    button.setAttribute(
      'aria-label',
      t(locked ? 'stringLocked' : 'stringAuto', {
        n: strings().length - index,
        note: spokenNote(nameOf(strings()[index]!)),
      }),
    )
  }
  els.note.setAttribute('aria-pressed', String(lock !== null))
  setText(els.hint, lock ? t('traceHintLocked') : isInstrument() ? t('stringsHint') : t('traceHint'))

  for (const button of els.languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.language === currentLanguage()))
  }
  renderTransport()
  renderTuner()
}

function renderTransport(): void {
  const listening = engine.listening
  els.listen.classList.toggle('playing', listening)
  els.listenLabel.textContent = listening ? t('stop') : t('listen')
  els.tone.setAttribute('aria-pressed', String(toneMidi !== null))
  els.calibrate.classList.toggle('active', calibration !== null)
  els.calibrateLabel.textContent = calibration ? t('calibrating') : t('calibrate')
  document.body.classList.toggle('is-listening', listening)
}

// ---------------------------------------------------------------------------------------------
// Actions

/** `quiet`: don't report a failure (resuming on return to the app, where it may need a tap). */
async function startListening(quiet = false): Promise<boolean> {
  if (engine.listening) return true
  stopTone()
  tracker.reset()
  tuner = tracker.current
  chart.clear()
  applyRange()
  const starting = engine.start()
  renderTransport()
  try {
    await starting
  } catch (error) {
    renderTransport()
    renderTuner()
    if (quiet) return false
    const reason = error instanceof ListenFailure ? error.reason : 'failed'
    const message: Record<typeof reason, MessageKey> = {
      denied: 'micDenied',
      'no-device': 'micMissing',
      busy: 'micBusy',
      insecure: 'micInsecure',
      unsupported: 'micUnsupported',
      failed: 'micFailed',
    }
    showToast(message[reason])
    return false
  }
  if (!engine.listening) return false
  dismissToast('audioInterrupted')
  void wakeLock.request()
  if (engine.forcedProcessing.length > 0) showToast('processingOn')
  els.status.textContent = t('statusListening')
  renderTransport()
  requestFrame()
  return true
}

function stopListening(): void {
  if (!engine.listening) return
  engine.stop()
  afterStop()
  els.status.textContent = t('statusStopped')
}

/** Listening ended (by the user or not): settle the screen. */
function afterStop(): void {
  cancelCalibration()
  tracker.reset()
  tuner = tracker.current
  if (toneMidi === null) void wakeLock.release()
  render()
}

async function toggleListening(): Promise<void> {
  if (engine.listening) stopListening()
  else await startListening()
}

/** The note the tone sounds: the locked target, else what was just heard, else A4. */
function toneTarget(): number {
  return lockedMidi() ?? tuner.midi ?? lastMidi ?? 69
}

function toggleTone(): void {
  if (toneMidi !== null) {
    stopTone()
    render()
    return
  }
  const midi = toneTarget()
  if (engine.listening) stopListening()
  toneMidi = midi
  void engine.tone.play(frequencyOf(midi), settings.toneVoice, settings.toneVolume)
  void wakeLock.request()
  els.status.textContent = t('statusTone', { note: spokenNote(nameOf(midi)) })
  render()
}

function stopTone(): void {
  if (toneMidi === null) return
  toneMidi = null
  engine.tone.stop()
  if (!engine.listening) void wakeLock.release()
}

/** Lock (or move) the target: ±1 semitone in chromatic mode, the previous/next string otherwise. */
function stepTarget(direction: -1 | 1): void {
  if (isInstrument()) {
    const count = strings().length
    const from = lock?.kind === 'string' ? lock.index : (tuner.string ?? (direction > 0 ? -1 : count))
    lock = { kind: 'string', index: Math.max(0, Math.min(count - 1, from + direction)) }
  } else {
    const from = lock?.kind === 'note' ? lock.midi : (toneMidi ?? tuner.midi ?? lastMidi ?? 69)
    lock = { kind: 'note', midi: Math.max(12, Math.min(120, from + direction)) }
  }
  retune()
  render()
}

/** The note disc: lock what is sounding now, or let go of the lock. */
function toggleLock(): void {
  if (lock) {
    lock = null
  } else if (isInstrument()) {
    if (tuner.string === null) return
    lock = { kind: 'string', index: tuner.string }
  } else {
    const midi = toneMidi ?? tuner.midi ?? lastMidi
    if (midi === null) return
    lock = { kind: 'note', midi }
  }
  retune()
  render()
}

function unlock(): void {
  if (!lock) return
  lock = null
  retune()
  render()
}

function changeA4(direction: -1 | 1, fine = false): void {
  const a4 = settings.a4
  // Whole steps snap to whole hertz (442.3 → 443); fine steps move by a tenth.
  const next = fine ? a4 + direction * 0.1 : direction > 0 ? Math.floor(a4 + 1e-9) + 1 : Math.ceil(a4 - 1e-9) - 1
  update({ a4: clampA4(next) })
}

// --- Calibration: listen for an A and make it the reference

let calibration: { readings: number[]; timer: number } | null = null
const CALIBRATION_TIMEOUT_MS = 6000

async function toggleCalibration(): Promise<void> {
  if (calibration) {
    cancelCalibration()
    renderTransport()
    return
  }
  if (!(await startListening())) return
  calibration = { readings: [], timer: window.setTimeout(finishCalibration, CALIBRATION_TIMEOUT_MS) }
  renderTransport()
}

function finishCalibration(): void {
  if (!calibration) return
  const result = calibrate(calibration.readings)
  cancelCalibration()
  if (result === null) {
    showToast('calibrateFailed')
  } else {
    const previous = settings.a4
    update({ a4: result })
    showToast('calibrated', { label: 'undo', run: () => update({ a4: previous }) }, { hz: result.toFixed(1) })
  }
  renderTransport()
}

function cancelCalibration(): void {
  if (!calibration) return
  clearTimeout(calibration.timer)
  calibration = null
}

// ---------------------------------------------------------------------------------------------
// Wiring

/** Press and hold to keep changing the value, as on the metronome's tempo buttons. */
function holdToRepeat(button: HTMLButtonElement, action: () => void): void {
  let delay: number | undefined
  let repeat: number | undefined
  let owner: number | undefined
  const stop = () => {
    clearTimeout(delay)
    clearInterval(repeat)
    delay = repeat = owner = undefined
  }
  const release = (event: PointerEvent) => {
    if (event.pointerId === owner) stop()
  }
  const tick = () => {
    action()
    if (button.disabled) stop()
  }
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    stop()
    owner = event.pointerId
    tick()
    if (owner !== undefined) delay = window.setTimeout(() => (repeat = window.setInterval(tick, 90)), 400)
  })
  button.addEventListener('pointerleave', release)
  window.addEventListener('blur', stop)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  button.addEventListener('click', (event) => {
    if (event.detail === 0) action()
  })
  button.addEventListener('contextmenu', (event) => event.preventDefault())
}

function radios(
  container: HTMLElement,
  name: string,
  options: ReadonlyArray<{ value: string; label: string; content: string }>,
): void {
  container.innerHTML = options
    .map(
      (option) => `
      <label class="segment" title="${option.label}">
        <input type="radio" name="${name}" value="${option.value}" aria-label="${option.label}" />
        <span class="segment-text" aria-hidden="true">${option.content}</span>
      </label>`,
    )
    .join('')
}

function buildControls(): void {
  els.instrument.replaceChildren(
    ...INSTRUMENT_GROUPS.map(([group, ids]) => {
      if (group === 'chromatic') return new Option(t('inst.chromatic'), 'chromatic')
      const optgroup = document.createElement('optgroup')
      optgroup.label = t(`group.${group}`)
      optgroup.append(...ids.map((id) => new Option(t(`inst.${id}`), id)))
      return optgroup
    }),
  )
  els.temperament.replaceChildren(...TEMPERAMENTS.map((id) => new Option(t(`temp.${id}`), id)))
  buildRootOptions()

  const keyName = (pc: number) => noteName(60 + pc, { naming: 'letter', accidentals: 'mixed', transposition: 0 })
  radios(
    els.transpositions,
    'transposition',
    TRANSPOSITIONS.map((n) => ({
      value: String(n),
      label: t(`trans.${n}`),
      content: noteHtml(keyName(TRANSPOSITION_KEY[n]), false),
    })),
  )
  radios(
    els.namings,
    'naming',
    NAMINGS.map((id) => ({ value: id, label: t(`naming.${id}`), content: id === 'letter' ? 'C D E' : 'Do Re Mi' })),
  )
  const sample = (style: (typeof ACCIDENTALS)[number]) =>
    [61, 63]
      .map((midi) => noteHtml(noteName(midi, { naming: 'letter', accidentals: style, transposition: 0 }), false))
      .join(' ')
  radios(
    els.accidentalStyles,
    'accidentals',
    ACCIDENTALS.map((id) => ({ value: id, label: t(`acc.${id}`), content: sample(id) })),
  )
  radios(
    els.tolerances,
    'tolerance',
    TOLERANCES.map((n) => ({ value: String(n), label: t('toleranceValue', { n }), content: `±${n}` })),
  )
  radios(
    els.voices,
    'voice',
    TONE_VOICES.map((id) => ({ value: id, label: t(`voice.${id}`), content: t(`voice.${id}`) })),
  )
  buildStrings()
}

function buildRootOptions(): void {
  const selected = settings.root
  els.root.replaceChildren(
    ...Array.from({ length: 12 }, (_, pc) => {
      const name = noteName(60 + pc, { naming: settings.naming, accidentals: settings.accidentals, transposition: 0 })
      return new Option(noteText(name, false), String(pc))
    }),
  )
  els.root.value = String(selected)
}

function buildStrings(): void {
  const midis = strings()
  els.strings.style.setProperty('--count', String(midis.length))
  els.strings.innerHTML = midis
    .map(
      (midi, index) =>
        `<button class="string" type="button" data-index="${index}"><span class="string-name">${noteHtml(nameOf(midi))}</span></button>`,
    )
    .join('')
}

function applyLanguage(language: Language): void {
  setLanguage(language)
  translatePage()
  buildControls()
  chart.relabel((midi) => noteText(nameOf(midi)))
  render()
  renderToast()
}

function bindEvents(): void {
  els.listen.addEventListener('click', () => void toggleListening())
  els.tone.addEventListener('click', toggleTone)
  els.calibrate.addEventListener('click', () => void toggleCalibration())
  els.note.addEventListener('click', toggleLock)
  els.lower.addEventListener('click', () => stepTarget(-1))
  els.higher.addEventListener('click', () => stepTarget(1))

  els.strings.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('.string')
    if (!button) return
    const index = Number(button.dataset.index)
    // Tapping the locked string lets go; while the tone sounds a string always changes its note.
    lock = lock?.kind === 'string' && lock.index === index && toneMidi === null ? null : { kind: 'string', index }
    retune()
    render()
  })

  holdToRepeat(els.a4Down, () => changeA4(-1))
  holdToRepeat(els.a4Up, () => changeA4(1))

  for (const button of els.languageButtons) {
    button.addEventListener('click', () => {
      const language = LANGUAGES.find((code) => code === button.dataset.language)
      if (!language) return
      update({ language })
      applyLanguage(language)
    })
  }

  els.instrument.addEventListener('change', () =>
    update({ instrument: els.instrument.value as Settings['instrument'] }),
  )
  els.temperament.addEventListener('change', () =>
    update({ temperament: els.temperament.value as Settings['temperament'] }),
  )
  els.root.addEventListener('change', () => update({ root: Number(els.root.value) }))
  els.transpositions.addEventListener('change', (event) =>
    update({ transposition: Number((event.target as HTMLInputElement).value) as Settings['transposition'] }),
  )
  els.namings.addEventListener('change', (event) =>
    update({ naming: (event.target as HTMLInputElement).value as Settings['naming'] }),
  )
  els.accidentalStyles.addEventListener('change', (event) =>
    update({ accidentals: (event.target as HTMLInputElement).value as Settings['accidentals'] }),
  )
  els.tolerances.addEventListener('change', (event) =>
    update({ tolerance: Number((event.target as HTMLInputElement).value) as Settings['tolerance'] }),
  )
  els.voices.addEventListener('change', (event) => {
    update({ toneVoice: (event.target as HTMLInputElement).value as Settings['toneVoice'] })
    if (toneMidi !== null) void engine.tone.play(frequencyOf(toneMidi), settings.toneVoice, settings.toneVolume)
  })
  els.sensitivity.addEventListener('input', () => update({ sensitivity: els.sensitivity.valueAsNumber / 100 }))
  els.volume.addEventListener('input', () => update({ toneVolume: els.volume.valueAsNumber / 100 }))

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && !isTextEntry(event.target)) event.preventDefault()
  })

  // The microphone is private: release it while the app is hidden, and pick up again on return.
  let resumeOnReturn = false
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (engine.listening) {
        resumeOnReturn = true
        stopListening()
      }
    } else if (resumeOnReturn) {
      resumeOnReturn = false
      void startListening(true)
    }
  })

  window.addEventListener('pagehide', () => saveSettings(storage(), settings))
}

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input[type="number"], input[type="text"], select, textarea')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (event.code === 'Space') {
    if (isTextEntry(target)) return
    event.preventDefault()
    if (!event.repeat) void toggleListening()
    return
  }
  if (isTextEntry(target)) return
  const key = event.key.toLowerCase()
  if (key === 'r' && !event.repeat) return toggleTone()
  if (key === 'c' && !event.repeat) return void toggleCalibration()
  if (event.key === 'Escape') return unlock()
  // Let sliders and radio groups keep their own arrow-key behaviour.
  if (target instanceof HTMLElement && target.matches('input, select, textarea')) return
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      stepTarget(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      stepTarget(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      changeA4(1, event.shiftKey)
      break
    case 'ArrowDown':
      event.preventDefault()
      changeA4(-1, event.shiftKey)
      break
  }
}

translatePage()
buildControls()
bindEvents()
applyRange()
chart.setTolerance(settings.tolerance)
render()
setupPwa(els.install, () => engine.listening || toneMidi !== null)
