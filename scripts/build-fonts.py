"""Builds the app's two font subsets.

src/fonts/tuner-engraved.woff2, from Bravura (SIL OFL 1.1, Steinberg): the note names carry
engraved accidentals, not the platform's Unicode music symbols (which render inconsistently).
This keeps only the SMuFL accidentals flat, natural and sharp (U+E260-E262), also mapped to the
Unicode signs ♭ ♮ ♯ (U+266D-266F) so the page text stays meaningful. Bravura draws them on a
staff line (centred on the baseline); here they are raised to stand on the baseline as text
accidentals do (the flat's bowl on the line, the sharp and natural up to cap height), and the
music-sized vertical metrics are replaced with text-like ones.

Bravura's Reserved Font Name means a modified version must not be called "Bravura", so the subset
is renamed "Tuner Engraved". Its licence is in src/fonts/LICENSE-Bravura.txt.

src/fonts/tuner-wordmark.woff2, from Noto Serif TC Bold (SIL OFL 1.1, Google / Adobe): only the
three glyphs of the Chinese app name, 調音器, so the wordmark is set in a Ming serif that matches
the score face, as the metronome's 節拍器 is. Renamed "Tuner Wordmark"; licence in
src/fonts/LICENSE-NotoSerifTC.txt.

Usage (needs fonttools and brotli):
    python3 scripts/build-fonts.py path/to/Bravura.woff2 path/to/NotoSerifTC-Bold.otf
Bravura: https://github.com/steinbergmedia/bravura (redist/woff/Bravura.woff2)
Noto Serif TC Bold: https://github.com/notofonts/noto-cjk (Serif/SubsetOTF/TC/NotoSerifTC-Bold.otf)
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FAMILY = 'Tuner Engraved'
FONTS = Path(__file__).resolve().parent.parent / 'src' / 'fonts'
OUT = FONTS / 'tuner-engraved.woff2'
WORDMARK_FAMILY = 'Tuner Wordmark'
WORDMARK_OUT = FONTS / 'tuner-wordmark.woff2'
WORDMARK_TEXT = '調音器'

# SMuFL accidentalFlat, accidentalNatural, accidentalSharp and their Unicode equivalents.
ACCIDENTALS = {0xE260: 0x266D, 0xE261: 0x266E, 0xE262: 0x266F}
# Font units each glyph is raised off the staff line (a staff space is 250): the flat's bowl
# then sits on the baseline, the sharp and natural span the baseline to about cap height.
LIFT = {0xE260: 250, 0xE261: 350, 0xE262: 350}


def lift(font: TTFont, lifts: dict[str, int]) -> None:
    top = font['CFF '].cff.topDictIndex[0]
    char_strings = top.CharStrings
    glyph_set = font.getGlyphSet()
    rebuilt = {}
    for name, dy in lifts.items():
        advance, lsb = font['hmtx'][name]
        private = char_strings[name].private
        pen = T2CharStringPen(advance - private.nominalWidthX, glyph_set)
        glyph_set[name].draw(TransformPen(pen, (1, 0, 0, 1, 0, dy)))
        rebuilt[name] = pen.getCharString(private=private, globalSubrs=top.GlobalSubrs)
    for name, char_string in rebuilt.items():
        char_strings[name] = char_string


def main(source: str) -> None:
    font = TTFont(source)
    cmap = font.getBestCmap()
    codepoints = list(ACCIDENTALS)
    glyphs = [cmap[cp] for cp in codepoints]

    options = subset.Options()
    options.layout_features = []
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = True
    options.flavor = 'woff2'
    subsetter = subset.Subsetter(options)
    subsetter.populate(glyphs=glyphs, unicodes=codepoints)
    subsetter.subset(font)

    lift(font, {cmap[cp]: LIFT[cp] for cp in codepoints})

    for table in font['cmap'].tables:
        if table.isUnicode():
            for smufl, unicode in ACCIDENTALS.items():
                table.cmap[unicode] = cmap[smufl]

    # Text-like metrics: a line box about as tall as the score face's.
    ascent, descent = 900, -250
    font['hhea'].ascent, font['hhea'].descent, font['hhea'].lineGap = ascent, descent, 0
    os2 = font['OS/2']
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ascent, descent, 0
    os2.usWinAscent, os2.usWinDescent = ascent, -descent
    os2.fsSelection |= 1 << 7  # USE_TYPO_METRICS

    rename(font, FAMILY, 'TunerEngraved-Regular', 'Bravura by Steinberg Media Technologies GmbH',
           '(accidentals only, mapped to the Unicode music signs and raised onto the baseline, '
           'vertical metrics). Not the original Bravura.')

    save(font, OUT)


def rename(font: TTFont, family: str, postscript: str, origin: str, changes: str) -> None:
    """A modified OFL font must not keep its Reserved Font Name: give the subset its own."""
    name = font['name']
    for record in list(name.names):
        if record.nameID in (1, 4, 16, 21):
            name.setName(family, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == 6:
            name.setName(postscript, 6, record.platformID, record.platEncID, record.langID)
        elif record.nameID == 3:
            name.setName(f'{family} (subset)', 3, record.platformID, record.platEncID, record.langID)
    name.setName(f'Subset of {origin}, modified for the Tuner app {changes}', 5, 3, 1, 0x409)


def save(font: TTFont, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.relative_to(out.parents[2])}: {out.stat().st_size} bytes, {len(font.getGlyphOrder())} glyphs')


def build_wordmark(source: str) -> None:
    font = TTFont(source)
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = True
    options.flavor = 'woff2'
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=WORDMARK_TEXT)
    subsetter.subset(font)
    missing = [c for c in WORDMARK_TEXT if ord(c) not in font.getBestCmap()]
    if missing:
        sys.exit(f'{source} lacks {"".join(missing)}')
    rename(font, WORDMARK_FAMILY, 'TunerWordmark-Bold', 'Noto Serif TC Bold by Google and Adobe',
           f'(only the glyphs of {WORDMARK_TEXT}). Not the original Noto Serif TC.')
    save(font, WORDMARK_OUT)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'Bravura.woff2')
    if len(sys.argv) > 2:
        build_wordmark(sys.argv[2])
