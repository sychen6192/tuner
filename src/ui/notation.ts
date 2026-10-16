import { formatNote, type NoteName } from '../core/notes'
import { t } from '../i18n'

/**
 * Note names set as a score sets them: the letter (or syllable) in the score face, the accidental
 * engraved (Bravura, from the app's subset), the octave as a small figure. When the engraved face
 * is unavailable the plain "#" and "b" stand in, as the metronome's tuplet 3 does.
 */
export function accidentalHtml(accidental: -1 | 0 | 1): string {
  if (accidental === 0) return ''
  const engraved = accidental === 1 ? '♯' : '♭'
  const plain = accidental === 1 ? '#' : 'b'
  return `<span class="acc">${engraved}</span><span class="acc-plain">${plain}</span>`
}

export function noteHtml(name: NoteName, withOctave = true): string {
  const octave = withOctave ? `<span class="octave">${name.octave}</span>` : ''
  return `<span class="step-name">${name.step}</span>${accidentalHtml(name.accidental)}${octave}`
}

/** How a screen reader should say the note: "升F4" / "F sharp 4". */
export function spokenNote(name: NoteName, withOctave = true): string {
  const step =
    name.accidental === 1
      ? t('sharpName', { step: name.step })
      : name.accidental === -1
        ? t('flatName', { step: name.step })
        : name.step
  return t('noteSpoken', { name: step, octave: withOctave ? name.octave : '' }).trim()
}

/** Plain text with the Unicode signs, for the canvas labels (drawn in the engraved face). */
export const noteText = (name: NoteName, withOctave = true) => formatNote(name, withOctave)
