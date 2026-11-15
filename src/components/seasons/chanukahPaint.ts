/**
 * The chanukiah on the Chanukah card: a deep window of an old Jerusalem stone house at night, seen from the
 * room, with a brass oil chanukiah on the sill. Eight glass cups of olive oil with floating wicks stand in one
 * row at one height, the shamash apart on the right, a wax taper on a raised post. Outside, across the alley,
 * the house opposite, a lit window, a dome, a cypress, a solar heater, and the real sky of the place.
 *
 * The scene is rendered in Blender (scripts/chanukah-scene: build.py, compose.py) into layers, and composited
 * here live, on three stacked canvases:
 *   picture = sky + base (the night, or the late afternoon, nothing lit in the room)
 *           + the empty cups (a cup that holds nothing tonight; the shamash's socket while it is carried)
 *           + Σ light_i × flicker_i(t)   (what each flame alone lays on the stone, the brass, the glass)
 *           + the flames themselves, drawn live
 * Each light tile is the display-space delta of that one flame, at a third of the resolution (light is soft),
 * and `detail` is the fine structure of the lit picture as a ratio to its soft version (full resolution).
 *
 * Cost: the picture with the steady part of the light (three quarters of it, multiplied by `detail`) is drawn
 * into the base canvas only when something changes: the sky once a minute, the cups placed, a light that has
 * caught. The flicker (the remaining quarter of each light, scaled by its flame) is a canvas a third the size,
 * which the page stretches over the base and adds (CSS plus-lighter: the compositor does it, on the GPU on a
 * phone). The flames are a transparent canvas on top. So a frame on the main thread is: ten small tiles
 * added into the small canvas, and the flames. Where plus-lighter is missing, the painter adds the flicker
 * into the base itself, from a cached copy of the picture.
 *
 * The flames: each is a sprite painted once per lean (a fortieth of its height apart), from a model of an oil
 * flame on a floating wick (a dark foot, a gold body, a white heart, an amber edge that thins and reddens to
 * the tip, a faint blue bowl). The lean is a damped spring pushed by slow smooth noise and, now and then, a
 * draft that crosses the window from one side and bends all the flames together, reaching each a little
 * later than the one before. The height breathes slowly; the light each flame lays follows its own height.
 */
import baseDayUrl from '../../assets/chanukah/base-day.webp';
import baseNightUrl from '../../assets/chanukah/base-night.webp';
import detailUrl from '../../assets/chanukah/detail.webp';
import emptyDayUrl from '../../assets/chanukah/empty-day.webp';
import emptyNightUrl from '../../assets/chanukah/empty-night.webp';
import lightUrl from '../../assets/chanukah/light.webp';
import shamashUrl from '../../assets/chanukah/shamash.webp';
import { SCENE } from './chanukahScene';

export type RGB = [number, number, number];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;

/** The app's one easing curve, cubic-bezier(0.22, 1, 0.36, 1) */
function ease(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  const bx = (u: number) => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3;
  const by = (u: number) => 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 16; i++) {
    u = (lo + hi) / 2;
    if (bx(u) < t) lo = u;
    else hi = u;
  }
  return by(u);
}
/** symmetric ease-in-out for things that travel (a hand carrying a candle starts and stops softly) */
const inOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/* ---------------- smooth noise ---------------- */

