"""
Turns the scene's render passes (build.py, then exr.py) into the Chanukah card's assets and the design stills.

  python3 compose.py --src DIR [--assets src/assets/chanukah] [--stills design/chanukah] [--check DIR]

The app composites in display space (Canvas 2D adds 8-bit colours), so what ships is made for that:
  base-night.webp, base-day.webp   the scene with no flame lit, tone mapped, its sky transparent (alpha)
  empty-night.webp, empty-day.webp  the strip of cups (and the shamash's socket) with no oil and no candle,
                                    pasted over a cup that holds nothing tonight (and over the socket while
                                    the shamash is carried)
  light.webp                        an atlas of the nine lights (eight cups and the shamash) and the window
                                    across the alley: each tile is what that one light adds to the night
                                    picture, at a third of the base's resolution (light is soft)
  detail.webp                       the fine detail of the lit picture (stone grain, brass edges) as a ratio
                                    to its soft version, at full resolution: the card multiplies its sum of
                                    lights by it once, when it caches the steady light, so the light on the
                                    stone is sharp while the flicker on top of it is soft
  shamash.webp                      the shamash candle alone, lit by its own flame (drawn while it is carried)
  chanukahScene.ts (--ts)           where the flames, cups and sprites are, in base pixels
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--assets', default='')
ap.add_argument('--stills', default='')
ap.add_argument('--ts', default='', help='write the scene\'s numbers as a TypeScript module here')
ap.add_argument('--check', default='', help='write comparison pictures here')
ap.add_argument('--exposure', type=float, default=1.0)
ap.add_argument('--light-div', type=int, default=3, help='the light tiles are the base / this')
args = ap.parse_args()

EXPOSURE = 1.35 * args.exposure
LIGHT_GAIN = 1.0  # all flames together, relative to their render
DETAIL_MAX = 2.0  # the detail ratio is stored halved (the card adds the sharpened light twice)


def load(name):
    f = os.path.join(args.src, name + '.npy')
    # a quick look at a design renders only the night passes: the day falls back to the night
    if not os.path.exists(f) and name in FALLBACK:
        f = os.path.join(args.src, FALLBACK[name] + '.npy')
    a = np.load(f).astype(np.float32)
    # the card's frame: a little tighter than the render, so the chanukiah is the larger part of it
    k = a.shape[1] / info['size'][0]
    x0, y0, w, h = (round(v * k) for v in CROP)
    return a[y0 : y0 + h, x0 : x0 + w]


def resize(a, w, h, method=Image.BILINEAR):
    out = np.empty((h, w, a.shape[2]), np.float32)
    for c in range(a.shape[2]):
        out[..., c] = np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c]), mode='F').resize((w, h), method))
    return out


def down(a, k):
    """area average by k"""
    h, w = a.shape[0] // k, a.shape[1] // k
    return a[: h * k, : w * k].reshape(h, k, w, k, -1).mean(axis=(1, 3))


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def tone(lin):
    """scene-referred linear -> display: exposure, a filmic curve (ACES, fitted), sRGB"""
    x = np.maximum(lin * EXPOSURE, 0)
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    return srgb(y)


def unpremul(a):
    al = a[..., 3:4]
    rgb = np.where(al > 1e-4, a[..., :3] / np.maximum(al, 1e-4), 0)
    return rgb, al


def to8(x):
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)


def save(img, path, q=82, lossless=False):
    Image.fromarray(img).save(path, 'WEBP', quality=q, method=6, lossless=lossless, exact=True)
    return os.path.getsize(path)


FALLBACK = {'day_full': 'night_full', 'day_empty': 'night_empty'}
info = json.load(open(os.path.join(args.src, 'scene.json')))
# the crop of the render the card shows, in render pixels (x, y, w, h): multiples of 6, so the light passes
# (half resolution) and the light tiles (a third) crop on whole pixels
CROP = (72, 42, 816, 678) if info['size'][0] == 960 else (36, 21, 408, 339)


def shift(p):
    return [p[0] - CROP[0], p[1] - CROP[1]]


for sl in info['slots']:
    for key in ('foot', 'tip', 'mirror', 'mirrorTip'):
        sl[key] = shift(sl[key])
    sl['box'] = shift(sl['box'][:2]) + shift(sl['box'][2:])
info['shamash'] = {k_: shift(v) for k_, v in info['shamash'].items()}
info['socket'] = shift(info['socket'][:2]) + shift(info['socket'][2:])
info['window'] = shift(info['window'][:2]) + shift(info['window'][2:])
info['horizon'] -= CROP[1]
info['stile'] = [v - CROP[0] for v in info['stile']]
W, H = CROP[2], CROP[3]

night = load('night_full')
night_e = load('night_empty')
day = load('day_full')
day_e = load('day_empty')
lights = [load(f'light_{i}') for i in range(8)] + [load('light_s')]
window = load('window')
lh, lw = lights[0].shape[:2]
up = lambda a: resize(a, W, H)  # noqa: E731
L = [up(l) * LIGHT_GAIN for l in lights]
Lw = up(window)

# the base pictures (display space, sky transparent)
n_rgb, n_al = unpremul(night)
base_night = tone(n_rgb)
ne_rgb, ne_al = unpremul(night_e)
d_rgb, d_al = unpremul(day)
de_rgb, de_al = unpremul(day_e)
base_day = tone(d_rgb)

# each light's display-space delta over the night picture. The lights add in linear light; the card adds in
# display space. The delta of all of them together is shared out among them in proportion to their linear
# light, so all nine together are exact, and fewer are a little dimmer than exact (the curve's shoulder)
night_lin = n_rgb * n_al
lum = lambda a: a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722  # noqa: E731
total = sum(l[..., :3] for l in L)
d_all = tone(night_lin + total) - tone(night_lin)
share = [lum(l[..., :3]) / np.maximum(lum(total), 1e-6) for l in L]
D = [d_all * s[..., None] for s in share]
# the cups' light passes leave the shamash's candle out (it is not always in its socket), so the light they
# would lay on its wax goes with the shamash's own light instead: its wax, a little brighter where it stands
sh_mask = np.clip(load('shamash')[..., 3:4], 0, 1)
sh_mask[int(info['shamash']['rim'][1]) :] = 0
D[8] = D[8] + sh_mask * (0.6 * D[8] + np.array([0.10, 0.075, 0.045], np.float32))
# the window across the alley: its own delta (it never shares with the flames)
Dw = tone(night_lin + Lw[..., :3]) - tone(night_lin)

# the soft (low resolution) tiles, and the detail ratio
k = args.light_div
tw, th = W // k, H // k
Dl = [down(d, k) for d in D]
Dwl = down(Dw, k)
soft_all = up(down(d_all, k))
detail = d_all / np.maximum(soft_all, 1e-3)
detail = np.where(soft_all > 0.004, detail, 1.0)
detail = np.clip(detail, 0, DETAIL_MAX)


def composite(placed, lit, burn=0.0, flick=None, sky=None, day_k=0.0, win=0.0, use_detail=True, soft_only=False):
    """What the card shows (the same model as chanukahPaint.ts), for the stills and the checks"""
    if sky is None:
        sky = sky_grad(SKY_NIGHT)
    b = base_night * (1 - day_k) + base_day * day_k
    al = n_al * (1 - day_k) + d_al * day_k
    img = sky * (1 - al) + b * al
    # cups that hold nothing tonight: the empty strip
    e = tone(ne_rgb) * (1 - day_k) + tone(de_rgb) * day_k
    eal = ne_al * (1 - day_k) + de_al * day_k
    empty = sky * (1 - eal) + e * eal
    for i in range(8):
        if i < 8 - placed:
            x0, y0, x1, y1 = cup_box(i)
            img[y0:y1, x0:x1] = empty[y0:y1, x0:x1]
    acc = np.zeros((th, tw, 3), np.float32)
    for i in lit:
        w = 1.0 if flick is None else flick[i]
        acc += Dl[i] * w
    light = up(acc)
    if use_detail and not soft_only:
        light = light * detail
    # the window across the alley is soft light: no detail
    light = light + up(Dwl * win * (1 - day_k))
    return np.clip(img + light, 0, 1)


def cup_box(i):
    s = info['slots'][i]['box']
    # between the neighbours' centres, so the strips tile
    fx = [sl['foot'][0] for sl in info['slots'][:8]]
    x0 = (fx[i - 1] + fx[i]) / 2 if i > 0 else s[0] - 4
    x1 = (fx[i] + fx[i + 1]) / 2 if i < 7 else s[2] + 2
    return int(x0), int(s[1] - 4), int(np.ceil(x1)), int(np.ceil(s[3] + 3))


SKY_NIGHT = [(5, 8, 23), (11, 18, 48), (24, 32, 74)]
SKY_AFTER = [(34, 88, 159), (77, 132, 191), (217, 167, 111)]


def sky_grad(stops):
    t = np.linspace(0, 1, H)[:, None, None]
    a, b, c = [np.array(s, np.float32) / 255 for s in stops]
    top = a + (b - a) * np.clip(t / 0.55, 0, 1)
    g = np.where(t < 0.55, top, b + (c - b) * np.clip((t - 0.55) / 0.45, 0, 1))
    return np.broadcast_to(g, (H, W, 3)).astype(np.float32)


# ---------------------------------------------------------------- flames (the same model as the card's)


def flame_layer(img, foot, tip, k=1.0, lean=0.0, seed=0):
    """Paint a flame (additive light + a little cover) from its foot to its tip, both in base pixels"""
    fx, fy = foot
    tx, ty = tip
    Hf = (fy - ty) * 1.25 * k
    Wf = Hf * 0.40
    x0, x1 = int(fx - Wf * 2.2), int(fx + Wf * 2.2)
    y0, y1 = int(fy - Hf * 1.5), int(fy + Hf * 0.5)
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
    v = (fy - ys) / Hf  # 0 at the wick, 1 at the tip
    t = (v + 0.12) / 1.12
    prof = np.sqrt(np.clip(t, 0, 1)) * np.power(np.clip(1 - t, 0, 1), 0.9)
    peak = np.sqrt(0.36) * (0.64**0.9)
    r = prof / peak
    mid = fx + lean * np.power(np.clip(v, 0, None), 1.6)
    u = np.abs(xs - mid) / (Wf / 2)
    d = u / np.maximum(r, 1e-3)
    sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))  # noqa: E731
    body = np.power(1 - sm(0.2, 1.15, d), 1.2) * (t > 0) * (t < 1)
    heart = (1 - sm(0.0, 0.6, d)) * sm(0.08, 0.26, t) * (1 - sm(0.40, 0.78, t))
    cone = (1 - sm(0.0, 0.4, d)) * (1 - sm(0.06, 0.24, t))
    tipf = sm(0.55, 1.0, t)
    Lv = body * (0.5 + 0.5 * heart) * (1 - 0.5 * cone) * (1 - 0.4 * tipf)
    EDGE = np.array([1.0, 0.42, 0.10])
    AMBER = np.array([1.0, 0.66, 0.26])
    GOLD = np.array([1.0, 0.86, 0.55])
    WHITE = np.array([1.0, 0.97, 0.88])
    Lc = Lv[..., None]
    col = np.where(Lc < 0.3, EDGE + (AMBER - EDGE) * (Lc / 0.3), np.where(Lc < 0.62, AMBER + (GOLD - AMBER) * ((Lc - 0.3) / 0.32), GOLD + (WHITE - GOLD) * np.clip((Lc - 0.62) / 0.3, 0, 1)))
    a = np.clip(body * (0.3 + 1.0 * Lv), 0, 1) * (1 - 0.5 * tipf**2)
    blue = sm(0.4, 0.92, d) * (1 - sm(0.95, 1.25, d)) * (1 - sm(0.02, 0.15, t)) * (t > 0)
    col = col * (1 - blue[..., None] * 0.5) + np.array([0.35, 0.45, 1.0]) * blue[..., None] * 0.5
    a = np.clip(a + blue * 0.35, 0, 1)
    # the air round a flame glows a little (as it does to the eye and to a lens)
    rr = np.sqrt(((xs - fx) / (Hf * 0.9)) ** 2 + ((ys - (fy - Hf * 0.42)) / (Hf * 1.1)) ** 2)
    glow = 0.3 / (1 + (rr / 0.32) ** 2) * np.clip(1 - rr / 1.6, 0, 1) * k
    reg = img[y0:y1, x0:x1]
    reg[:] = reg * (1 - a[..., None]) + col * a[..., None]
    reg += np.array([1.0, 0.62, 0.3]) * glow[..., None]
    np.clip(reg, 0, 1, out=reg)


def with_flames(img, lit, scale=1.0):
    img = img.copy()
    st = info.get('stile', [0, 0])
    for i in lit:
        s = info['slots'][i]
        # the faint reflection in the window's glass (none on the stile where the leaves meet)
        if not (st[0] - 3 < s['mirror'][0] < st[1] + 3):
            refl = np.zeros_like(img)
            flame_layer(refl, s['mirror'], s['mirrorTip'], k=scale)
            img += refl * 0.22
        flame_layer(img, s['foot'], s['tip'], k=scale)
    return np.clip(img, 0, 1)


def phone(img, w=358 * 2):
    h = round(img.shape[0] * w / img.shape[1])
    return np.asarray(Image.fromarray(to8(img)).resize((w, h), Image.LANCZOS))


placed5 = list(range(3, 8))
lit5 = placed5 + [8]

if args.check:
    os.makedirs(args.check, exist_ok=True)
    full = with_flames(composite(5, lit5), lit5)
    Image.fromarray(phone(full)).save(os.path.join(args.check, 'lit5.png'))
    Image.fromarray(phone(composite(5, []))).save(os.path.join(args.check, 'before5.png'))
    soft = with_flames(composite(5, lit5, soft_only=True), lit5)
    Image.fromarray(phone(soft)).save(os.path.join(args.check, 'lit5-soft.png'))
    # the exact (linear) composite of the same lights, to see what the display-space sum costs
    ex_lin = night_lin + sum(L[i][..., :3] for i in lit5)
    ex = sky_grad(SKY_NIGHT) * (1 - n_al) + tone(ex_lin / np.maximum(n_al, 1e-4)) * n_al
    Image.fromarray(phone(with_flames(np.clip(ex, 0, 1), lit5))).save(os.path.join(args.check, 'lit5-exact.png'))
    lit8 = list(range(9))
    Image.fromarray(phone(with_flames(composite(8, lit8), lit8))).save(os.path.join(args.check, 'lit8.png'))
    Image.fromarray(phone(composite(5, [], sky=sky_grad(SKY_AFTER), day_k=1.0))).save(os.path.join(args.check, 'day5.png'))
    Image.fromarray(phone(with_flames(composite(5, lit5, win=1.0), lit5))).save(os.path.join(args.check, 'lit5-win.png'))
    print('checks in', args.check)

if args.stills:
    lit = with_flames(composite(5, lit5, win=1.0), lit5)
    Image.fromarray(to8(lit)).save(os.path.join(args.stills, 'v2-still-lit.png'))
    before = composite(5, [], win=1.0)
    Image.fromarray(to8(before)).save(os.path.join(args.stills, 'v2-still-before.png'))
    print('stills in', args.stills)

if args.assets:
    os.makedirs(args.assets, exist_ok=True)
    sizes = {}
    sizes['base-night'] = save(to8(np.concatenate([base_night, n_al], -1)), os.path.join(args.assets, 'base-night.webp'), q=88)
    sizes['base-day'] = save(to8(np.concatenate([base_day, d_al], -1)), os.path.join(args.assets, 'base-day.webp'), q=74)
    # the empty strip: from the leftmost cup to the shamash's socket
    boxes = [cup_box(i) for i in range(8)]
    sb = info['socket']
    sx0 = min(b[0] for b in boxes)
    sy0 = int(min(min(b[1] for b in boxes), sb[1] - 4))
    sx1 = int(np.ceil(sb[2] + 4))
    sy1 = max(b[3] for b in boxes)
    strip = {'x': sx0, 'y': sy0, 'w': sx1 - sx0, 'h': sy1 - sy0}
    for nm, rgb, al in (('empty-night', ne_rgb, ne_al), ('empty-day', de_rgb, de_al)):
        sizes[nm] = save(to8(np.concatenate([tone(rgb), al], -1)[sy0:sy1, sx0:sx1]), os.path.join(args.assets, nm + '.webp'), q=86)
    # the light atlas: 10 tiles in two rows of five; each tile's values scaled to use the 8 bits well
    tiles = Dl + [Dwl]
    gains = [float(max(np.percentile(t, 99.97), 1e-3)) for t in tiles]
    atlas = np.zeros((th * 2, tw * 5, 3), np.float32)
    for j, (t, g) in enumerate(zip(tiles, gains)):
        r, c = divmod(j, 5)
        atlas[r * th : (r + 1) * th, c * tw : (c + 1) * tw] = t / g
    sizes['light'] = save(to8(atlas), os.path.join(args.assets, 'light.webp'), q=88)
    # the detail ratio, halved so it fits 8 bits (the card doubles it back)
    sizes['detail'] = save(to8(detail / DETAIL_MAX), os.path.join(args.assets, 'detail.webp'), q=85)
    # the shamash sprite
    sh = load('shamash')
    s_rgb, s_al = unpremul(sh)
    # the part of the candle that was down in the socket (in its shadow) is left out: it is the socket's rim
    s_al[int(np.ceil(info['shamash']['rim'][1])) :] = 0
    ys, xs = np.nonzero(s_al[..., 0] > 0.01)
    bx0, by0, bx1, by1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
    sizes['shamash'] = save(to8(np.concatenate([tone(s_rgb), s_al], -1)[by0:by1, bx0:bx1]), os.path.join(args.assets, 'shamash.webp'), q=90)
    meta = {
        'size': [W, H],
        'tile': [tw, th],
        'cols': 5,
        'gains': [round(g, 5) for g in gains],
        'detailMax': DETAIL_MAX,
        'strip': strip,
        'cups': [list(cup_box(i)) for i in range(8)],
        'flames': [{'foot': [round(v, 1) for v in s['foot']], 'tip': [round(v, 1) for v in s['tip']], 'mirror': [round(v, 1) for v in s['mirror']], 'mirrorTip': [round(v, 1) for v in s['mirrorTip']]} for s in info['slots']],
        'shamash': {'sprite': [int(bx0), int(by0), int(bx1 - bx0), int(by1 - by0)], 'foot': [round(v, 1) for v in info['shamash']['foot']], 'wick': [round(v, 1) for v in info['shamash']['wick']]},
        'window': [round(v, 1) for v in info['window']],
        'horizon': round(info['horizon'], 1),
        'stile': [round(v, 1) for v in info['stile']],
        'socket': [int(info['socket'][0]) - 2, int(info['socket'][1]) - 2, int(np.ceil(info['socket'][2])) + 2, int(np.ceil(info['socket'][3])) + 2],
    }
    if args.ts:
        with open(args.ts, 'w') as f:
            f.write('// Written by scripts/chanukah-scene/compose.py: where things are in the scene\'s pictures (base pixels)\n')
            f.write('export const SCENE = ' + json.dumps(meta) + ' as const;\n')
    print({k: f'{v / 1024:.1f}KB' for k, v in sizes.items()}, f'total {sum(sizes.values()) / 1024:.1f}KB')
