/**
 * The painter behind <SkyScene>: one Canvas 2D, a few cached layers, and a calm loop (20fps at rest,
 * 30fps while the day changes; the loop itself lives in SkyScene).
 *
 * What is real (handed in by SkyScene, never computed here): the sky colours (skyAt(), the same colours
 * as the day ribbon), the sun's place along the day (the fraction between KosherJava's sunrise and
 * sunset), its height and the depth of twilight (KosherJava's solar elevation), the moon's phase (the
 * Hebrew date), whether Shabbat candles are lit (Hebcal's candle lighting and havdalah) and how many
 * Chanukah candles burn tonight (the seasons engine, src/lib/seasons/chanukah.ts).
 * What is made up, seeded so it is the same every time: the shape of the land, the distant houses, the
 * stars' places and the high clouds (the app has no weather data).
 *
 * Why Canvas and not SVG: the scene is ~10 soft gradients, ~70 stars, four ridgelines and a few hundred
 * tiny shapes. As SVG + CSS that is a large DOM whose blurred layers the browser repaints on every cloud
 * step; here every layer is painted once per minute (or when the day changes) into an offscreen canvas,
 * and a frame at rest redraws only the band of sky the clouds cross and the box around the candles.
 * No images, no network, no dependencies.
 */

type RGB = [number, number, number];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;

