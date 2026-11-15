"""Builds two tiny fonts that hold only the geresh (U+05F3) and gershayim (U+05F4).

They are placed first in the font stacks with a matching unicode-range, so every ׳ and ״ in the
app comes from them: a slanted mark that can't be read as a yod (Frank Ruhl Libre draws it as an
upright stroke, so ה׳ looked like הי), with extra room between it and the letter before it.

Run: python3 scripts/build-geresh-fonts.py  (needs fonttools and brotli)
"""
from fontTools import subset
from fontTools.ttLib import TTFont

SRC = 'node_modules/@fontsource'
FONTS = [
    # (source, output, extra space before the mark as a share of the em)
    (f'{SRC}/david-libre/files/david-libre-hebrew-500-normal.woff2', 'src/fonts/geresh-serif.woff2', 0.07),
    (f'{SRC}/ibm-plex-sans-hebrew/files/ibm-plex-sans-hebrew-hebrew-500-normal.woff2', 'src/fonts/geresh-sans.woff2', 0.05),
]

for src, out, extra in FONTS:
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[0x05F3, 0x05F4])
    sub.subset(font)
    add = round(font['head'].unitsPerEm * extra)
    cmap = font.getBestCmap()
    for cp in (0x05F3, 0x05F4):
        g = cmap[cp]
        adv, lsb = font['hmtx'][g]
        # in a right-to-left line the letter before the mark sits on its right side:
        # a wider advance (same outline position) is more room on that side
        font['hmtx'][g] = (adv + add, lsb)
    font.save(out)
    print(out, 'ok')
