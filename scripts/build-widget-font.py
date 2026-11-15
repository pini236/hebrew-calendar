"""Builds the one font the Android home-screen widgets draw with: the Hebrew date, and the Omer widget's figures.

Frank Ruhl Libre 500 (Hebrew letters, and the Latin subset for the Omer widget's "158" and its English), with the
geresh (U+05F3) and gershayim (U+05F4)
taken from David Libre 500 and given extra room before them, like the app does with its
'Geresh Serif' font (scripts/build-geresh-fonts.py): Frank Ruhl draws the mark as an upright
stroke, so ה׳ reads like הי. Android's Typeface can't load woff2, so the result is a plain TTF.

Run: python3 scripts/build-widget-font.py  (needs fonttools and brotli)
Output: android/app/src/main/assets/fonts/widget_date.ttf (the widget previews use it too)
"""
import os
import tempfile

from fontTools.merge import Merger
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

SRC = 'node_modules/@fontsource'
BASE = f'{SRC}/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-500-normal.woff2'
MARKS = f'{SRC}/david-libre/files/david-libre-hebrew-500-normal.woff2'
LATIN = f'{SRC}/frank-ruhl-libre/files/frank-ruhl-libre-latin-500-normal.woff2'
OUT = 'android/app/src/main/assets/fonts/widget_date.ttf'
EXTRA = 0.04  # extra space before the mark, as a share of the em (a little less than the app: the date is large)

font = TTFont(BASE)
marks = TTFont(MARKS)
scale = font['head'].unitsPerEm / marks['head'].unitsPerEm
add = round(font['head'].unitsPerEm * EXTRA)
src_gs = marks.getGlyphSet()
cmap = font.getBestCmap()
mcmap = marks.getBestCmap()
for cp in (0x05F3, 0x05F4):
    g = cmap[cp]
    pen = TTGlyphPen(None)
    src_gs[mcmap[cp]].draw(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
    glyph = pen.glyph()
    glyph.recalcBounds(font['glyf'])
    font['glyf'][g] = glyph
    adv, _ = marks['hmtx'][mcmap[cp]]
    # in a right-to-left line the letter before the mark sits on its right side:
    # a wider advance (same outline position) is more room on that side
    font['hmtx'][g] = (round(adv * scale) + add, glyph.xMin if glyph.numberOfContours else 0)

font.flavor = None
# the Latin letters and digits of the same family, merged in (the Hebrew font's own glyphs win where both have one)
with tempfile.TemporaryDirectory() as tmp:
    heb = os.path.join(tmp, 'hebrew.ttf')
    lat = os.path.join(tmp, 'latin.ttf')
    font.save(heb)
    latin = TTFont(LATIN)
    latin.flavor = None
    latin.save(lat)
    Merger().merge([heb, lat]).save(OUT)
print(OUT, 'ok')
