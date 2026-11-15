/**
 * The chanukiah on the Chanukah card: one Canvas 2D, a few cached layers, and flames with a little physics.
 *
 * The scene is a window at evening: the real sky of the place behind (skyAt(), the same colours as the live
 * sky above), a stone sill, and a brass chanukiah on it: eight cups in a row on nested arms, the shamash
 * raised in the middle. Tonight's candles stand in the rightmost cups (they are set from the right) and are
 * lit from the left, the newest first.
 *
 * The flames: each one is a sprite of light painted once, pixel by pixel, from a simple model of a candle
 * flame (a dark cone over the wick, a white-gold heart, an amber edge that thins to the tip, a blue foot).
 * Every frame it is drawn in thin horizontal strips, each shifted by the flame's lean, so it bends from the
 * wick up like a real flame instead of tilting as one piece. The lean is a damped spring pushed by slow,
 * smooth noise in the air and, now and then, a draft that crosses the window from one side, reaching each
 * flame a little later than the one before. The height breathes slowly and flickers a little. Nothing
 * strobes. A carried flame trails behind the way it moves (the shamash, while it lights the candles).
 *
 * The light: each flame lays a soft warm pool on the window and the brass (added light, so it brightens
 * whatever it falls on and never paints a coloured haze over it), and the wax under a flame glows.
 *
 * Cost: the window, the brass and the standing candles are painted into one cached layer when something
 * changes (the sky once a minute, a candle lit, the candles burning down); a frame is that layer plus the
 * halos, the flames and the moving shamash. The card's loop runs at 30 fps while the candles burn and 60 while
 * the shamash moves, only while the card is on screen, and not at all before lighting or with reduced motion.
 */

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
  /** the window's sky, top / middle / horizon (skyAt) */
  sky: [RGB, RGB, RGB];
  /** candles standing in the cups tonight (1–8; 8 stubs on the eighth day) */
  placed: number;
  /** burning now */
  lit: boolean;
  /** 0 (new) … 1 (burnt down) */
  burnt: number;
  /** 0 by day … 1 at night: how much the flames' light shows against the window */
  night: number;
}

/* ---------------- geometry (css px) ---------------- */

const CANDLE_W = 7;
const CANDLE_H = 40;
const CUP_H = 7;
const FLAME_H = 24;
const FLAME_W = 10.5;
/** each arm hangs this much lower than the one inside it */
const ARM_DROP = 12.5;
/** the flame's foot stands this far above the candle's top, around the wick */
const LIFT = 1.5;

interface Geo {
  W: number;
  H: number;
  dpr: number;
  sill: number;
  cx: number;
  sp: number;
  cupY: number;
  shY: number;
  foot: number;
  slotX: (i: number) => number;
}

function geo(W: number, H: number, dpr: number): Geo {
  const sill = H - 28;
  const sp = Math.min(32, Math.floor((W - 64) / 8));
  const cx = Math.round(W / 2);
  const foot = sill;
  const cupY = sill - 72;
  return { W, H, dpr, sill, cx, sp, cupY, shY: cupY - 20, foot, slotX: (i) => cx + (i - 4) * sp };
}

/** The cups' slots, left to right; 4 is the shamash */
const CUPS = [0, 1, 2, 3, 5, 6, 7, 8];
/** The slots that hold candles tonight: the rightmost n of the eight, as they are set from the right */
export const placedSlots = (n: number) => CUPS.slice(8 - Math.max(0, Math.min(8, n)));
/** The order of lighting: the newest (leftmost) first, then rightward */
export const lightingOrder = (n: number) => placedSlots(n);

/* ---------------- the flame sprite: a little model of a candle flame, painted once per lean ---------------- */

const SPR_W = 30; // css px around a flame (room for its lean)
const SPR_H = 40;
const SPR_BASE = 33; // the wick's top, from the sprite's top
/** the leans painted, in quarter pixels at the tip */
const LEAN_STEPS = 4;
const LEAN_MAX = 5.5;

