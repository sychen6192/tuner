---
name: 調音器 Tuner
description: The metronome's twin on the same music-room chalkboard; pitch drawn the way a pen plotter draws, a straight fall when in tune.
colors:
  slate: "#172036"
  slate-raised: "#1d2742"
  slate-deep: "#111a2d"
  chalk: "#eceff6"
  chalk-soft: "#b4bdd2"
  chalk-faint: "#8792ad"
  slate-rule: "#33405f"
  chalk-path: "rgb(236 239 246 / 0.6)"
  chalk-zone: "rgb(236 239 246 / 0.07)"
  pen-yellow: "#fccf3f"
  paper: "#f3f5f9"
  paper-raised: "#e7ebf3"
  paper-deep: "#d9dfeb"
  navy-ink: "#172036"
  navy-ink-soft: "#44506c"
  navy-ink-faint: "#56617c"
  paper-rule: "#c6cddc"
  navy-path: "rgb(23 32 54 / 0.6)"
  navy-zone: "rgb(23 32 54 / 0.07)"
typography:
  display-note:
    fontFamily: "'Tuner Engraved', 'Old Standard TT', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "calc(clamp(120px, 34vw, 156px) * 0.44)"
    fontWeight: 700
    lineHeight: 1
  readout:
    fontFamily: "'Old Standard TT', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum, lnum"
  reference-mark:
    fontFamily: "'Old Standard TT', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "clamp(1.25rem, 5.6vw, 1.625rem)"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum, lnum"
  title-numeral:
    fontFamily: "'Old Standard TT', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1
  label-score:
    fontFamily: "'Old Standard TT', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "12px"
    fontWeight: 700
  title-wordmark:
    fontFamily: "'Old Standard TT', 'Tuner Wordmark', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label-strong:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
  label-small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  band: "1px"
  field: "10px"
  toast: "14px"
  panel: "20px"
  pill: "999px"
  round: "50%"
spacing:
  hair: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  gutter-wide: "48px"
components:
  button-start:
    backgroundColor: "{colors.pen-yellow}"
    textColor: "{colors.slate}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    height: "64px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "52px"
  button-step:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    rounded: "{rounded.round}"
    size: "52px"
  note-disc:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.chalk}"
    typography: "{typography.display-note}"
    rounded: "{rounded.round}"
    size: "clamp(120px, 34vw, 156px)"
  note-disc-in-tune:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.slate}"
  note-disc-locked:
    backgroundColor: "{colors.pen-yellow}"
    textColor: "{colors.slate}"
  string-numeral:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.chalk}"
    typography: "{typography.title-numeral}"
    rounded: "{rounded.round}"
    size: "44px"
  segment-selected:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.slate}"
    rounded: "{rounded.field}"
    height: "48px"
  settings-panel:
    backgroundColor: "{colors.slate-raised}"
    rounded: "{rounded.panel}"
  toast:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.slate}"
    rounded: "{rounded.toast}"
---

# Design System: 調音器 Tuner

## Overview

**Creative North Star: "The Intonation Pen"**

The tuner is the metronome's twin, drawn on the same music-room chalkboard. Where the metronome's baton point traces the bar, the tuner's yellow pen point rides an engraved cents scale and the paper scrolls down beneath it: the last six seconds of pitch, drawn as a plotter draws. A note in tune falls as a straight line down the in-tune column; a vibrato wavers around it; a string drifting flat leans left. Each note's line carries its name, set in the score face, where it began. Above the scale, three strobe bands, one per harmonic, stand still when the note is true.

The note itself sits above, in a disc like the metronome's beat numerals but at glance size: a chalk ring while listening, solid chalk once in tune (held, never flashed), yellow when the player has locked the target. ♭ and ♯ step discs flank it, as − and + flank the metronome's tempo mark. Cents and hertz sit beneath in the score face with tabular figures. Settings form the same raised legend below the stage.

**Key Characteristics:**
- Navy slate (dark) or cool paper (light), chalk strokes, the single yellow.
- The intonation chart (strobe, engraved scale, pen trace) is the hero; the note disc is its title.
- Score voice for everything musical: Old Standard TT letters and figures, engraved Bravura accidentals; system sans for chrome.
- Pen-weighted trace: width follows how clear the pitch is.
- Round and pill forms throughout; flat surfaces with one lifted object, Start.
- States are held fills, not flashes; reduced motion keeps every reading.

## Colors

The metronome's palette, unchanged, plus one role: the in-tune zone.