/** A colour keyed to the sun's elevation (degrees), linear between keys */
function ramp(e: number, keys: [number, RGB][]): RGB {
  if (e <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (e <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], (e - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  }
  return keys[keys.length - 1][1];
}
function rampN(e: number, keys: [number, number][]): number {
  if (e <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (e <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * ((e - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  }
  return keys[keys.length - 1][1];
}

/** mulberry32: a small seeded random, so the land and the stars never change between frames or visits */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D value noise: a sum of octaves [wavelength px, amplitude px] */
function ridgeNoise(seed: number, octaves: [number, number][]) {
  const tables = octaves.map((_, i) => {
    const r = rng(seed * 31 + i * 977);
    return Array.from({ length: 512 }, () => r() * 2 - 1);
  });
  return (x: number) => {
    let y = 0;
    octaves.forEach(([wl, amp], i) => {
      const p = x / wl + 64;
      const i0 = Math.floor(p);
      const f = p - i0;
      const t = tables[i];
      const a = t[i0 & 511];
      const b = t[(i0 + 1) & 511];
      y += (a + (b - a) * (1 - Math.cos(f * Math.PI)) * 0.5) * amp;
    });
    return y;
  };
}

/** The app's one easing curve, cubic-bezier(0.22, 1, 0.36, 1) */
function ease(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  const bx = (u: number) => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3;
  const by = (u: number) => 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 18; i++) {
    u = (lo + hi) / 2;
    if (bx(u) < t) lo = u;
    else hi = u;
  }
  return by(u);
}

/* ---------------- palettes, keyed to the sun's elevation in degrees ---------------- */

// the nearest ground: deep bottle green by day (the diary's cloth), ink at night; white text sits on it
const NEAR: [number, RGB][] = [
  [-18, [8, 12, 21]],
  [-9, [13, 16, 31]],
  [-3, [28, 24, 43]],
  [2, [36, 32, 44]],
  [9, [27, 50, 45]],
  [22, [22, 63, 50]],
];
// the middle hills before the air between us and them is added
const MID: [number, RGB][] = [
  [-18, [13, 18, 33]],
  [-9, [22, 25, 46]],
  [-3, [50, 40, 66]],
  [2, [72, 56, 72]],
  [9, [56, 84, 72]],
  [22, [50, 102, 80]],
];
// the glow on the horizon where the sun is, or is about to be
const GLOW: [number, RGB][] = [
  [-16, [104, 78, 138]],
  [-9, [196, 108, 122]],
  [-4, [240, 138, 96]],
  [0, [255, 166, 108]],
  [6, [255, 206, 156]],
  [14, [255, 236, 210]],
];
const GLOW_AMOUNT: [number, number][] = [
  [-18, 0],
  [-12, 0.35],
  [-6, 0.85],
  [-1, 1],
  [4, 0.75],
  [12, 0.22],
  [30, 0.1],
];
const SUN: [number, RGB][] = [
  [-1, [255, 150, 92]],
  [3, [255, 196, 138]],
  [10, [255, 234, 202]],
  [25, [255, 249, 238]],
];
// clouds: the lit side and the shaded side
const CLOUD_LIT: [number, RGB][] = [
  [-16, [40, 47, 80]],
  [-9, [84, 70, 110]],
  [-3, [232, 146, 126]],
  [2, [255, 192, 146]],
  [8, [255, 234, 212]],
  [20, [255, 255, 252]],
];
const CLOUD_SHADE: [number, RGB][] = [
  [-16, [22, 28, 54]],
  [-9, [42, 40, 76]],
  [-3, [98, 78, 122]],
  [2, [164, 124, 146]],
  [8, [196, 192, 210]],
  [20, [210, 221, 236]],
];
const CLOUD_ALPHA: [number, number][] = [
  [-16, 0.14],
  [-8, 0.32],
  [-2, 0.85],
  [20, 0.9],
];
const WINDOW: RGB = [255, 208, 140];
const MOON: RGB = [244, 238, 222];

/* ---------------- input ---------------- */

export interface SkyInput {
  /** the moment drawn (ms) */
  at: number;
  /** KosherJava sunrise and sunset of the day (ms) */
  rise: number;
  set: number;
  /** solar elevation at `at`, degrees (KosherJava NOAA) */
  elev: number;
  /** the sky's three colours (top, middle, horizon) from skyAt() */
  sky: [RGB, RGB, RGB];
  /** the moon: lit fraction 0..1, waxing or waning, and its place (degrees; azimuth from south, west positive) */
  moonIllum: number;
  moonWaxing: boolean;
  moonAlt: number;
  moonAz: number;
  /** Shabbat or Yom Tov candles are burning (candle lighting → havdalah) */
  candles: boolean;
  /** Chanukah: how many candles burn tonight (1–8; the shamash burns with them), 0 or absent for none */
  chanukah?: number;
  /** 0 in the evening → 1 after chatzot halayla (most windows go dark) */
  late: number;
  /** 0..1 how many high clouds today (made up, seeded by the date) */
  clouds: number;
  /** Hebrew: morning on the right (as the day ribbon) */
  rtl: boolean;
}

/* ---------------- geometry: built once per size ---------------- */

interface Star {
  x: number;
  y: number;
  r: number;
  /** 0 = brightest … 1 = faintest */
  m: number;
  c: RGB;
}
interface Win {
  x: number;
  y: number;
  thr: number;
}
interface Cloud {
  mask: HTMLCanvasElement;
  w: number;
  h: number;
  y: number;
  x0: number;
  speed: number;
  weight: number;
  /** cirrus streaks are thinner and stay longer at dusk */
  streak: boolean;
}
interface Geom {
  W: number;
  H: number;
  M: number;
  dpr: number;
  rtl: boolean;
  yH: number;
  /** where the sun touches the land: the far ridge's mean line, so it sets behind the hills at sunset */
  sunLine: number;
  ground: number;
  far: Path2D;
  hill: Path2D;
  mid: Path2D;
  hillDots: Path2D;
  midDots: Path2D;
  nearDots: Path2D;
  near: Path2D;
  farTop: number;
  hillTop: number;
  midTop: number;
  nearTop: number;
  windows: Win[];
  stars: Star[];
  clouds: Cloud[];
  noise: HTMLCanvasElement;
  /** the clouds never go below this (css px) */
  cloudBand: number;
  candle: { x: number; y: number };
}

const SEED = 5786;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function buildGeom(W: number, H: number, dpr: number, rtl: boolean, ground: number, foot: number): Geom {
  const M = Math.round(W * 0.16); // parallax margin on each side
  const LW = W + 2 * M;
  const nearY0 = H - ground; // the ground the date sits on
  const yH = Math.min(nearY0 - 14, H - 112); // the horizon
  // u = 0 is the morning side, 1 the evening side; Hebrew puts the morning on the right
  const X = (u: number) => (rtl ? W * (1 - u) : W * u) + M; // to layer coordinates
  const U = (lx: number) => (rtl ? 1 - (lx - M) / W : (lx - M) / W);

  // four soft ridges, each nearer one darker and less hazy
  const farN = ridgeNoise(SEED + 1, [
    [260, 12],
    [110, 4.5],
    [40, 1.3],
  ]);
  const hillN = ridgeNoise(SEED + 7, [
    [190, 7],
    [70, 2.6],
    [26, 0.8],
  ]);
  const midN = ridgeNoise(SEED + 2, [
    [150, 5.5],
    [56, 2.2],
    [20, 0.7],
  ]);
  const nearN = ridgeNoise(SEED + 3, [
    [150, 4],
    [52, 1.5],
    [18, 0.45],
  ]);
  const farY = (u: number) => yH - 15 + farN(u * W);
  const hillY = (u: number) => yH - 3 + hillN(u * W + 400);
  const midY = (u: number) => yH + 9 + midN(u * W) + 3 * smooth(0.55, 0.85, u);
  // the near ground is a touch higher on the morning side, where the date is
  const nearY = (u: number) => nearY0 + 4 * smooth(0.25, 0.95, u) - 1 + nearN(u * W);

  const ridge = (f: (u: number) => number) => {
    const p = new Path2D();
    let top = H;
    p.moveTo(0, H + 2);
    for (let lx = 0; lx <= LW + 3; lx += 3) {
      const y = f(U(lx));
      top = Math.min(top, y);
      p.lineTo(lx, y);
    }
    p.lineTo(LW + 3, H + 2);
    p.closePath();
    return { p, top };
  };
  const far = ridge(farY);
  const hill = ridge(hillY);
  const mid = ridge(midY);
  const near = ridge(nearY);
  const r = rng(SEED + 9);

  // a tree: a loose crown of a few overlapping rounds on a short trunk
  const tree = (p: Path2D, x: number, base: number, s: number, rr: () => number) => {
    p.rect(x - s * 0.09, base - s * 0.7, s * 0.18, s * 0.75);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rr();
      const cx = x + Math.cos(a) * s * 0.42;
      const cy = base - s * 1.15 + Math.sin(a) * s * 0.28;
      const rad = s * (0.42 + rr() * 0.18);
      p.moveTo(cx + rad, cy);
      p.arc(cx, cy, rad, 0, Math.PI * 2);
    }
    return base - s * 1.75;
  };
  const cypress = (p: Path2D, x: number, base: number, h: number, w: number) => {
    p.moveTo(x, base + 1);
    p.quadraticCurveTo(x - w, base - h * 0.42, x, base - h);
    p.quadraticCurveTo(x + w, base - h * 0.42, x, base + 1);
    return base - h;
  };

  // small trees scattered on the middle hills
  for (let i = 0; i < 11; i++) {
    const u = -0.1 + r() * 0.72;
    const sz = 2.4 + r() * 2.2;
    mid.top = Math.min(mid.top, tree(mid.p, X(u), midY(u) + 1, sz, r));
  }
  for (let i = 0; i < 4; i++) {
    const u = 0.1 + r() * 0.45;
    mid.top = Math.min(mid.top, cypress(mid.p, X(u), midY(u) + 1, 7 + r() * 4, 1.4));
  }
  // a small group on the near ground, away from the date: an olive-like tree and two cypresses
  {
    const u1 = 0.83;
    near.top = Math.min(near.top, tree(near.p, X(u1), nearY(u1) + 1.5, 9, rng(SEED + 12)));
    const u2 = 0.875;
    near.top = Math.min(near.top, cypress(near.p, X(u2), nearY(u2) + 1, 26, 3.4));
    const u3 = 0.895;
    near.top = Math.min(near.top, cypress(near.p, X(u3), nearY(u3) + 1, 19, 2.8));
  }

  // texture: olive trees and scrub dotted over the slopes, smaller and fainter further away
  const dots = (f: (u: number) => number, below: (u: number) => number, n: number, r0: number, r1: number, u0: number, u1: number, skip?: (u: number) => boolean) => {
    const p = new Path2D();
    for (let i = 0; i < n; i++) {
      const u = u0 + r() * (u1 - u0);
      if (skip?.(u)) continue;
      const top = f(u) + 1.5;
      const y = top + Math.pow(r(), 1.6) * Math.max(0, below(u) - top);
      const rad = r0 + r() * (r1 - r0);
      p.moveTo(X(u) + rad, y);
      p.ellipse(X(u), y, rad, rad * 0.8, 0, 0, Math.PI * 2);
    }
    return p;
  };
  const hillDots = dots(hillY, midY, 36, 0.5, 1, -0.16, 1.16);
  const midDots = dots(midY, (u) => Math.min(nearY(u), midY(u) + 9), 44, 0.7, 1.4, -0.16, 1.16);
  const nearDots = dots(nearY, (u) => nearY(u) + 7, 26, 1.2, 2.6, 0.7, 1.16);

  // a far-off town on the middle hills, on the evening side: flat roofs, nothing that names one city
  const windows: Win[] = [];
  {
    const r = rng(SEED + 21);
    let u = 0.58;
    while (u < 0.76) {
      const w = 3 + r() * 6;
      const tall = r() < 0.1;
      const h = tall ? 7 + r() * 4 : 2 + r() * 4.5;
      const du = w / W;
      const base = Math.max(midY(u), midY(u + du)) + 1.5;
      const top = base - 1.5 - h;
      const x0 = rtl ? X(u + du) : X(u);
      mid.p.rect(x0, top, w, base - top + 2);
      mid.top = Math.min(mid.top, top);
      for (let wy = top + 1.6; wy < base - 1.4; wy += 2.6) {
        for (let wx = x0 + 1.2; wx < x0 + w - 1.2; wx += 2.4) {
          if (r() < 0.42) windows.push({ x: wx, y: wy, thr: r() });
        }
      }
      u += du + (r() < 0.25 ? (2 + r() * 8) / W : r() * 1.2 / W);
    }
  }

  // stars: sparse and uneven, most of them faint
  const stars: Star[] = [];
  const area = W * yH;
  const n = Math.round(area / 850);
  const rs = rng(SEED + 4);
  for (let i = 0; i < n; i++) {
    const m = Math.pow(rs(), 0.55);
    const t = rs();
    stars.push({
      x: rs() * (W + 60) - 30,
      y: 4 + Math.pow(rs(), 1.15) * (yH - 10),
      r: 0.42 + 0.95 * (1 - m) ** 2.2,
      m,
      c: t < 0.14 ? [255, 228, 196] : t < 0.26 ? [212, 224, 255] : [246, 246, 250],
    });
  }

  // high clouds: a few soft puffs and long thin streaks, painted once as alpha masks
  const clouds: Cloud[] = [];
  const rc = rng(SEED + 5);
  const specs = [
    { streak: true, y: 0.14, w: 210, h: 26 },
    { streak: false, y: 0.36, w: 120, h: 40 },
    { streak: true, y: 0.28, w: 170, h: 22 },
    { streak: false, y: 0.5, w: 92, h: 32 },
  ];
  specs.forEach((s, i) => {
    const w = s.w * (0.85 + rc() * 0.3);
    const h = s.h;
    // room around the shape so no soft edge is cut off
    const px = s.streak ? 48 : 30;
    const py = s.streak ? 10 : 28;
    const mask = makeCanvas((w + 2 * px) * dpr, (h + 2 * py) * dpr);
    const g = mask.getContext('2d')!;
    g.scale(dpr, dpr);
    g.translate(px, py);
    const rr = rng(SEED + 40 + i);
    const blob = (x: number, y: number, rx: number, ry: number, a: number, soft = 0.55) => {
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(soft, `rgba(255,255,255,${a * (soft > 0.6 ? 0.85 : 0.55)})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, rx, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    if (s.streak) {
      // cirrus: many long, low strands along a gentle curve
      for (let k = 0; k < 26; k++) {
        const t = rr();
        const x = w * (0.12 + t * 0.76);
        const y = h * 0.5 + Math.sin(t * 3.2 + i) * h * 0.18 + (rr() - 0.5) * h * 0.28;
        blob(x, y, 14 + rr() * 30, 1.6 + rr() * 2.6, 0.22 + rr() * 0.22);
      }
    } else {
      // a small flat-bottomed puff
      for (let k = 0; k < 16; k++) {
        const t = rr();
        const x = w * (0.18 + t * 0.64);
        const dome = Math.sin(t * Math.PI);
        const rad = 6 + dome * 9 + rr() * 5;
        const y = h * 0.72 - dome * h * 0.28 - rr() * 4;
        blob(x, y, rad * 1.25, rad, 0.62 + rr() * 0.3, 0.72);
      }
      // flatten the base
      g.globalCompositeOperation = 'destination-out';
      const cut = g.createLinearGradient(0, h * 0.7, 0, h * 0.92);
      cut.addColorStop(0, 'rgba(0,0,0,0)');
      cut.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = cut;
      g.fillRect(-px, -py, w + 2 * px, h + 2 * py);
      g.globalCompositeOperation = 'source-over';
    }
    clouds.push({
      mask,
      w: w + 2 * px,
      h: h + 2 * py,
      y: 8 + s.y * (yH - 70) - py,
      x0: rc() * (W + w),
      speed: s.streak ? 1.6 + rc() * 1.2 : 3 + rc() * 1.8,
      weight: i < 2 ? 1 : 0.55 + i * 0.12,
      streak: s.streak,
    });
  });

  // a fine noise tile, laid over the sky so its long gradients don't band on 8-bit screens
  const noise = makeCanvas(96, 96);
  {
    const g = noise.getContext('2d')!;
    const img = g.createImageData(96, 96);
    const rn = rng(SEED + 6);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rn() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.round(rn() * 9);
    }
    g.putImageData(img, 0, 0);
  }

  const cu = 0.9;
  return {
    W,
    H,
    M,
    dpr,
    rtl,
    yH,
    sunLine: yH - 14,
    ground,
    far: far.p,
    hill: hill.p,
    mid: mid.p,
    hillDots,
    midDots,
    nearDots,
    near: near.p,
    farTop: far.top,
    hillTop: hill.top,
    midTop: mid.top,
    nearTop: near.top,
    windows,
    stars,
    clouds,
    noise,
    cloudBand: Math.min(H, Math.ceil(Math.max(...clouds.map((c) => c.y + c.h))) + 2),
    candle: { x: X(cu) - M, y: H - foot + 2 },
  };
}

/* ---------------- one painted state: the sky of one moment ---------------- */

interface Slot {
  input: SkyInput | null;
  sky: HTMLCanvasElement;
  /** the sky with the sun in it, for frames at rest */
  lit: HTMLCanvasElement;
  far: HTMLCanvasElement;
  hill: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
  front: HTMLCanvasElement;
  tints: HTMLCanvasElement[];
  cloudAlpha: number;
  sun: Sun | null;
}

function sunPlace(g: Geom, s: SkyInput) {
  const f = (s.at - s.rise) / (s.set - s.rise);
  const u = 0.1 + 0.8 * Math.max(-0.08, Math.min(1.08, f));
  const x = g.rtl ? g.W * (1 - u) : g.W * u;
  const e = Math.max(-4, s.elev);
  const y = g.sunLine - Math.sin((e * Math.PI) / 180) * (g.sunLine - 30);
  return { x, y };
}

function paintSlot(slot: Slot, g: Geom, s: SkyInput) {
  const { W, H, M, dpr, yH } = g;
  const e = s.elev;
  const [top, midC, bottom] = s.sky;

  /* sky */
  {
    const c = slot.sky;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    const gr = x.createLinearGradient(0, 0, 0, yH + 12);
    gr.addColorStop(0, rgba(top));
    gr.addColorStop(0.55, rgba(midC));
    gr.addColorStop(1, rgba(bottom));
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);

    const sp = sunPlace(g, s);
    // the glow on the horizon at the sun's side: before sunrise it tells where the sun will come up
    const ga = rampN(e, GLOW_AMOUNT);
    if (ga > 0.01) {
      const gc = ramp(e, GLOW);
      x.save();
      x.translate(Math.max(-W * 0.05, Math.min(W * 1.05, sp.x)), g.sunLine + 6);
      x.scale(1, 0.42);
      const rad = W * 0.75;
      const gg = x.createRadialGradient(0, 0, 0, 0, 0, rad);
      gg.addColorStop(0, rgba(gc, 0.62 * ga));
      gg.addColorStop(0.35, rgba(gc, 0.3 * ga));
      gg.addColorStop(1, rgba(gc, 0));
      x.fillStyle = gg;
      x.fillRect(-rad, -rad, rad * 2, rad * 2);
      x.restore();
    }

    // stars: bright ones come out first (from ~4° below the horizon), the faint ones by ~12°;
    // a bright moon washes the faintest out, and they dim near the horizon
    // seen once the sky darkens, and only while it's above the horizon
    const moonVis = s.moonIllum > 0.02 && s.moonAlt > 0 ? smooth(-1, -6, e) * clamp01(s.moonAlt / 3) : 0;
    const starsOn = smooth(-3, -12.5, e);
    if (starsOn > 0) {
      const hours = (s.at - s.set) / 3600000;
      const drift = (hours * 7) % (W + 60); // the sky turns, slowly, toward the evening side
      for (const st of g.stars) {
        const thr = -3.6 - 8.6 * st.m;
        let a = clamp01((thr - e) / 2.4);
        if (a <= 0) continue;
        a *= 0.35 + 0.65 * (1 - st.m);
        a *= 1 - 0.6 * s.moonIllum * moonVis * st.m;
        a *= 0.3 + 0.7 * clamp01((yH - 6 - st.y) / (yH * 0.42));
        let sx = st.x + (g.rtl ? -drift : drift);
        sx = ((((sx + 30) % (W + 60)) + (W + 60)) % (W + 60)) - 30;
        if (st.m < 0.12) {
          const hg = x.createRadialGradient(sx, st.y, 0, sx, st.y, st.r * 4);
          hg.addColorStop(0, rgba(st.c, 0.16 * a));
          hg.addColorStop(1, rgba(st.c, 0));
          x.fillStyle = hg;
          x.fillRect(sx - st.r * 4, st.y - st.r * 4, st.r * 8, st.r * 8);
        }
        x.fillStyle = rgba(st.c, a);
        x.beginPath();
        x.arc(sx, st.y, st.r, 0, Math.PI * 2);
        x.fill();
      }
    }

    // the moon at its real place: east on the morning side (right in Hebrew), height by its altitude;
    // its lit side faces where the sun went down (waxing) or where it will come up (waning)
    if (moonVis > 0.01) {
      const east = Math.max(-1, Math.min(1, -s.moonAz / 120)); // 1 = due east-ish, -1 = west
      const cx = W * (0.5 + (g.rtl ? 0.42 : -0.42) * east);
      const cy = Math.max(24, yH - 8 - (Math.min(s.moonAlt, 70) / 70) * (yH - 36));
      const r = 10.5;
      const k = s.moonIllum;
      const a = moonVis;
      const halo = x.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 6);
      halo.addColorStop(0, rgba(MOON, 0.16 * a * (0.25 + 0.75 * k)));
      halo.addColorStop(0.3, rgba(MOON, 0.06 * a * (0.25 + 0.75 * k)));
      halo.addColorStop(1, rgba(MOON, 0));
      x.fillStyle = halo;
      x.fillRect(cx - r * 6, cy - r * 6, r * 12, r * 12);
      // earthshine on the dark part
      x.fillStyle = rgba([150, 162, 196], 0.06 * a * (1 - k));
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
      const litRight = (s.moonWaxing ? 1 : -1) * (g.rtl ? -1 : 1) > 0;
      const crescent = k < 0.5;
      const ex = Math.max(0.01, Math.abs(1 - 2 * k) * r);
      x.save();
      x.beginPath();
      x.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !litRight);
      x.ellipse(cx, cy, ex, r, 0, Math.PI / 2, -Math.PI / 2, litRight === crescent);
      x.closePath();
      const mg = x.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r);
      mg.addColorStop(0, rgba([250, 246, 234], a));
      mg.addColorStop(1, rgba([218, 210, 192], a));
      x.fillStyle = mg;
      x.fill();
      x.clip();
      // a few soft seas
      x.fillStyle = rgba([150, 146, 140], 0.16 * a);
      for (const [dx, dy, rr] of [
        [-0.28, -0.22, 0.32],
        [0.18, -0.05, 0.26],
        [-0.05, 0.3, 0.22],
        [0.32, 0.36, 0.14],
      ]) {
        x.beginPath();
        x.arc(cx + dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    }

    // the sun is drawn over this layer each frame (it glides when the day changes)
    // the lens reflections show most when the sun is low and fade as it climbs
    const vis = smooth(-0.5, 3, e) * clamp01((g.farTop + 6 - sp.y) / 8) * (1 - 0.75 * smooth(12, 35, e));
    slot.sun = e > -1.2 ? { x: sp.x, y: sp.y, e, vis } : null;

    // dither
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = x.createPattern(g.noise, 'repeat')!;
    x.fillRect(0, 0, c.width, c.height);
  }

  /* land */
  const near = ramp(e, NEAR);
  const midBase = mix(ramp(e, MID), bottom, 0.16);
  const hill = mix(ramp(e, MID), bottom, 0.38);
  const far = mix(ramp(e, MID), bottom, 0.6);
  // the land facing the sun catches its light: warm and strong when the sun is low, faint at noon
  const sp = sunPlace(g, s);
  const sunLight = ramp(e, GLOW);
  const sunAmt = rampN(e, [
    [-10, 0],
    [-3, 0.35],
    [1, 0.9],
    [8, 1],
    [25, 0.45],
    [50, 0.3],
  ]);
  const layer = (c: HTMLCanvasElement, path: Path2D, topY: number, col: RGB, foot: RGB, wins: boolean, light: number, detail: Path2D, dark: number) => {
    const LW = W + 2 * M;
    if (c.width !== Math.round(LW * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(LW * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = x.createLinearGradient(0, topY, 0, H);
    gr.addColorStop(0, rgba(col));
    gr.addColorStop(1, rgba(foot));
    x.fillStyle = gr;
    x.fill(path);
    x.fillStyle = rgba(mix(col, [0, 0, 0], dark), 0.9);
    x.fill(detail);
    if (sunAmt * light > 0.005) {
      x.save();
      x.globalCompositeOperation = 'source-atop';
      x.translate(Math.max(-W * 0.1, Math.min(W * 1.1, sp.x)) + M, topY);
      x.scale(1, 0.5);
      const rad = W * 0.7;
      const lg = x.createRadialGradient(0, 0, 0, 0, 0, rad);
      lg.addColorStop(0, rgba(sunLight, sunAmt * light));
      lg.addColorStop(0.45, rgba(sunLight, sunAmt * light * 0.35));
      lg.addColorStop(1, rgba(sunLight, 0));
      x.fillStyle = lg;
      x.fillRect(-rad, -rad, rad * 2, rad * 2);
      x.restore();
    }
    if (wins) {
      // windows light up after sunset; most go dark after chatzot halayla
      const lit = smooth(1.5, -7, e) * (1 - 0.68 * s.late);
      if (lit > 0) {
        for (const w of g.windows) {
          const a = clamp01((lit - w.thr) / 0.08);
          if (a <= 0) continue;
          x.fillStyle = rgba(WINDOW, 0.78 * a);
          x.fillRect(w.x, w.y, 1.15, 1.15);
        }
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 0.6;
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = x.createPattern(g.noise, 'repeat')!;
    x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  };
  const none = new Path2D();
  layer(slot.far, g.far, g.farTop, far, mix(far, bottom, 0.3), false, 0.34, none, 0);
  layer(slot.hill, g.hill, g.hillTop, hill, mix(hill, bottom, 0.3), false, 0.26, g.hillDots, 0.07);
  layer(slot.mid, g.mid, g.midTop, midBase, mix(midBase, bottom, 0.24), true, 0.2, g.midDots, 0.07);
  layer(slot.near, g.near, g.nearTop, mix(near, midBase, 0.3), mix(near, [0, 0, 0], 0.28), false, 0.12, g.nearDots, 0.22);

  /* clouds, tinted for this light: lit from above by day, from below at sunrise and sunset */
  const lit = ramp(e, CLOUD_LIT);
  const shade = ramp(e, CLOUD_SHADE);
  const below = smooth(7, 0, e) * (1 - smooth(-6, -12, e));
  const cTop = mix(lit, shade, 0.25 + 0.6 * below);
  const cBot = mix(shade, lit, below);
  g.clouds.forEach((cl, i) => {
    let t = slot.tints[i];
    if (!t) t = slot.tints[i] = makeCanvas(1, 1);
    if (t.width !== cl.mask.width || t.height !== cl.mask.height) {
      t.width = cl.mask.width;
      t.height = cl.mask.height;
    }
    const x = t.getContext('2d')!;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, t.width, t.height);
    x.drawImage(cl.mask, 0, 0);
    x.globalCompositeOperation = 'source-in';
    const gr = x.createLinearGradient(0, 0, 0, t.height);
    gr.addColorStop(0, rgba(cTop));
    gr.addColorStop(1, rgba(cBot));
    x.fillStyle = gr;
    x.fillRect(0, 0, t.width, t.height);
    x.globalCompositeOperation = 'source-over';
  });
  slot.cloudAlpha = rampN(e, CLOUD_ALPHA) * (0.35 + 0.65 * s.clouds);
  slot.input = s;
}

interface Sun {
  x: number;
  y: number;
  /** elevation, degrees */
  e: number;
  /** how much of it shows above the far hills (for the lens reflections) */
  vis: number;
}

/** The sun: a small warm disc in a soft bloom (no rays, no starburst). ctx is in css px. */
function drawSun(x: CanvasRenderingContext2D, sun: Sun, a = 1) {
  const { x: sx, y: sy, e } = sun;
  const sc = ramp(e, SUN);
  const low = 1 - smooth(2, 18, e);
  // the air around the sun is brighter, widely and softly
  const veil = 200;
  const vg = x.createRadialGradient(sx, sy, 0, sx, sy, veil);
  vg.addColorStop(0, rgba(sc, 0.22 * a));
  vg.addColorStop(0.4, rgba(sc, 0.07 * a));
  vg.addColorStop(1, rgba(sc, 0));
  x.fillStyle = vg;
  x.fillRect(sx - veil, sy - veil, veil * 2, veil * 2);
  const bloom = 64 + 60 * low;
  const bg = x.createRadialGradient(sx, sy, 0, sx, sy, bloom);
  bg.addColorStop(0, rgba(sc, 0.75 * a));
  bg.addColorStop(0.16, rgba(sc, 0.42 * a));
  bg.addColorStop(0.4, rgba(sc, (0.12 + 0.06 * low) * a));
  bg.addColorStop(1, rgba(sc, 0));
  x.fillStyle = bg;
  x.fillRect(sx - bloom, sy - bloom, bloom * 2, bloom * 2);
  const r = 8.5 + 1.5 * low;
  const dg = x.createRadialGradient(sx, sy, 0, sx, sy, r + 1.2);
  dg.addColorStop(0, rgba([255, 254, 248], a));
  dg.addColorStop(0.55, rgba(mix([255, 252, 240], sc, 0.6), a));
  dg.addColorStop(r / (r + 1.2), rgba(sc, a));
  dg.addColorStop(1, rgba(sc, 0));
  x.fillStyle = dg;
  x.beginPath();
  x.arc(sx, sy, r + 1.2, 0, Math.PI * 2);
  x.fill();
}

/** Between two suns while the day changes: one glides to the other, or fades if the other is down */
function sunBetween(a: Sun | null, b: Sun | null, p: number): [Sun | null, number] {
  if (a && b) return [{ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, e: a.e + (b.e - a.e) * p, vis: a.vis + (b.vis - a.vis) * p }, 1];
  if (a) return [a, 1 - p];
  if (b) return [b, p];
  return [null, 0];
}

function newSlot(): Slot {
  return { input: null, sky: makeCanvas(1, 1), lit: makeCanvas(1, 1), far: makeCanvas(1, 1), hill: makeCanvas(1, 1), mid: makeCanvas(1, 1), near: makeCanvas(1, 1), front: makeCanvas(1, 1), tints: [], cloudAlpha: 0, sun: null };
}

/* ---------------- the painter ---------------- */

export interface SkyStats {
  frames: number;
  frameMs: number;
  maxFrameMs: number;
  paints: number;
  paintMs: number;
}

const TRANSITION_MS = 1100;

export class SkyPainter {
  private ctx: CanvasRenderingContext2D;
  private g: Geom | null = null;
  private slots: [Slot, Slot] = [newSlot(), newSlot()];
  private cur = 0;
  private trans: { from: number; t0: number; dir: number } | null = null;
  private buffer = makeCanvas(1, 1);
  private pending: SkyInput | null = null;
  private ground = 80;
  private dirty = true;
  private foot = 20;
  stats: SkyStats = { frames: 0, frameMs: 0, maxFrameMs: 0, paints: 0, paintMs: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** `ground`: css px of land under the date block; `foot`: how much of the bottom the page's sheet covers */
  resize(cssW: number, cssH: number, dpr: number, ground = this.ground, foot = this.foot) {
    if (cssW < 2 || cssH < 2) return;
    this.ground = ground;
    this.foot = foot;
    const rtl = this.pending?.rtl ?? this.slots[this.cur].input?.rtl ?? true;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.buffer.width = this.canvas.width;
    this.buffer.height = this.canvas.height;
    this.g = buildGeom(cssW, cssH, dpr, rtl, ground, foot);
    this.trans = null;
    const s = this.pending ?? this.slots[this.cur].input;
    if (s) this.paint(this.cur, s);
  }

  get size() {
    return this.g ? { w: this.g.W, h: this.g.H, dpr: this.g.dpr, ground: this.g.ground } : null;
  }

  /** A new moment. dir ≠ 0 (or a new place) slides/crossfades to it; otherwise it repaints in place. */
  set(s: SkyInput, change: 'same' | 'next' | 'prev' | 'swap', now: number, animate: boolean) {
    this.pending = s;
    if (!this.g) return;
    if (this.g.rtl !== s.rtl) {
      this.g = buildGeom(this.g.W, this.g.H, this.g.dpr, s.rtl, this.ground, this.foot);
      change = 'same';
    }
    if (change === 'same' || !animate || !this.slots[this.cur].input) {
      this.trans = null;
      this.paint(this.cur, s);
      return;
    }
    const next = 1 - this.cur;
    this.paint(next, s);
    this.trans = { from: this.cur, t0: now, dir: change === 'next' ? 1 : change === 'prev' ? -1 : 0 };
    this.cur = next;
  }

  private paint(i: number, s: SkyInput) {
    const t0 = performance.now();
    paintSlot(this.slots[i], this.g!, s);
    this.buildFront(this.slots[i]);
    this.dirty = true;
    this.stats.paints++;
    this.stats.paintMs += performance.now() - t0;
  }

  get transitioning() {
    return !!this.trans;
  }

  /** Draws one frame. `t` drives the clouds and the flames (ms); `still` freezes them. */
  frame(t: number, still = false) {
    const g = this.g;
    if (!g || !this.slots[this.cur].input) return;
    const t0 = performance.now();
    const ctx = this.ctx;
    const time = still ? 0 : t / 1000;
    if (this.trans) {
      const p = ease((t - this.trans.t0) / TRANSITION_MS);
      if (p >= 1 || still) {
        this.trans = null;
        this.dirty = true;
      } else {
        // the old day's sky fades into the new one while the land sways once toward the side the new day
        // lies on and settles back, with depth: the near ground moves most, the far hills least. Both days
        // share one landscape, so it moves as one (no double image), only its light changes.
        const toward = (g.rtl ? -1 : 1) * this.trans.dir;
        const sway = -toward * g.W * 0.045 * Math.sin(Math.PI * p);
        // one sun, gliding from the old day's place to the new one's, in both pictures
        const [sun, sunA] = sunBetween(this.slots[this.trans.from].sun, this.slots[this.cur].sun, p);
        this.compose(ctx, this.slots[this.cur], sway, time, sun, sunA);
        const b = this.buffer.getContext('2d')!;
        this.compose(b, this.slots[this.trans.from], sway, time, sun, sunA);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - p;
        ctx.drawImage(this.buffer, 0, 0);
        ctx.globalAlpha = 1;
        this.count(t0);
        return;
      }
    }
    this.composeStill(ctx, this.slots[this.cur], time, this.dirty);
    this.dirty = false;
    this.count(t0);
  }

  private count(t0: number) {
    const ms = performance.now() - t0;
    this.stats.frames++;
    this.stats.frameMs += ms;
    if (ms > this.stats.maxFrameMs) this.stats.maxFrameMs = ms;
  }

  /** One state, every layer at its own parallax offset (used while the day slides) */
  private compose(ctx: CanvasRenderingContext2D, sl: Slot, shift: number, time: number, sun: Sun | null, sunA: number) {
    const g = this.g!;
    const s = sl.input!;
    const { dpr, M } = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sl.sky, 0, 0);
    if (sun && sunA > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSun(ctx, sun, sunA);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.clouds(ctx, sl, shift, time);
    this.scrim(ctx, sl);
    ctx.drawImage(sl.far, Math.round((-M + shift * 0.25) * dpr), 0);
    ctx.drawImage(sl.hill, Math.round((-M + shift * 0.42) * dpr), 0);
    ctx.drawImage(sl.mid, Math.round((-M + shift * 0.62) * dpr), 0);
    ctx.drawImage(sl.near, Math.round((-M + shift) * dpr), 0);
    this.ghosts(ctx, sun, sunA);
    if (s.candles) this.candles(ctx, shift, time, s.elev);
    if (s.chanukah) this.chanukiah(ctx, s, shift, time);
  }

  /**
   * One state at rest. Only the clouds and the flames move, so after the first full frame only two
   * small regions are redrawn: the band of sky the clouds cross, and the box around the candles.
   */
  private composeStill(ctx: CanvasRenderingContext2D, sl: Slot, time: number, full: boolean) {
    const g = this.g!;
    const s = sl.input!;
    const { dpr, W, H } = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const region = (x: number, y: number, w: number, h: number, inner: () => void) => {
      ctx.save();
      if (!full) {
        ctx.beginPath();
        ctx.rect(Math.floor(x * dpr), Math.floor(y * dpr), Math.ceil(w * dpr), Math.ceil(h * dpr));
        ctx.clip();
      }
      ctx.drawImage(sl.lit, 0, 0);
      inner();
      ctx.restore();
    };
    region(0, 0, W, full ? H : g.cloudBand, () => {
      this.clouds(ctx, sl, 0, time);
      ctx.drawImage(sl.front, 0, 0);
      if (full && s.candles) this.candles(ctx, 0, time, s.elev);
      if (full && s.chanukah) this.chanukiah(ctx, s, 0, time);
    });
    if (!full && (s.candles || s.chanukah)) {
      // one box around the Shabbat candles and the chanukiah, whichever burn
      const c = g.candle;
      let x0 = c.x - 34;
      let x1 = c.x + 34;
      if (s.chanukah) {
        const k = this.chanukiahX(s);
        x0 = Math.min(x0, k - 34);
        x1 = Math.max(x1, k + 34);
      }
      region(x0, c.y - 78, x1 - x0, H - c.y + 78, () => {
        ctx.drawImage(sl.front, 0, 0);
        if (s.candles) this.candles(ctx, 0, time, s.elev);
        if (s.chanukah) this.chanukiah(ctx, s, 0, time);
      });
    }
  }

  /** Clouds drift toward the evening side, a few pixels a second */
  private clouds(ctx: CanvasRenderingContext2D, sl: Slot, shift: number, time: number) {
    const g = this.g!;
    if (sl.cloudAlpha <= 0.01) return;
    const { dpr, W } = g;
    const wind = g.rtl ? -1 : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    g.clouds.forEach((cl, i) => {
      if (sl.input!.clouds < 0.3 && !cl.streak) return;
      const span = W + cl.w * 2;
      const p = (((cl.x0 + time * cl.speed) % span) + span) % span;
      const x = wind > 0 ? p - cl.w : W + cl.w - p;
      ctx.globalAlpha = sl.cloudAlpha * cl.weight;
      ctx.drawImage(sl.tints[i], (x + shift * 0.25) * dpr, cl.y * dpr);
    });
    ctx.globalAlpha = 1;
  }

  /** High up, the sky deepens toward its own top colour: clouds thin out there and the place name stays readable */
  private scrim(ctx: CanvasRenderingContext2D, sl: Slot) {
    const { dpr, W } = this.g!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sg = ctx.createLinearGradient(0, 0, 0, 76);
    sg.addColorStop(0, rgba(sl.input!.sky[0], 0.55));
    sg.addColorStop(1, rgba(sl.input!.sky[0], 0));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, 76);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A faint lens reflection of the sun, along the line through the middle of the frame */
  private ghosts(ctx: CanvasRenderingContext2D, sun: Sun | null, alpha = 1) {
    const g = this.g!;
    if (!sun || sun.vis * alpha <= 0.02) return;
    const { dpr, W } = g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2;
    const cy = g.H * 0.46;
    const { x: sx, y: sy } = sun;
    const list: [number, number, number][] = [
      [0.4, 3.5, 0.13],
      [0.68, 11, 0.055],
      [1.22, 6, 0.08],
      [1.52, 19, 0.045],
      [1.82, 8, 0.065],
    ];
    for (const [k, r, a] of list) {
      const gx = sx + (cx - sx) * k;
      const gy = sy + (cy - sy) * k;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      const al = a * sun.vis * alpha;
      gg.addColorStop(0, `rgba(255,240,214,${al * 0.45})`);
      gg.addColorStop(0.82, `rgba(255,240,214,${al})`);
      gg.addColorStop(1, 'rgba(255,240,214,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Everything in front of the clouds that doesn't move, flattened into one transparent layer; and the sky with its sun */
  private buildFront(sl: Slot) {
    const g = this.g!;
    {
      const c = sl.lit;
      if (c.width !== this.canvas.width || c.height !== this.canvas.height) {
        c.width = this.canvas.width;
        c.height = this.canvas.height;
      }
      const x = c.getContext('2d', { alpha: false })!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(sl.sky, 0, 0);
      if (sl.sun) {
        x.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
        drawSun(x, sl.sun);
      }
    }
    const c = sl.front;
    if (c.width !== this.canvas.width || c.height !== this.canvas.height) {
      c.width = this.canvas.width;
      c.height = this.canvas.height;
    }
    const x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    this.scrim(x, sl);
    const o = Math.round(-g.M * g.dpr);
    x.drawImage(sl.far, o, 0);
    x.drawImage(sl.hill, o, 0);
    x.drawImage(sl.mid, o, 0);
    x.drawImage(sl.near, o, 0);
    this.ghosts(x, sl.sun);
  }

  /** Two small Shabbat candles in candlesticks, in the evening-side corner; the flames barely move */
  private candles(ctx: CanvasRenderingContext2D, shift: number, time: number, elev: number) {
    const g = this.g!;
    const { dpr } = g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const day = smooth(-4, 10, elev);
    const T = 2 * Math.PI;
    for (let i = 0; i < 2; i++) {
      const bx = g.candle.x + shift + (i === 0 ? -7.5 : 7.5) * (g.rtl ? -1 : 1);
      const yb = g.candle.y;
      const cupY = yb - 11;
      const top = cupY - 15;
      const ph = i * 2.1;
      const flick = time === 0 ? 0 : 0.05 * Math.sin(time * T * 0.9 + ph) + 0.03 * Math.sin(time * T * 2.3 + ph * 1.7);
      const sway = time === 0 ? 0 : 0.3 * Math.sin(time * T * 0.45 + ph) + 0.12 * Math.sin(time * T * 1.1 + ph);
      // light on the air around the flame
      const fy = top - 5;
      const halo = ctx.createRadialGradient(bx, fy, 0, bx, fy, 22);
      halo.addColorStop(0, `rgba(255,196,120,${0.22 * (1 - 0.55 * day)})`);
      halo.addColorStop(0.5, `rgba(255,196,120,${0.06 * (1 - 0.55 * day)})`);
      halo.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(bx - 22, fy - 22, 44, 44);
      // the candlestick: dark metal with a warm gleam from the flame
      const metal = ctx.createLinearGradient(bx - 4, 0, bx + 4, 0);
      metal.addColorStop(0, '#1b1a1d');
      metal.addColorStop(0.45, '#6b604c');
      metal.addColorStop(0.6, '#3a352f');
      metal.addColorStop(1, '#17161a');
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(bx - 3.6, cupY);
      ctx.lineTo(bx + 3.6, cupY);
      ctx.lineTo(bx + 1.3, cupY + 3.2);
      ctx.lineTo(bx + 0.9, yb + 30);
      ctx.lineTo(bx - 0.9, yb + 30);
      ctx.lineTo(bx - 1.3, cupY + 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(bx, cupY + 7, 2.3, 1.4, 0, 0, T);
      ctx.fill();
      // the candle
      const body = ctx.createLinearGradient(bx - 1.7, 0, bx + 1.7, 0);
      body.addColorStop(0, '#cfc4ad');
      body.addColorStop(0.4, '#f4eddd');
      body.addColorStop(1, '#b7ab93');
      ctx.fillStyle = body;
      ctx.fillRect(bx - 1.7, top, 3.4, cupY - top + 0.5);
      ctx.fillStyle = 'rgba(255,214,150,0.6)';
      ctx.fillRect(bx - 1.7, top, 3.4, 1);
      ctx.fillStyle = '#3a2e22';
      ctx.fillRect(bx - 0.35, top - 2.2, 0.7, 2.4);
      // the flame
      flame(ctx, bx, top - 1.4, 8 * (1 + flick), sway, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Where the chanukiah stands: in the candles' corner, or just inside the Shabbat candles when they burn too */
  private chanukiahX(s: SkyInput) {
    const g = this.g!;
    const inward = g.rtl ? 1 : -1;
    return g.candle.x + inward * (s.candles ? 42 : 12);
  }

  /**
   * Chanukah: a small brass chanukiah beside the Shabbat candles' corner, on the same table behind the
   * page. Eight cups in a row on nested arms and the shamash raised in the middle; tonight's candles in
   * the rightmost cups (they are set from the right), each flame swaying on its own like the Shabbat ones.
   */
  private chanukiah(ctx: CanvasRenderingContext2D, s: SkyInput, shift: number, time: number) {
    const g = this.g!;
    const n = Math.max(0, Math.min(8, Math.round(s.chanukah ?? 0)));
    if (!n) return;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const day = smooth(-4, 10, s.elev);
    const T = 2 * Math.PI;
    const cx = this.chanukiahX(s) + shift;
    const yb = g.candle.y;
    const sp = 4.7;
    const cupY = yb - 6.5;
    const lift = 5.5; // the shamash stands higher
    const slotX = (i: number) => cx + (i - 4) * sp;
    // the cups that hold candles tonight: the rightmost n of the eight (slot 4 is the shamash)
    const cups = [0, 1, 2, 3, 5, 6, 7, 8];
    const lit = [...cups.slice(8 - n), 4];

    // one soft pool of light on the air around the lights
    const a = 1 - 0.55 * day;
    const span = (n / 8) * 4 * sp + 8;
    const pcx = (slotX(cups[8 - n]) + slotX(8)) / 2;
    ctx.save();
    ctx.translate(pcx, cupY - 9);
    ctx.scale(1, 0.7);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, span + 14);
    pool.addColorStop(0, `rgba(255,196,120,${0.16 * a})`);
    pool.addColorStop(0.55, `rgba(255,196,120,${0.05 * a})`);
    pool.addColorStop(1, 'rgba(255,196,120,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(-span - 14, -span - 14, 2 * span + 28, 2 * span + 28);
    ctx.restore();

    // the arms: nested half-rounds from the stem to each pair of cups, and the stem down behind the page
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4b4334';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) {
      const rx = k * sp;
      ctx.moveTo(cx + rx, cupY);
      ctx.ellipse(cx, cupY, rx, 1.6 + k * 1.5, 0, 0, Math.PI);
    }
    ctx.moveTo(cx, cupY - lift);
    ctx.lineTo(cx, yb + 30);
    ctx.stroke();
    // a warm gleam along the top of the metal, from the flames above it
    ctx.strokeStyle = `rgba(255,206,140,${0.32 * a})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) {
      const rx = k * sp;
      ctx.moveTo(cx + rx - 0.4, cupY + 0.2);
      ctx.ellipse(cx, cupY, rx - 0.4, 1.2 + k * 1.5, 0, 0.05, Math.PI - 0.05);
    }
    ctx.stroke();
    // the cups
    ctx.fillStyle = '#5b5141';
    for (const i of [...cups, 4]) {
      const y = i === 4 ? cupY - lift : cupY;
      ctx.fillRect(slotX(i) - 1.6, y - 1.5, 3.2, 1.9);
    }

    for (const i of lit) {
      const bx = slotX(i);
      const y = (i === 4 ? cupY - lift : cupY) - 1.5;
      const top = y - 6.5;
      const ph = i * 1.37 + 0.4;
      const flick = time === 0 ? 0 : 0.06 * Math.sin(time * T * 0.95 + ph) + 0.03 * Math.sin(time * T * 2.4 + ph * 1.7);
      const sway = time === 0 ? 0 : 0.2 * Math.sin(time * T * 0.5 + ph) + 0.08 * Math.sin(time * T * 1.2 + ph);
      const fy = top - 3;
      const halo = ctx.createRadialGradient(bx, fy, 0, bx, fy, 9);
      halo.addColorStop(0, `rgba(255,196,120,${0.2 * a})`);
      halo.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(bx - 9, fy - 9, 18, 18);
      // the candle: thin, as Chanukah candles are
      const body = ctx.createLinearGradient(bx - 0.9, 0, bx + 0.9, 0);
      body.addColorStop(0, '#cfc4ad');
      body.addColorStop(0.4, '#f4eddd');
      body.addColorStop(1, '#b7ab93');
      ctx.fillStyle = body;
      ctx.fillRect(bx - 0.85, top, 1.7, y - top + 0.3);
      ctx.fillStyle = 'rgba(255,214,150,0.6)';
      ctx.fillRect(bx - 0.85, top, 1.7, 0.7);
      flame(ctx, bx, top - 0.7, 4.6 * (1 + flick), sway, 0.52);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** A small candle flame: a teardrop from the wick, white at the heart and amber at the edge; `k` scales its width */
function flame(ctx: CanvasRenderingContext2D, bx: number, baseY: number, fh: number, sway: number, k: number) {
  const tipX = bx + sway;
  ctx.beginPath();
  ctx.moveTo(bx, baseY + 0.6 * k);
  ctx.bezierCurveTo(bx - 2.7 * k, baseY - 0.4 * k, bx - 2.1 * k + sway * 0.4, baseY - fh * 0.62, tipX, baseY - fh);
  ctx.bezierCurveTo(bx + 2.1 * k + sway * 0.4, baseY - fh * 0.62, bx + 2.7 * k, baseY - 0.4 * k, bx, baseY + 0.6 * k);
  const fg = ctx.createRadialGradient(bx, baseY - fh * 0.3, 0, bx, baseY - fh * 0.35, fh * 0.75);
  fg.addColorStop(0, 'rgba(255,252,236,1)');
  fg.addColorStop(0.45, 'rgba(255,218,140,0.95)');
  fg.addColorStop(1, 'rgba(244,150,70,0.75)');
  ctx.fillStyle = fg;
  ctx.fill();
}