/**
 * One flame, leaning `lean` css px at its tip and bending from the wick up (the lean grows as height^1.6),
 * painted pixel by pixel: a soft amber envelope, a gold body, a white heart low in the middle, the dark
 * vapour just over the wick, a faint blue foot, and a tip that reddens as it thins out.
 */
function flameSprite(scale: number, lean: number) {
  const w = Math.ceil(SPR_W * scale);
  const h = Math.ceil(SPR_H * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const cx = w / 2;
  const by = SPR_BASE * scale;
  const Hf = FLAME_H * scale;
  const Rf = (FLAME_W / 2) * scale;
  const EDGE: RGB = [255, 140, 46];
  const AMBER: RGB = [255, 184, 86];
  const GOLD: RGB = [255, 224, 150];
  const WHITE: RGB = [255, 251, 238];
  // the profile's peak, to normalise the width
  const prof = (t: number) => Math.pow(t, 0.5) * Math.pow(1 - t, 0.85);
  const peak = prof(0.5 / 1.35);
  for (let py = 0; py < h; py++) {
    const v = (by - (py + 0.5)) / Hf; // 0 at the wick, 1 at the tip
    const t = (v + 0.14) / 1.14;
    if (t <= 0 || t >= 1) continue;
    const r = prof(t) / peak;
    const mid = cx + lean * scale * Math.pow(Math.max(0, v), 1.6);
    // the tip thins and reddens; the heart sits low in the middle; vapour over the wick
    const tip = smoothstep(0.55, 1.0, t);
    for (let px = 0; px < w; px++) {
      const u = Math.abs(px + 0.5 - mid) / Rf;
      const d = u / Math.max(0.001, r);
      if (d >= 1.3) continue;
      const body = Math.pow(1 - smoothstep(0.22, 1.18, d), 1.15);
      const heart = (1 - smoothstep(0.0, 0.62, d)) * smoothstep(0.1, 0.3, t) * (1 - smoothstep(0.42, 0.8, t));
      const cone = (1 - smoothstep(0.0, 0.38, d)) * (1 - smoothstep(0.08, 0.27, t));
      const L = body * (0.52 + 0.48 * heart) * (1 - 0.45 * cone) * (1 - 0.45 * tip);
      let col: RGB;
      if (L < 0.3) col = mix(EDGE, AMBER, L / 0.3);
      else if (L < 0.62) col = mix(AMBER, GOLD, (L - 0.3) / 0.32);
      else col = mix(GOLD, WHITE, Math.min(1, (L - 0.62) / 0.3));
      col = mix(col, EDGE, tip * 0.45);
      let a = Math.min(1, body * (0.28 + 1.05 * L)) * (1 - 0.5 * tip * tip);
      // the blue foot: a faint bowl along the lower edge
      const blue = smoothstep(0.4, 0.92, d) * (1 - smoothstep(0.95, 1.25, d)) * (1 - smoothstep(0.02, 0.16, t));
      if (blue > 0.01) {
        const ba = blue * 0.4;
        const na = a + ba * (1 - a);
        col = mix(col, [96, 128, 255], ba / Math.max(0.001, na));
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

/** A soft round pool of warm light, falling off like light does (painted once) */
function haloSprite(scale: number, R: number) {
  const s = Math.ceil(2 * R * scale);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  // ~ 1 / (1 + (r/r0)^2), faded to zero at the edge
  for (let k = 0; k <= 12; k++) {
    const x = k / 12;
    const v = (1 / (1 + (x / 0.16) ** 2)) * (1 - x * x);
    gr.addColorStop(x, `rgba(255,${Math.round(168 + 40 * v)},${Math.round(96 + 50 * v)},${(v * 0.9).toFixed(4)})`);
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
  constructor(
    readonly seed: number,
    public x: number,
  ) {}
  /** advance the lean: a damped spring pushed by the air (and by a carry's motion) */
  step(t: number, dt: number, push: number) {
    const air = fbm(t * 0.55, this.seed) * 1.15 + fbm(t * 1.7, this.seed + 3) * 0.35;
    const target = air + push;
    // ~1.4 Hz, a little under critical damping: a flame overshoots a touch and settles
    const k = 78;
    const c = 10.5;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = k * (target - this.lean) - c * this.vel;
      this.vel += a * h;
      this.lean += this.vel * h;
    }
    this.lean = Math.max(-6, Math.min(6, this.lean));
  }
  /** height factor: a slow breath and a small quick flicker */
  height(t: number) {
    return 1 + 0.055 * fbm(t * 0.8, this.seed + 11) + 0.022 * noise(t * 6.5, this.seed + 19) + 0.012 * noise(t * 11, this.seed + 23);
  }
}

/* ---------------- the shamash's journey ---------------- */

interface Pose {
  /** the candle's foot (css px) */
  x: number;
  y: number;
  /** tilt about the foot, radians (positive leans the top to the right) */
  tilt: number;
}
interface Key {
  t: number;
  pose: Pose;
  /** travel between keys: an arc this many px high */
  arc?: number;
}

/* ---------------- the painter ---------------- */

export interface StageStats {
  frames: number;
  frameMs: number;
  maxFrameMs: number;
  builds: number;
}

export class ChanukiahPainter {
  private ctx: CanvasRenderingContext2D;
  private g: Geo | null = null;
  private st: StageState | null = null;
  private base: HTMLCanvasElement = document.createElement('canvas');
  /** flame sprites by lean (quarter pixels), painted when first needed */
  private sprites = new Map<number, HTMLCanvasElement>();
  private spriteScale = 0;
  private halo: HTMLCanvasElement | null = null;
  private flames = new Map<number, Flame>();
  /** which slots burn (4 = the shamash); while lighting, they join one by one */
  private burning = new Set<number>();
  private dirty = true;
  private lastT = -1;
  private draft: { t0: number; dir: number; amp: number } | null = null;
  private nextDraft = 6;
  private seq: { t0: number; keys: Key[]; ignite: { slot: number; at: number }[]; end: number; onDone?: () => void } | null = null;
  private shPrev: Pose | null = null;
  private shVel = 0;
  stats: StageStats = { frames: 0, frameMs: 0, maxFrameMs: 0, builds: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i <= 8; i++) this.flames.set(i, new Flame(101 + i * 17, 0));
  }

  resize(W: number, H: number, dpr: number) {
    if (W < 10 || H < 10) return;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    const old = this.g;
    this.g = geo(W, H, dpr);
    if (!old || old.dpr !== dpr) {
      // the sprites are painted at the screen's own resolution, a little sharper than needed
      this.sprites.clear();
      this.spriteScale = dpr * 1.25;
      this.halo = haloSprite(dpr, 64);
    }
    for (const [i, f] of this.flames) f.x = this.g.slotX(i);
    this.dirty = true;
  }

  /** The state of the evening. Lit/unlit changes take effect at once (the lighting itself is light()). */
  set(s: StageState) {
    const prev = this.st;
    this.st = s;
    if (!this.seq) {
      this.burning.clear();
      if (s.lit) for (const i of [...placedSlots(s.placed), 4]) this.burning.add(i);
    }
    if (!prev || prev.placed !== s.placed || prev.lit !== s.lit || Math.abs(prev.burnt - s.burnt) > 0.002 || prev.night !== s.night || prev.sky.join() !== s.sky.join()) this.dirty = true;
  }

  get animating() {
    return !!this.seq;
  }
  get burningNow() {
    return this.burning.size > 0;
  }

  /**
   * The lighting: the shamash catches, rises from its cup, and lights tonight's candles one by one, the
   * newest (leftmost) first, then goes back to its place. `t` is the frame clock, seconds.
   */
  light(t: number, onDone?: () => void) {
    const g = this.g;
    const s = this.st;
    if (!g || !s) return;
    const order = lightingOrder(s.placed);
    const h = this.candleH();
    const rest: Pose = { x: g.cx, y: g.shY + 2, tilt: 0 };
    // just clear of its cup: the window has no room to spare above
    const up: Pose = { x: g.cx, y: g.shY + 2 - 12, tilt: 0 };
    const wickY = g.cupY + 2 - h;
    // the shamash comes to each wick from its right, leaning in, and touches it with the foot of its flame
    const L = h;
    const pose = (wx: number, wy: number, tilt: number): Pose => ({ x: wx - Math.sin(tilt) * L, y: wy + Math.cos(tilt) * L, tilt });
    const near = (slot: number): Pose => pose(g.slotX(slot) + 9, wickY - 11, -0.32);
    const touch = (slot: number): Pose => pose(g.slotX(slot) + 5.5, wickY - 2.5, -0.52);

    const keys: Key[] = [{ t: 0, pose: rest }];
    const ignite: { slot: number; at: number }[] = [];
    let T = 0;
    if (this.seq) return;
    // the shamash is lit first, in its place
    ignite.push({ slot: 4, at: 0.2 });
    T = 1.0;
    keys.push({ t: T, pose: rest });
    T += 0.6;
    keys.push({ t: T, pose: up });
    order.forEach((slot, k) => {
      // the first trip is longer; later ones are a short step to the next candle
      T += k === 0 ? 0.85 + Math.abs(g.slotX(slot) - g.cx) / 420 : 0.5;
      keys.push({ t: T, pose: near(slot), arc: k === 0 ? 4 : 5 });
      T += 0.3;
      keys.push({ t: T, pose: touch(slot) });
      ignite.push({ slot, at: T + 0.12 });
      T += 0.42;
      keys.push({ t: T, pose: touch(slot) });
      T += 0.24;
      keys.push({ t: T, pose: near(slot) });
    });
    T += 0.8 + Math.abs(g.slotX(order[order.length - 1] ?? 4) - g.cx) / 500;
    keys.push({ t: T, pose: up, arc: 5 });
    T += 0.6;
    keys.push({ t: T, pose: rest });
    this.burning = new Set();
    for (const i of [...placedSlots(s.placed), 4]) this.flames.get(i)!.grow = 0;
    this.seq = { t0: t, keys, ignite, end: T, onDone };
    this.dirty = true;
  }

  /** Lit at once, without the journey (reduced motion, or a later visit) */
  lightNow() {
    this.seq = null;
    this.shPrev = null;
    if (this.st) for (const i of [...placedSlots(this.st.placed), 4]) {
      this.burning.add(i);
      this.flames.get(i)!.grow = 1;
    }
    this.dirty = true;
  }

  private candleH() {
    return CANDLE_H * (1 - 0.62 * (this.st?.burnt ?? 0));
  }

  /** One frame at `t` seconds. `still`: flames at rest (reduced motion, or a single paint). */
  frame(t: number, still = false) {
    const g = this.g;
    const s = this.st;
    if (!g || !s || !this.halo) return;
    const t0 = performance.now();
    const dt = this.lastT < 0 ? 1 / 30 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const ctx = this.ctx;

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
          this.dirty = true;
        }
      }
      carried = this.poseAt(q.keys, local);
      if (local >= q.end) {
        this.seq = null;
        carried = null;
        this.shPrev = null;
        this.dirty = true;
        q.onDone?.();
      }
    }
    // the carried shamash is drawn on its own, so its cup stands empty in the cached layer meanwhile
    const away = !!carried && (carried.y < g.shY + 1.5 || Math.abs(carried.tilt) > 0.001 || Math.abs(carried.x - g.cx) > 0.5);
    if (this.dirty || away !== this.wasAway) {
      this.build(away);
      this.dirty = false;
      this.wasAway = away;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);

    // drafts: now and then a breath of air crosses the window from one side
    if (!still) {
      if (!this.draft && t > this.nextDraft) {
        this.draft = { t0: t, dir: hash(Math.floor(t), 7) > 0 ? 1 : -1, amp: 1.6 + 1.2 * Math.abs(hash(Math.floor(t), 9)) };
        this.nextDraft = t + 9 + 8 * Math.abs(hash(Math.floor(t), 13));
      }
      if (this.draft && t - this.draft.t0 > 6) this.draft = null;
    }

    // where each burning flame stands, and how it moves
    const h = this.candleH();
    const items: { slot: number; x: number; y: number; f: Flame; k: number }[] = [];
    for (const slot of this.burning) {
      const f = this.flames.get(slot)!;
      let x: number;
      let y: number;
      let push = 0;
      if (slot === 4 && carried) {
        x = carried.x + Math.sin(carried.tilt) * h;
        y = carried.y - Math.cos(carried.tilt) * h - LIFT;
        // the carried flame trails behind its motion
        if (this.shPrev && dt > 0) {
          const v = (x - (this.shPrev.x + Math.sin(this.shPrev.tilt) * h)) / dt;
          this.shVel += (v - this.shVel) * Math.min(1, dt * 12);
        }
        push = -this.shVel * 0.035;
      } else {
        x = g.slotX(slot);
        y = (slot === 4 ? g.shY + 2 - h : g.cupY + 2 - h) - LIFT;
        if (slot === 4 && !carried) this.shVel *= 0.8;
      }
      if (this.draft) {
        const d = this.draft;
        const delay = ((d.dir > 0 ? x : g.W - x) / g.W) * 1.1;
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
      items.push({ slot, x, y, f, k: f.grow < 1 ? ease(f.grow) : 1 });
    }
    if (carried) this.shPrev = carried;

    // 1. the light the flames lay on the window, the brass and the sill (added light)
    const night = s.night;
    if (items.length) {
      ctx.globalCompositeOperation = 'lighter';
      const R = 72;
      let sum = 0;
      let sx = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const it of items) {
        const flick = still ? 1 : 0.9 + 0.1 * fbm(t * 2.1, it.f.seed + 41);
        ctx.globalAlpha = (0.14 + 0.34 * night) * flick * it.k;
        const cy = it.y - FLAME_H * 0.35;
        ctx.drawImage(this.halo!, it.x + it.f.lean * 0.4 - R, cy - R, 2 * R, 2 * R);
        sum += it.k * flick;
        sx += it.x * it.k;
        x0 = Math.min(x0, it.x);
        x1 = Math.max(x1, it.x);
      }
      // the light they lay together on the sill, wider as there are more of them
      if (sum > 0.05) {
        const mx = sx / Math.max(0.001, items.reduce((a, it) => a + it.k, 0));
        const rx = (x1 - x0) / 2 + 70;
        ctx.save();
        ctx.translate(mx, g.sill + 3);
        ctx.scale(1, 16 / rx);
        const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        const a = Math.min(0.5, 0.05 * sum) * (0.35 + 0.65 * night);
        pool.addColorStop(0, `rgba(255,190,120,${a.toFixed(3)})`);
        pool.addColorStop(0.5, `rgba(255,170,100,${(a * 0.4).toFixed(3)})`);
        pool.addColorStop(1, 'rgba(255,160,90,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = pool;
        ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2. the shamash in the hand, between its cup and the candles
    if (carried) this.drawCandle(ctx, carried.x, carried.y, h, carried.tilt, this.burning.has(4), true);

    // 3. the wax glowing under each flame, then the flames
    for (const it of items) {
      const top = it.y + LIFT;
      if (!(it.slot === 4 && carried)) {
        const gl = ctx.createRadialGradient(it.x, top + 1, 0, it.x, top + 2, 9);
        gl.addColorStop(0, `rgba(255,214,150,${(0.55 * it.k).toFixed(3)})`);
        gl.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(it.x - CANDLE_W / 2, top, CANDLE_W, 10);
      }
      this.drawFlame(ctx, it.x, it.y, it.f, t, still, it.k);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const ms = performance.now() - t0;
    this.stats.frames++;
    this.stats.frameMs += ms;
    if (ms > this.stats.maxFrameMs) this.stats.maxFrameMs = ms;
  }
  private wasAway = false;

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
    const k = Math.round(Math.max(-LEAN_MAX, Math.min(LEAN_MAX, lean)) * LEAN_STEPS);
    let c = this.sprites.get(k);
    if (!c) {
      c = flameSprite(this.spriteScale, k / LEAN_STEPS);
      this.sprites.set(k, c);
    }
    return c;
  }

  /** A flame from its wick at (x, y), bent by its lean, breathing in height (the width gives a little) */
  private drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, f: Flame, t: number, still: boolean, k: number) {
    const spr = this.spriteFor(still ? 0 : f.lean);
    const hk = (still ? 1 : f.height(t)) * (0.2 + 0.8 * k);
    const wk = Math.pow(hk, -0.5) * (0.5 + 0.5 * k);
    const dw = SPR_W * wk;
    ctx.drawImage(spr, x - dw / 2, y - SPR_BASE * hk, dw, SPR_H * hk);
  }

  /** A candle from its foot, standing or tilted (the carried shamash); `free`: drawn whole, out of its cup */
  private drawCandle(ctx: CanvasRenderingContext2D, x: number, foot: number, h: number, tilt: number, lit: boolean, free: boolean) {
    ctx.save();
    ctx.translate(x, foot);
    ctx.rotate(tilt);
    const w = CANDLE_W;
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#b9ae97');
    body.addColorStop(0.28, '#f1eadb');
    body.addColorStop(0.45, '#faf6ec');
    body.addColorStop(1, '#a89c84');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h + 1);
    ctx.quadraticCurveTo(0, -h - 0.8, w / 2, -h + 1);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();
    if (free) {
      // its foot, as it comes out of the cup
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(-w / 2, -2, w, 2);
    }
    // the wick
    ctx.strokeStyle = lit ? '#2b1d12' : '#3a3026';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -h + 0.5);
    ctx.quadraticCurveTo(0.2, -h - 2.5, lit ? 0.6 : 1.2, -h - (lit ? 4 : 3.6));
    ctx.stroke();
    if (lit) {
      ctx.fillStyle = 'rgba(255,120,40,0.9)';
      ctx.beginPath();
      ctx.arc(0.6, -h - 4, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- the cached layer: the window, the sill, the brass, the standing candles ---------------- */

  private build(away: boolean) {
    const g = this.g!;
    const s = this.st!;
    const x = this.base.getContext('2d')!;
    this.stats.builds++;
    x.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const { W, H } = g;
    const [top, midC, low] = s.sky;
    // the window: the real sky of the place, a touch dimmer than the open sky (seen from inside a room)
    const dim = (c: RGB) => mix(c, [12, 12, 16], 0.12);
    const sk = x.createLinearGradient(0, 0, 0, g.sill);
    sk.addColorStop(0, rgba(dim(top)));
    sk.addColorStop(0.62, rgba(dim(midC)));
    sk.addColorStop(1, rgba(dim(low)));
    x.fillStyle = sk;
    x.fillRect(0, 0, W, g.sill);

    // the sill: warm limestone in the room's shade, lighter along its front edge
    const lum = (0.2126 * low[0] + 0.7152 * low[1] + 0.0722 * low[2]) / 255;
    const stone: RGB = mix([40, 35, 30], [176, 160, 132], Math.min(1, lum * 1.15));
    x.fillStyle = rgba(stone);
    x.fillRect(0, g.sill, W, H - g.sill);
    x.fillStyle = rgba(mix(stone, [255, 248, 236], 0.16));
    x.fillRect(0, g.sill, W, 1.2);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, g.sill + 1.2, W, 2);

    // the chanukiah: brass, lit from the room (dim) and from the flames above (warm)
    const lit = this.burning.size > 0 ? 1 : 0;
    const amb = 0.35 + 0.65 * Math.min(1, lum * 1.6);
    const dark: RGB = mix([44, 34, 20], [104, 80, 44], amb);
    const mid: RGB = mix([92, 72, 40], [168, 132, 72], amb);
    const hi: RGB = mix(mix([150, 124, 80], [226, 196, 132], amb), [255, 214, 150], 0.6 * lit * s.night);
    const { cx, sp, cupY, shY, foot } = g;

    // a soft contact shadow on the sill
    x.save();
    x.translate(cx, foot + 1.5);
    x.scale(1, 0.18);
    const sh = x.createRadialGradient(0, 0, 0, 0, 0, 52);
    sh.addColorStop(0, 'rgba(0,0,0,0.32)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh;
    x.fillRect(-52, -52, 104, 104);
    x.restore();

    // the foot and the stem
    const metal = (x0: number, x1: number) => {
      const m = x.createLinearGradient(x0, 0, x1, 0);
      m.addColorStop(0, rgba(dark));
      m.addColorStop(0.38, rgba(hi));
      m.addColorStop(0.55, rgba(mid));
      m.addColorStop(1, rgba(dark));
      return m;
    };
    x.fillStyle = metal(cx - 26, cx + 26);
    x.beginPath();
    x.moveTo(cx - 25, foot);
    x.quadraticCurveTo(cx - 22, foot - 7, cx - 6, foot - 9);
    x.lineTo(cx + 6, foot - 9);
    x.quadraticCurveTo(cx + 22, foot - 7, cx + 25, foot);
    x.closePath();
    x.fill();
    x.fillStyle = metal(cx - 2.6, cx + 2.6);
    x.fillRect(cx - 2.4, shY + 2, 4.8, foot - 9 - shY - 2);
    // a knop on the stem where the arms meet
    const knopY = cupY + 4 * ARM_DROP + 2;
    x.fillStyle = metal(cx - 5, cx + 5);
    x.beginPath();
    x.ellipse(cx, knopY, 4.6, 3.2, 0, 0, Math.PI * 2);
    x.fill();

    // the arms: nested half-rounds, each a brass tube with a highlight along its upper side
    for (let k = 4; k >= 1; k--) {
      const rx = k * sp;
      const ry = k * ARM_DROP;
      x.lineCap = 'round';
      x.strokeStyle = rgba(mid);
      x.lineWidth = 3.4;
      x.beginPath();
      x.ellipse(cx, cupY, rx, ry, 0, 0, Math.PI);
      x.stroke();
      x.strokeStyle = rgba(dark, 0.7);
      x.lineWidth = 1.2;
      x.beginPath();
      x.ellipse(cx, cupY + 0.9, rx, ry, 0, 0.04, Math.PI - 0.04);
      x.stroke();
      x.strokeStyle = rgba(hi, 0.9);
      x.lineWidth = 0.9;
      x.beginPath();
      x.ellipse(cx, cupY - 0.8, rx - 0.6, ry - 0.6, 0, 0.12, Math.PI - 0.12);
      x.stroke();
    }

    // the cups: small bowls with a rim
    const cup = (cx0: number, y: number) => {
      x.fillStyle = metal(cx0 - 6, cx0 + 6);
      x.beginPath();
      x.moveTo(cx0 - 6.2, y);
      x.lineTo(cx0 + 6.2, y);
      x.quadraticCurveTo(cx0 + 5.4, y + CUP_H - 1, cx0 + 2, y + CUP_H);
      x.lineTo(cx0 - 2, y + CUP_H);
      x.quadraticCurveTo(cx0 - 5.4, y + CUP_H - 1, cx0 - 6.2, y);
      x.closePath();
      x.fill();
      x.fillStyle = rgba(hi, 0.85);
      x.fillRect(cx0 - 6.2, y - 0.6, 12.4, 1.2);
    };

    // the standing candles go in before the rims, so the cups hold them
    const h = this.candleH();
    for (const slot of placedSlots(s.placed)) this.drawCandle(x, g.slotX(slot), cupY + 2, h, 0, this.burning.has(slot), false);
    if (!away) this.drawCandle(x, cx, shY + 2, h, 0, this.burning.has(4), false);
    for (const slot of CUPS) cup(g.slotX(slot), cupY);
    cup(cx, shY);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