### Primary
- **Pen Yellow** (#fccf3f): the pen point (dark), the locked target (note disc and string numerals), the tone ring, Start, the toast action, the Calibrate/Tone pressed tint (18% mixed into the ground). On paper it always carries a navy edge or navy text, and the pen point turns navy with a yellow ring.

### Neutral
- **Slate / Raised / Deep** (#172036 / #1d2742 / #111a2d) and **Paper / Raised / Deep** (#f3f5f9 / #e7ebf3 / #d9dfeb): grounds, the legend panel, hovers in the legend.
- **Chalk / Soft / Faint** (#eceff6 / #b4bdd2 / #8792ad) and **Navy / Soft / Faint** (#172036 / #44506c / #56617c): text and strokes. Chalk draws the in-tune trace and fills the in-tune disc; Soft Chalk draws the trace elsewhere, its note labels (they cross the zone, where Faint Chalk would fall below 4.5:1), the octave figures and units; Faint Chalk the scale ticks and idle states.
- **Rule** (#33405f / #c6cddc): hairlines, control borders, the scale baseline and the trace's centre line. Decorative only.
- **Path** (ink at 60%): rings of listening discs and string numerals, the strobe stripes.
- **Zone** (ink at 7%): the in-tune column, running from the scale down the paper, ±tolerance wide.

### Named Rules
**The One Yellow Rule.** Yellow is the pen, the player's choice (a locked target, the sounding tone) and Start. It never decorates and never stands alone on paper.

**The Fill Is the Verdict Rule.** "In tune" is a solid chalk fill (disc, string numeral) and a taller zero mark, held while true. Nothing blinks.

## Typography

**Score Font:** Old Standard TT Bold for note letters, solfège syllables, octave figures, cents, hertz, the reference mark and the scale figures.
**Engraved Font:** Tuner Engraved, a Bravura subset of the flat, natural and sharp (SMuFL U+E260-E262, also mapped to ♭ ♮ ♯), raised to stand on the baseline as text accidentals do. It comes first in the score stack, limited by `unicode-range` to those signs.
**Wordmark Font:** Old Standard TT for Latin, Tuner Wordmark (調音器 from Noto Serif TC Bold) for the Chinese name.
**Body Font:** the system stack with PingFang TC / Noto Sans TC / Microsoft JhengHei.

### Hierarchy
- **Display note** (score, 44% of the disc): the note letter; syllables at 66% of that. The accidental is set high at 0.52em beside the letter, the octave figure at 0.4em in soft ink on the baseline.
- **Readout** (score 700, 1.25rem, tabular lining figures): cents and hertz beneath the disc. Signs are set at 0.72em because the face's + and − are math-width.
- **Reference mark** (score 700, up to 1.625rem): "A4 = 440 Hz" in the legend, the twin of the metronome's tempo mark.
- **String numerals** (score 700, 1.0625rem, octave at 0.62em).
- **Scale figures** (score 700, 12px; signs 9px): 0 and ±25, with engraved ♭ and ♯ at 20px at the ends (13px plain b and # in the fallback).
- **Labels, hints, buttons**: the metronome's sans sizes (0.9375rem 600 labels, 0.8125rem hints, 1.125rem 700 Start).

**The Notation Voice Rule.** Any musical quantity (a note, an octave, cents, hertz, a key) is set in the score face with engraved accidentals; every instruction is system sans.

**The Engraved Fallback Rule.** If the engraved face fails (`document.fonts.load`), the root takes `no-engraved` and accidentals become plain # and b in the score face: in the HTML, at the scale's ends and in the trace labels alike. Native select menus (the temperament root) are drawn by the platform in its own face, so they show its ♯ and ♭.

## Layout

A single column, max 1080px with 16px gutters (32px from 900px), the stage first and filling the first viewport: the note mark (max 440px: ♭ disc, note disc and readout, ♯ disc), then the chart (max 560px: strobe, 46px scale, the paper as tall as `clamp(132px, 100svh - 610px, 340px)`, or `clamp(120px, 100svh - 680px, 320px)` when the string row shows), its caption, the string numerals in instrument mode, and the transport (Calibrate, Start, Tone on a 1fr / auto / 1fr grid). From 900px the stage narrows to 760px and the legend becomes two columns. Legend rows are 64px with a 6.25rem label column; at 360px and below they stack.

## Elevation & Depth

Flat. Only Start casts a shadow (`0 6px 18px rgb(0 0 0 / 0.22)`), and the toast floats (`0 10px 30px rgb(0 0 0 / 0.3)`). Forced colours remove both.

## Shapes

Circles for the note disc, step discs, string numerals, the pen point and the signal lamp; pills for Start, secondary buttons and the language switch; 10px corners for segments, selects and toast buttons; 20px for the wide legend panel. Borders: 1.5px controls, 2px note disc and string rings (4px when the tone sounds or a locked note is in tune), 1px hairlines. Line icons are 24-unit strokes at 2px; the Calibrate icon is a tuning fork with waves, the brand's own.

## Components

### Note disc (signature)
`clamp(120px, 34vw, 156px)` circle. Idle and waiting: dashed faint ring, a dash in faint ink. Listening: path ring, chalk letter. Held (the sound stopped): soft-chalk letter for up to 2.5s. In tune: solid chalk with a ground-coloured letter, landing at once and held. Locked target: yellow disc (navy-edged on paper); locked and in tune: chalk with a 4px yellow ring. Tone sounding: a 4px yellow ring. Tapping it locks the note being heard, or lets go.

### Intonation chart (signature)
- **Strobe:** three 6px bands of 9px stripes on an 18px period, inset 14px to match the scale's ends; band k shows the phase of the k-th harmonic (1, 2, 4) against the target, so it stands still in tune and runs at k·Δf. Opacity follows the harmonic's strength and fades between 15 and 40 cents off; at rest the bands sit at 16%.
- **Scale:** a 1px rule baseline; ticks every 5 cents (6px, faint), long ticks at 0 and ±25 (11px, soft); the 0 mark is a 3px round-capped chalk bar that grows to 1.7× height when in tune, like the metronome's struck ictus. The zone runs behind it.
- **Pen point:** an 8px-radius circle on the baseline, yellow with a 3px ground ring (navy with a yellow ring on paper); hollow faint ring at rest; 55% when holding; hollow yellow-edged ring when beyond ±50.
- **Paper:** the zone column and a 1px centre rule full height; the trace in soft chalk, chalk where in tune, 1.5px to 3.4px by clarity with round caps; the pen lifts on a change of note or a pause over 0.12s; notes held 0.3s or more are labelled in score 13px soft ink beside their onset.
- **Caption:** "6 s" in score face, then the hint in label small.

### String numerals
44px circles in a centred row, one per string. Path ring; chalk ring when that string is being heard; yellow when locked; solid chalk when in tune.

### Buttons, segments, selects, sliders, toast
As the metronome: Start is the yellow pill with the lift; secondary pills with rule borders (Calibrate and Tone take the yellow edge and 18% tint when active); 52px step discs (44px in the legend) with hold-to-repeat on the reference; segments 48px with score-face note names; selects with drawn chevrons; sliders with a 4px track and a 22px thumb in a 44px hit area. The sensitivity slider pairs with a 14px signal lamp, a ring that fills chalk while the input passes the gate. Every target is at least 44px: the language pills, Install, the toast's action and close buttons. The toast's polite live region is always in the page; problems (microphone refused, audio interrupted) stay until closed, plain messages for at least 6s and never while hovered or focused. A switch under the shortcuts turns the letter shortcuts off.

### Theme, motion and access modes
- **Light/dark:** follows the system; every token has both values, and the canvas reads its colours from CSS swatches so it follows too.
- **Reduced motion:** transitions off; the strobe is hidden; the zero mark thickens instead of growing.
- **Forced colours:** strokes, ticks and scale figures in CanvasText; pen point, in-tune fills and the lit lamp in Highlight; locked targets CanvasText fills; the string being heard a 4px ring; strobe stripes CanvasText; every control border ButtonText, the toast and its action included.
- **Screen readers:** a polite live region speaks the note, its side and cents (or "in tune") on each change and every few seconds while holding.

## Do's and Don'ts

### Do:
- **Do** set every musical value in the score face with engraved accidentals.
- **Do** show "in tune" as a held fill, and judge it by the pitch's centre so vibrato counts.
- **Do** keep the pen honest: draw the live pitch, weight the line by clarity, lift it between notes.
- **Do** keep Start, the note and the chart in the first viewport at phone sizes.

### Don't:
- **Don't** flash, pulse or animate anything that is not a reading.
- **Don't** add a second accent hue, or tint surfaces with yellow beyond the pressed 18% mix.
- **Don't** use Unicode music symbols in a system face; accidentals come from the engraved subset or fall back to # and b (native select menus excepted, which the platform draws).
- **Don't** replace the pen and paper with a swinging-needle gauge; the scale and trace are the meter.