function hash(i: number, s: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(s, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
function noise(t: number, s: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, s);
  return a + (hash(i + 1, s) - a) * u;
}
const fbm = (t: number, s: number) => noise(t, s) * 0.62 + noise(t * 2.13 + 5.3, s + 31) * 0.28 + noise(t * 4.7 + 1.7, s + 57) * 0.1;

/* ---------------- the scene's input ---------------- */

export interface StageState {
  /** the sky, top / middle / horizon (skyAt) */
  sky: [RGB, RGB, RGB];
  /** cups that hold oil tonight (1–8; all 8 on the eighth day) */
  placed: number;
  /** burning now */
  lit: boolean;
  /** 0 (just lit) … 1 (late in the evening): the oil goes down, the flames grow a little smaller */
  burnt: number;
  /** 0 in daylight … 1 at night: which base picture, and how strongly the flames' light shows */
  night: number;
  /** 0 … 1: the window across the alley, lit in the evening */
  window: number;
}

const [BW, BH] = SCENE.size;
const [TW, TH] = SCENE.tile;

/** The cups, left to right (0–7); 8 is the shamash */
const SHAMASH = 8;
/** The cups that hold oil tonight: the rightmost n, as they are set from the right */
export const placedSlots = (n: number) => [0, 1, 2, 3, 4, 5, 6, 7].slice(8 - Math.max(0, Math.min(8, n)));
/** The order of lighting: the newest (leftmost) first, then rightward */
export const lightingOrder = (n: number) => placedSlots(n);

/** The steady share of each light (cached, sharp); the rest flickers live */
const STEADY = 0.75;

/* ---------------- the flame sprite ---------------- */

const SPR_W = 1.6; // the sprite's width and height, in flame heights (room for the lean)
const SPR_H = 1.7;
const SPR_BASE = 1.32; // the wick's top, from the sprite's top, in flame heights
const LEAN_STEPS = 4;
/** the leans painted: up to 0.4 flame heights at the tip, in steps of a fortieth */
const LEAN_MAX = 4;

/**
 * One flame `hp` device pixels high, leaning `lean` (in flame heights, at the tip) and bending from the wick
 * up (the lean grows as height^1.6), painted pixel by pixel: a soft amber envelope, a gold body, a white heart
 * low in the middle, the dark vapour just over the wick, a faint blue bowl, and a tip that reddens as it thins.
 */
function flameSprite(hp: number, lean: number) {
  const w = Math.ceil(SPR_W * hp * 0.5) * 2;
  const h = Math.ceil(SPR_H * hp);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const cx = w / 2;
  const by = SPR_BASE * hp;
  const Hf = hp;
  const Rf = hp * 0.2;
  const EDGE: RGB = [255, 118, 34];
  const AMBER: RGB = [255, 172, 72];
  const GOLD: RGB = [255, 222, 146];
  const WHITE: RGB = [255, 249, 230];
  const prof = (t: number) => Math.pow(t, 0.5) * Math.pow(1 - t, 0.9);
  const peak = prof(0.36);
  for (let py = 0; py < h; py++) {
    const v = (by - (py + 0.5)) / Hf; // 0 at the wick, 1 at the tip
    const t = (v + 0.12) / 1.12;
    if (t <= 0 || t >= 1) continue;
    const r = prof(t) / peak;
    const mid = cx + lean * Hf * Math.pow(Math.max(0, v), 1.6);
    const tip = smoothstep(0.55, 1.0, t);
    for (let px = 0; px < w; px++) {
      const u = Math.abs(px + 0.5 - mid) / Rf;
      const d = u / Math.max(0.001, r);
      if (d >= 1.3) continue;
      const body = Math.pow(1 - smoothstep(0.2, 1.15, d), 1.2);
      const heart = (1 - smoothstep(0.0, 0.6, d)) * smoothstep(0.08, 0.26, t) * (1 - smoothstep(0.4, 0.78, t));
      const cone = (1 - smoothstep(0.0, 0.4, d)) * (1 - smoothstep(0.06, 0.24, t));
      const L = body * (0.5 + 0.5 * heart) * (1 - 0.5 * cone) * (1 - 0.4 * tip);
      let col: RGB;
      if (L < 0.3) col = mix(EDGE, AMBER, L / 0.3);
      else if (L < 0.62) col = mix(AMBER, GOLD, (L - 0.3) / 0.32);
      else col = mix(GOLD, WHITE, Math.min(1, (L - 0.62) / 0.3));
      col = mix(col, EDGE, tip * 0.45);
      let a = Math.min(1, body * (0.3 + 1.0 * L)) * (1 - 0.5 * tip * tip);
      const blue = smoothstep(0.4, 0.92, d) * (1 - smoothstep(0.95, 1.25, d)) * (1 - smoothstep(0.02, 0.15, t));
      if (blue > 0.01) {
        const ba = blue * 0.35;
        const na = a + ba * (1 - a);
        col = mix(col, [90, 116, 255], ba / Math.max(0.001, na));
        a = na;
      }
      const i = (py * w + px) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The glow of the air round a flame (to the eye and to a lens): a small soft pool, added light */
function glowSprite(size: number) {
  const s = Math.max(8, Math.ceil(size));
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (let k = 0; k <= 10; k++) {
    const x = k / 10;
    const v = (1 / (1 + (x / 0.2) ** 2)) * (1 - x * x);
    gr.addColorStop(x, `rgba(255,${Math.round(150 + 40 * v)},${Math.round(80 + 40 * v)},${(v * 0.55).toFixed(4)})`);
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return c;
}

/* ---------------- one flame's motion ---------------- */

class Flame {
  lean = 0;
  vel = 0;
  /** 0 → 1 while it catches */
  grow = 1;
  igniteAt = -1;
  constructor(readonly seed: number) {}
  /** advance the lean (in flame heights): a damped spring pushed by the air (and by a carry's motion) */
  step(t: number, dt: number, push: number) {
    const air = (fbm(t * 0.55, this.seed) * 1.15 + fbm(t * 1.7, this.seed + 3) * 0.35) * 0.075;
    const target = air + push;
    const k = 78;
    const c = 10.5;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = k * (target - this.lean) - c * this.vel;
      this.vel += a * h;
      this.lean += this.vel * h;
    }
    this.lean = Math.max(-0.4, Math.min(0.4, this.lean));
  }
  /** height factor: a slow breath and a small quick flicker */
  height(t: number) {
    return 1 + 0.06 * fbm(t * 0.8, this.seed + 11) + 0.025 * noise(t * 6.5, this.seed + 19) + 0.014 * noise(t * 11, this.seed + 23);
  }
  /** how much light it gives now, relative to its steady light (follows its height, with a quicker tremor) */
  light(t: number) {
    return (this.height(t) - 1) * 2.4 + 0.07 * noise(t * 8.3, this.seed + 29);
  }
}

/* ---------------- the shamash's journey ---------------- */

interface Pose {
  /** the candle's foot (base px) */
  x: number;
  y: number;
  /** tilt about the foot, radians (positive leans the top to the right) */
  tilt: number;
}
interface Key {
  t: number;
  pose: Pose;
  arc?: number;
}

/* ---------------- the painter ---------------- */

export interface StageStats {
  frames: number;
  frameMs: number;
  maxFrameMs: number;
  builds: number;
}

type Img = HTMLImageElement;
interface Assets {
  baseDay: Img;
  baseNight: Img;
  emptyDay: Img;
  emptyNight: Img;
  light: Img;
  detail: Img;
  shamash: Img;
}

function loadImage(src: string) {
  return new Promise<Img>((ok, fail) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => ok(i);
    i.onerror = fail;
    i.src = src;
  });
}

let assetsP: Promise<Assets> | null = null;
function loadAssets() {
  if (!assetsP)
    assetsP = Promise.all([baseDayUrl, baseNightUrl, emptyDayUrl, emptyNightUrl, lightUrl, detailUrl, shamashUrl].map(loadImage))
      .then(([baseDay, baseNight, emptyDay, emptyNight, light, detail, shamash]) => ({ baseDay, baseNight, emptyDay, emptyNight, light, detail, shamash }))
      .catch((e) => {
        assetsP = null;
        throw e;
      });
  return assetsP;
}

const canvas2d = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};


/**
 * Can the page add one layer's light to the layers under it (CSS `mix-blend-mode: plus-lighter`)? Then the
 * flicker's light is its own small canvas, drawn up and added by the compositor (the GPU, on a phone), and
 * the main thread draws only that small canvas and the flames. Otherwise the painter adds it itself.
 */
/**
 * The band of the picture the flames' canvas covers (base px): from above the raised shamash's flame (and
 * the flames' reflections) to below the bench, where the carried candle's foot goes
 */
const FLAME_BAND: readonly [number, number] = (() => {
  const fh = (SCENE.flames[8].foot[1] - SCENE.flames[8].tip[1]) * 1.25 * 1.08;
  const shL = SCENE.shamash.foot[1] - SCENE.shamash.wick[1];
  const top = Math.min(SCENE.shamash.wick[1] - 34 - 2.6 * fh, ...SCENE.flames.map((f) => f.mirrorTip[1] - 2 * fh));
  const bottom = Math.max(...SCENE.cups.map((c) => c[3]), SCENE.shamash.foot[1] + 0.2 * shL) + 30;
  return [Math.max(0, Math.floor(top)), Math.min(BH, Math.ceil(bottom))];
})();

/** The point of the art kept in view when the box is not its shape: the chanukiah's middle (from the shamash's
 * flame to under the bench, base px), and where in the box's height it goes */
const ANCHOR: readonly [number, number] = [(SCENE.flames[8].tip[1] + Math.max(...SCENE.cups.map((c) => c[3])) + 40) / 2, 0.55];

export const canAddLayers = () => typeof CSS !== 'undefined' && !!CSS.supports?.('mix-blend-mode', 'plus-lighter');

export class ChanukiahPainter {
  private a: Assets | null = null;
  /** css width; device px per base px */
  private W = 0;
  private k = 1;
  private st: StageState | null = null;
  private bctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private fctx: CanvasRenderingContext2D;
  /** without layers: the cached picture, which the base canvas copies every frame before the light is added */
  private cache: HTMLCanvasElement | null;
  private tmp = canvas2d(1, 1);
  private low = canvas2d(TW, TH);
  private sprites = new Map<number, HTMLCanvasElement>();
  private spriteH = 0;
  private glow: HTMLCanvasElement | null = null;
  private flames = new Map<number, Flame>();
  /** which lights burn (8 = the shamash); while lighting, they join one by one */
  private burning = new Set<number>();
  /** the lights whose steady part is in the cached picture (a light joins once it has caught fully) */
  private steady = '';
  private dirty = true;
  private lastT = -1;
  private draft: { t0: number; dir: number; amp: number } | null = null;
  private nextDraft = 6;
  private seq: { t0: number; keys: Key[]; ignite: { slot: number; at: number }[]; end: number; onDone?: () => void } | null = null;
  private shPrev: Pose | null = null;
  private shVel = 0;
  private away = false;
  private flamesDrawn = false;
  /** the part of the flames' canvas the last frame drew on (base px) */
  private drawn: [number, number, number, number] = [0, 0, BW, BH];
  private mark(x0: number, y0: number, x1: number, y1: number) {
    const d = this.drawn;
    d[0] = Math.min(d[0], x0);
    d[1] = Math.min(d[1], y0);
    d[2] = Math.max(d[2], x1);
    d[3] = Math.max(d[3], y1);
  }
  private frameNo = 0;
  private band = FLAME_BAND;
  /** where the art's top left lands on the canvases (device px), and the flames' canvas top */
  private ox = 0;
  private oy = 0;
  private fy0 = 0;
  private lightEl: HTMLCanvasElement | null;
  /** called once the pictures have loaded (the card's loop draws then) */
  onReady: (() => void) | null = null;
  stats: StageStats = { frames: 0, frameMs: 0, maxFrameMs: 0, builds: 0 };

  /**
   * `base`: the picture with its steady light (redrawn only when something changes); `light`: the flicker,
   * a small canvas the page stretches over the base and adds (plus-lighter), or null to add it here;
   * `flames`: a transparent canvas on top
   */
  constructor(
    private base: HTMLCanvasElement,
    light: HTMLCanvasElement | null,
    private flamesC: HTMLCanvasElement,
  ) {
    this.bctx = base.getContext('2d', { alpha: false })!;
    const lc = light ?? canvas2d(TW, TH);
    lc.width = TW;
    lc.height = TH;
    this.lctx = lc.getContext('2d', { alpha: false })!;
    this.fctx = flamesC.getContext('2d')!;
    this.cache = light ? null : canvas2d(1, 1);
    this.lightEl = light;
    for (let i = 0; i <= 8; i++) this.flames.set(i, new Flame(101 + i * 17));
    loadAssets().then(
      (a) => {
        this.a = a;
        this.dirty = true;
        this.onReady?.();
      },
      () => {
        /* offline before the pictures were ever cached: the stage keeps its plain night colour */
      },
    );
  }

  get ready() {
    return !!this.a;
  }

  resize(W: number, H: number, dpr: number) {
    if (W < 10 || H < 10) return;
    this.W = W;
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    for (const c of [this.base, this.tmp, ...(this.cache ? [this.cache] : [])]) {
      c.width = cw;
      c.height = ch;
    }
    // the art is scaled the same way across and down (never stretched), to cover the box: centred across,
    // and down so that the chanukiah stays in the picture whatever the box's shape. At 6:5 it fits exactly
    const k = Math.max(cw / BW, ch / BH);
    this.k = k;
    this.ox = (cw - BW * k) / 2;
    this.oy = Math.min(0, Math.max(ch - BH * k, ch * ANCHOR[1] - ANCHOR[0] * k));
    // the light canvas is stretched by the page over the art's own rectangle (the stage clips what is outside)
    if (this.lightEl) {
      const st = this.lightEl.style;
      st.left = `${this.ox / dpr}px`;
      st.top = `${this.oy / dpr}px`;
      st.width = `${(BW * k) / dpr}px`;
      st.height = `${(BH * k) / dpr}px`;
    }
    // the flames' canvas: the band of the art they move in, as much of it as the box shows
    const y0 = Math.max(0, Math.floor(this.oy + this.band[0] * k));
    const y1 = Math.min(ch, Math.ceil(this.oy + this.band[1] * k));
    this.fy0 = y0;
    this.flamesC.width = cw;
    this.flamesC.height = Math.max(1, y1 - y0);
    this.flamesC.style.top = `${y0 / dpr}px`;
    this.flamesC.style.height = `${Math.max(1, y1 - y0) / dpr}px`;
    // the sprites at the screen's own resolution
    const fh = this.flameH(0) * this.k * 1.25;
    if (Math.abs(fh - this.spriteH) > 0.5) {
      this.sprites.clear();
      this.spriteH = fh;
      this.glow = glowSprite(fh * 3.4);
    }
    this.dirty = true;
  }

  /** The state of the evening. Lit/unlit changes take effect at once (the lighting itself is light()). */
  set(s: StageState) {
    const prev = this.st;
    this.st = s;
    if (!this.seq) {
      this.burning.clear();
      if (s.lit) for (const i of [...placedSlots(s.placed), SHAMASH]) this.burning.add(i);
    }
    if (!prev || prev.placed !== s.placed || prev.lit !== s.lit || Math.abs(prev.burnt - s.burnt) > 0.004 || prev.night !== s.night || prev.window !== s.window || prev.sky.join() !== s.sky.join()) this.dirty = true;
  }

  get animating() {
    return !!this.seq;
  }
  get burningNow() {
    return this.burning.size > 0;
  }

  /* ---------------- geometry (base px) ---------------- */

  /** a flame's height in base px, a little smaller late in the evening (the oil goes down) */
  private flameH(slot: number) {
    const f = SCENE.flames[slot];
    const h = (f.foot[1] - f.tip[1]) * 1.25;
    return h * (1 - 0.12 * (this.st?.burnt ?? 0));
  }
  /** where a resting flame stands (its wick), base px */
  private wick(slot: number): [number, number] {
    const f = SCENE.flames[slot];
    const drop = slot === SHAMASH ? 0 : 4 * (this.st?.burnt ?? 0);
    return [f.foot[0], f.foot[1] + drop];
  }
  /** the shamash taper's length, foot to wick (base px) */
  private get shL() {
    return SCENE.shamash.foot[1] - SCENE.shamash.wick[1];
  }

  /**
   * The lighting: the shamash catches, is lifted from its socket, and lights tonight's cups one by one, the
   * newest (leftmost) first, then goes back to its place. `t` is the frame clock, seconds.
   */
  light(t: number, onDone?: () => void) {
    const s = this.st;
    if (!s || this.seq) return;
    const order = lightingOrder(s.placed);
    const L = this.shL;
    const [fx, fy] = SCENE.shamash.foot;
    const rest: Pose = { x: fx, y: fy, tilt: 0 };
    // lifted clear of its socket
    const up: Pose = { x: fx, y: fy - 22, tilt: 0 };
    const at = (wx: number, wy: number, tilt: number): Pose => ({ x: wx - Math.sin(tilt) * L, y: wy + Math.cos(tilt) * L, tilt });
    // it comes down to each cup from above and a little to the right, held nearly upright (a hand carries
    // a candle level), and brings the foot of its flame to the cup's mouth, just over the floating wick
    const near = (slot: number): Pose => {
      const [wx, wy] = this.wick(slot);
      return at(wx + 9, wy - 28, -0.05);
    };
    const touch = (slot: number): Pose => {
      const [wx, wy] = this.wick(slot);
      return at(wx + 3, wy - 9, -0.12);
    };

    const keys: Key[] = [{ t: 0, pose: rest }];
    const ignite: { slot: number; at: number }[] = [];
    // the shamash is lit first, in its place
    ignite.push({ slot: SHAMASH, at: 0.2 });
    let T = 1.0;
    keys.push({ t: T, pose: rest });
    T += 0.6;
    keys.push({ t: T, pose: up });
    order.forEach((slot, k) => {
      const [wx] = this.wick(slot);
      T += k === 0 ? 0.85 + Math.abs(wx - fx) / 700 : 0.5;
      keys.push({ t: T, pose: near(slot), arc: k === 0 ? 10 : 12 });
      T += 0.3;
      keys.push({ t: T, pose: touch(slot) });
      ignite.push({ slot, at: T + 0.12 });
      T += 0.42;
      keys.push({ t: T, pose: touch(slot) });
      T += 0.24;
      keys.push({ t: T, pose: near(slot) });
    });
    const last = order[order.length - 1];
    T += 0.8 + (last !== undefined ? Math.abs(this.wick(last)[0] - fx) / 800 : 0);
    keys.push({ t: T, pose: up, arc: 12 });
    T += 0.6;
    keys.push({ t: T, pose: rest });
    this.burning = new Set();
    for (const i of [...placedSlots(s.placed), SHAMASH]) this.flames.get(i)!.grow = 0;
    this.seq = { t0: t, keys, ignite, end: T, onDone };
    this.dirty = true;
  }

  /** Lit at once, without the journey (reduced motion, or a later visit) */
  lightNow() {
    this.seq = null;
    this.shPrev = null;
    if (this.st)
      for (const i of [...placedSlots(this.st.placed), SHAMASH]) {
        this.burning.add(i);
        this.flames.get(i)!.grow = 1;
      }
    this.dirty = true;
  }

  /** the strength of the flames' light: a little less late in the evening, and weaker against daylight */
  private strength() {
    const s = this.st!;
    return (1 - 0.18 * s.burnt) * (0.45 + 0.55 * s.night);
  }

  /** the lights whose steady part belongs in the cached picture now */
  private steadyNow() {
    return [...this.burning]
      .filter((i) => this.flames.get(i)!.grow >= 1 && !(i === SHAMASH && this.away))
      .sort()
      .join();
  }

  /** One frame at `t` seconds. `still`: flames at rest (reduced motion, or a single paint). */
  frame(t: number, still = false) {
    const s = this.st;
    const a = this.a;
    if (!s || !a || !this.W) return;
    const t0 = performance.now();
    const dt = this.lastT < 0 ? 1 / 30 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;

    // the journey of the shamash
    let carried: Pose | null = null;
    if (this.seq) {
      const q = this.seq;
      const local = t - q.t0;
      for (const ig of q.ignite) {
        if (local >= ig.at && !this.burning.has(ig.slot)) {
          this.burning.add(ig.slot);
          const f = this.flames.get(ig.slot)!;
          f.grow = 0;
          f.igniteAt = t;
        }
      }
      carried = this.poseAt(q.keys, local);
      if (local >= q.end) {
        this.seq = null;
        carried = null;
        this.shPrev = null;
        q.onDone?.();
      }
    }
    this.away = !!carried && (Math.abs(carried.y - SCENE.shamash.foot[1]) > 1 || Math.abs(carried.tilt) > 0.001 || Math.abs(carried.x - SCENE.shamash.foot[0]) > 0.5);

    // drafts: now and then a breath of air crosses the window from one side
    if (!still) {
      if (!this.draft && t > this.nextDraft) {
        this.draft = { t0: t, dir: hash(Math.floor(t), 7) > 0 ? 1 : -1, amp: 0.11 + 0.08 * Math.abs(hash(Math.floor(t), 9)) };
        this.nextDraft = t + 9 + 8 * Math.abs(hash(Math.floor(t), 13));
      }
      if (this.draft && t - this.draft.t0 > 6) this.draft = null;
    }

    // where each burning flame stands, and how it moves
    const L = this.shL;
    const items: { slot: number; x: number; y: number; f: Flame; g: number }[] = [];
    for (const slot of this.burning) {
      const f = this.flames.get(slot)!;
      let x: number;
      let y: number;
      let push = 0;
      if (slot === SHAMASH && carried) {
        x = carried.x + Math.sin(carried.tilt) * L;
        y = carried.y - Math.cos(carried.tilt) * L;
        // the carried flame trails behind its motion
        if (this.shPrev && dt > 0) {
          const v = (x - (this.shPrev.x + Math.sin(this.shPrev.tilt) * L)) / dt;
          this.shVel += (v - this.shVel) * Math.min(1, dt * 12);
        }
        push = -this.shVel * 0.0006;
      } else {
        [x, y] = this.wick(slot);
        if (slot === SHAMASH && !carried) this.shVel *= 0.8;
      }
      if (this.draft) {
        const d = this.draft;
        const delay = ((d.dir > 0 ? x : BW - x) / BW) * 1.1;
        const e = t - d.t0 - delay;
        const env = e <= 0 ? 0 : e < 0.7 ? smoothstep(0, 0.7, e) : e < 1.5 ? 1 : 1 - smoothstep(1.5, 3.6, e);
        push += d.dir * d.amp * env * (0.8 + 0.2 * Math.sin(e * 5.1 + slot));
      }
      if (!still) f.step(t, dt, push);
      else {
        f.lean = 0;
        f.vel = 0;
      }
      if (f.grow < 1) f.grow = still ? 1 : Math.min(1, (t - f.igniteAt) / 0.75);
      items.push({ slot, x, y, f, g: f.grow < 1 ? ease(f.grow) : 1 });
    }
    if (carried) this.shPrev = carried;

    // the cached picture: rebuilt when the evening changes, or a light has caught (its steady light joins)
    const steady = this.steadyNow();
    if (this.dirty || steady !== this.steady) {
      this.steady = steady;
      this.build();
      this.dirty = false;
    }

    // the live light: the flickering quarter of each steady light, all of a light still catching, and the
    // carried shamash's (it lights what it passes: the light of the cups near it, and of its own place).
    // On every other frame: fifteen times a second while they simply burn, thirty while the shamash goes round
    // (the light of a flame trembles slower than the flame sways)
    this.frameNo++;
    const lightNow = still || this.frameNo % 2 === 0 || !!this.cache;
    const lc = this.lctx;
    if (lightNow) {
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    lc.fillStyle = '#000';
    lc.fillRect(0, 0, TW, TH);
    lc.globalCompositeOperation = 'lighter';
    const A = this.strength();
    const inCache = new Set(this.steady ? this.steady.split(',').map(Number) : []);
    for (const it of items) {
      const fl = still ? 0 : it.f.light(t);
      if (inCache.has(it.slot)) this.tile(lc, it.slot, A * Math.max(0, 1 - STEADY + fl));
      else if (it.slot === SHAMASH && carried) {
        const w = A * it.g * (1 + fl);
        const home = Math.max(0, 1 - Math.hypot(it.x - SCENE.flames[SHAMASH].foot[0], it.y - SCENE.flames[SHAMASH].foot[1]) / 60);
        this.tile(lc, SHAMASH, w * home);
        const sp = Math.abs(SCENE.flames[1].foot[0] - SCENE.flames[0].foot[0]);
        for (let j = 0; j < 8; j++) {
          const near = Math.max(0, 1 - Math.abs(it.x - SCENE.flames[j].foot[0]) / (1.4 * sp));
          if (near > 0) this.tile(lc, j, w * near * (1 - home) * 0.75);
        }
      } else this.tile(lc, it.slot, A * it.g * (1 + fl));
    }
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    }
    // without layers, the base is the cached picture plus that light, every frame
    if (this.cache) {
      const b = this.bctx;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-over';
      b.globalAlpha = 1;
      b.drawImage(this.cache, 0, 0);
      if (items.length) {
        b.globalCompositeOperation = 'lighter';
        b.imageSmoothingQuality = 'low';
        b.drawImage(lc.canvas, this.ox, this.oy, BW * this.k, BH * this.k);
        b.globalCompositeOperation = 'source-over';
      }
    }

    // the flames' layer: the shamash in the hand, the flames' faint reflections in the window's glass (none
    // on the stile where the leaves meet), the flames, and the glow of the air round each
    const ctx = this.fctx;
    if (items.length || carried || this.flamesDrawn) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // clear what the last frame drew (the flames move within a few pixels; the carried shamash anywhere)
      const [cx0, cy0, cx1, cy1] = this.drawn;
      if (cx1 > cx0) ctx.clearRect(this.ox + cx0 * this.k - 2, this.oy - this.fy0 + cy0 * this.k - 2, (cx1 - cx0) * this.k + 4, (cy1 - cy0) * this.k + 4);
      this.drawn = [Infinity, Infinity, -Infinity, -Infinity];
      this.flamesDrawn = items.length > 0 || !!carried;
      ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy - this.fy0);
      if (carried) {
        const [sx, sy, sw, sh] = SCENE.shamash.sprite;
        const [fx, fy] = SCENE.shamash.foot;
        ctx.save();
        ctx.translate(carried.x, carried.y);
        ctx.rotate(carried.tilt);
        ctx.drawImage(a.shamash, sx - fx, sy - fy, sw, sh);
        ctx.restore();
        const r = Math.hypot(sw, sh);
        this.mark(carried.x - r, carried.y - r, carried.x + r, carried.y + r);
      }
      const [st0, st1] = SCENE.stile;
      ctx.globalCompositeOperation = 'lighter';
      for (const it of items) {
        if (it.slot === SHAMASH && carried) continue;
        const f = SCENE.flames[it.slot];
        if (f.mirror[0] > st0 - 3 && f.mirror[0] < st1 + 3) continue;
        const kk = (f.mirror[1] - f.mirrorTip[1]) / (f.foot[1] - f.tip[1]);
        ctx.save();
        ctx.translate(f.mirror[0], f.mirror[1] + (it.y - f.foot[1]) * kk);
        ctx.scale(kk, kk);
        this.drawFlame(ctx, it.slot, 0, 0, it.f, t, still, it.g, 0.22, f.mirror[0], f.mirror[1], kk);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const it of items) this.drawFlame(ctx, it.slot, it.x, it.y, it.f, t, still, it.g);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }

    const ms = performance.now() - t0;
    this.stats.frames++;
    this.stats.frameMs += ms;
    if (ms > this.stats.maxFrameMs) this.stats.maxFrameMs = ms;
  }

  /** add one light tile to a tile-sized canvas, `w` times its steady light */
  private tile(c: CanvasRenderingContext2D, i: number, w: number) {
    if (w <= 0.002) return;
    const col = i % SCENE.cols;
    const row = Math.floor(i / SCENE.cols);
    c.globalAlpha = Math.min(1, w * SCENE.gains[i]);
    c.drawImage(this.a!.light, col * TW, row * TH, TW, TH, 0, 0, TW, TH);
  }

  /** draw a tile-sized light canvas up onto `dst`, sharpened by the detail ratio */
  private addSharp(src: HTMLCanvasElement, dst: CanvasRenderingContext2D) {
    const t = this.tmp.getContext('2d')!;
    const cw = this.tmp.width;
    const ch = this.tmp.height;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'copy';
    t.imageSmoothingQuality = 'medium';
    t.fillStyle = '#000';
    t.fillRect(0, 0, cw, ch);
    const [ax, ay, aw, ah] = [this.ox, this.oy, BW * this.k, BH * this.k];
    t.globalCompositeOperation = 'source-over';
    t.drawImage(src, ax, ay, aw, ah);
    t.globalCompositeOperation = 'multiply';
    t.drawImage(this.a!.detail, ax, ay, aw, ah);
    t.globalCompositeOperation = 'source-over';
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.globalCompositeOperation = 'lighter';
    // the detail is stored halved: add twice
    dst.globalAlpha = 1;
    dst.drawImage(this.tmp, 0, 0);
    dst.drawImage(this.tmp, 0, 0);
    dst.globalCompositeOperation = 'source-over';
  }

  private poseAt(keys: Key[], t: number): Pose {
    if (t <= keys[0].t) return keys[0].pose;
    for (let i = 1; i < keys.length; i++) {
      const b = keys[i];
      if (t <= b.t) {
        const a = keys[i - 1];
        const p = inOut((t - a.t) / Math.max(0.001, b.t - a.t));
        const arc = (b.arc ?? 0) * Math.sin(Math.PI * p);
        return { x: a.pose.x + (b.pose.x - a.pose.x) * p, y: a.pose.y + (b.pose.y - a.pose.y) * p - arc, tilt: a.pose.tilt + (b.pose.tilt - a.pose.tilt) * p };
      }
    }
    return keys[keys.length - 1].pose;
  }

  private spriteFor(lean: number) {
    const q = Math.round(Math.max(-LEAN_MAX, Math.min(LEAN_MAX, lean * 10)) * LEAN_STEPS);
    let c = this.sprites.get(q);
    if (!c) {
      c = flameSprite(this.spriteH, q / LEAN_STEPS / 10);
      this.sprites.set(q, c);
    }
    return c;
  }

  /** A flame from its wick at (x, y) base px, bent by its lean, breathing in height (the width gives a little) */
  private drawFlame(ctx: CanvasRenderingContext2D, slot: number, x: number, y: number, f: Flame, t: number, still: boolean, g: number, alpha = 1, ox = x, oy = y, sc = 1) {
    const op = ctx.globalCompositeOperation;
    // what it covers (base px), so the next frame clears just that
    const R = this.flameH(slot) * 2.2 * sc;
    this.mark(ox - R, oy - R * 1.25, ox + R, oy + R * 0.8);
    const Hf = this.flameH(slot) * (slot === SHAMASH ? 1.08 : 1);
    const spr = this.spriteFor(still ? 0 : f.lean);
    const hk = (still ? 1 : f.height(t)) * (0.2 + 0.8 * g);
    const wk = Math.pow(hk, -0.5) * (0.5 + 0.5 * g);
    const scale = Hf / this.spriteH;
    const dw = spr.width * scale * wk;
    const dh = spr.height * scale * hk;
    if (this.glow) {
      const r = Hf * 1.7 * (0.4 + 0.6 * g);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 * g * alpha;
      ctx.drawImage(this.glow, x + f.lean * Hf * 0.5 - r, y - Hf * 0.45 - r, 2 * r, 2 * r);
      ctx.globalCompositeOperation = op;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, x - dw / 2, y - SPR_BASE * Hf * hk, dw, dh);
    ctx.globalAlpha = 1;
  }

  /* ---------------- the cached picture: sky, base, empty cups, the steady light ---------------- */

  private build() {
    const s = this.st!;
    const a = this.a!;
    const x = (this.cache ?? this.base).getContext('2d', { alpha: false })!;
    const cw = this.base.width;
    const ch = this.base.height;
    const k = this.k;
    this.stats.builds++;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    // the sky: its horizon at the roofs opposite
    const [top, mid, low] = s.sky;
    const { ox, oy } = this;
    const aw = BW * k;
    const ah = BH * k;
    const hz = oy + SCENE.horizon * k;
    const g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, rgba(top));
    g.addColorStop(0.5, rgba(mid));
    g.addColorStop(1, rgba(low));
    x.fillStyle = g;
    x.fillRect(0, 0, cw, ch);
    // the base: the late afternoon, and over it the night
    const n = s.night;
    if (n < 1) x.drawImage(a.baseDay, ox, oy, aw, ah);
    if (n > 0) {
      x.globalAlpha = n;
      x.drawImage(a.baseNight, ox, oy, aw, ah);
      x.globalAlpha = 1;
    }
    // the cups that hold nothing tonight, and the shamash's empty socket while it is carried
    const patch = (b: readonly number[]) => {
      const [x0, y0, x1, y1] = b;
      const { x: sx, y: sy } = SCENE.strip;
      if (n < 1) x.drawImage(a.emptyDay, x0 - sx, y0 - sy, x1 - x0, y1 - y0, ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
      if (n > 0) {
        x.globalAlpha = n;
        x.drawImage(a.emptyNight, x0 - sx, y0 - sy, x1 - x0, y1 - y0, ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
        x.globalAlpha = 1;
      }
    };
    for (let i = 0; i < 8 - s.placed; i++) patch(SCENE.cups[i]);
    if (this.away) patch(SCENE.socket);

    // the steady light of the flames that have caught, sharpened by the detail
    const lc = this.low.getContext('2d', { alpha: false })!;
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    lc.fillStyle = '#000';
    lc.fillRect(0, 0, TW, TH);
    lc.globalCompositeOperation = 'lighter';
    const A = this.strength() * STEADY;
    const lit = this.steady ? this.steady.split(',').map(Number) : [];
    for (const i of lit) this.tile(lc, i, A);
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    if (lit.length) this.addSharp(this.low, x);
    // the window across the alley: soft light, drawn up as it is
    if (s.window > 0 && n > 0) {
      lc.fillRect(0, 0, TW, TH);
      lc.globalCompositeOperation = 'lighter';
      this.tile(lc, 9, s.window * n);
      lc.globalCompositeOperation = 'source-over';
      lc.globalAlpha = 1;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(this.low, ox, oy, aw, ah);
      x.globalCompositeOperation = 'source-over';
    }
  }
}
