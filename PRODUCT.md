# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students and hobbyists learning an instrument, practising on their own: the same players as the twin metronome. They tune before playing (guitar, bass, ukulele, violin family, erhu, pipa, winds) and check intonation while practising long tones, scales and vibrato. The phone or tablet sits on a music stand, desk or piano at arm's length; hands are on the instrument or the tuning pegs.

## Product Purpose

A tuner that tells the truth about pitch, steadily: which note, how far off, and when it is in tune, readable at a glance; and for practice, what the pitch has been doing over the last few seconds. Success is that a player trusts the reading (no needle jitter, no octave jumps on low strings), tunes a string in one motion, and can see whether a held note or a vibrato is centred.

## Positioning

The metronome's twin: the same music-room chalkboard, score type and single yellow. Measured accuracy (sub-cent, published as tests against the most-starred open-source web tuner), a true phase strobe and an intonation trace, in a free, ad-free, account-free web app that installs like a native app and works fully offline.

## Operating Context

- Glanced at from arm's length while playing or turning a peg; operated between passages, often one-handed.
- Rooms with background noise (practice rooms, classrooms, band rehearsals); phone and laptop microphones of mixed quality.
- Sessions of seconds (tune and go) to many minutes (intonation practice): the screen stays on while listening; the microphone is released when the app is hidden.
- Installed to the home screen and used offline.

## Capabilities and Constraints

- Chromatic detection A0–C8 (McLeod Pitch Method with refinement), instrument modes with 20 tunings (auto string or locked), a locked target note in chromatic mode.
- Reference pitch A4 390–490 Hz in 0.1 Hz steps; calibration from a heard A, with undo.
- Seven temperaments (equal, just, Pythagorean, quarter-comma meantone with a root; Werckmeister III, Kirnberger III, Vallotti), A always at the reference.
- Transposing instruments (C, B♭, A, F, E♭), letter or fixed-do solfège names, accidental spelling style.
- In-tune tolerance ±1–10 cents; microphone sensitivity (level gate) with a signal lamp.
- Reference tone (reed or sine) in the current temperament.
- Keyboard shortcuts: Space listen, ←/→ note or string, Esc automatic, ↑/↓ reference (Shift ±0.1), R tone, C calibrate.
- Languages: Traditional Chinese and English, auto-detected with a manual switch. Light and dark themes following the system.
- PWA: static build (Vite + TypeScript, no UI framework), AudioWorklet capture and a Web Worker for analysis, offline service worker, deployed to GitHub Pages and Cloudflare Workers.

## Brand Commitments

- Name: 調音器 / Tuner. Twin of 節拍器 / Metronome: shares its palette, type voices and component shapes.
- The app icon (`assets/icon.svg`: the metronome's navy tile, a tuning fork with white tines and a grey stem, yellow sound waves) is the brand reference.
- Free, no ads, no account or sign-up.

## Evidence on Hand

Accuracy figures come from the repository's own tests on synthetic signals (`npm run benchmark`). No testimonials, user counts, reviews or press exist; do not invent any.

## Product Principles

1. The reading is sacred: steady when the pitch is steady, immediate when it moves, never an octave off.
2. Readable at a glance from arm's length: the note, which side, and "in tune" first; everything else second.
3. Few, large, forgiving controls; settings never stand between the player and the Start button.
4. Works anywhere: offline, installed, in either language, in light or dark, with assistive technology.

## Accessibility & Inclusion

Keyboard operable and screen-reader labelled, with spoken readings ("A4, 3 cents sharp") through a polite live region; WCAG AA contrast in both themes; respects reduced motion (the strobe, which is motion by nature, is hidden; the pen and figures carry the same reading) and Windows contrast themes; 44 px or larger touch targets.
