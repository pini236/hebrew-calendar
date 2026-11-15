/**
 * The saffron silk ribbon, the app's signature: a bookmark sewn at the top edge of whatever it marks
 * (the "what matters now" card on היום, the open tab). Drawn on a small canvas by silk.ts.
 *
 * It only draws while it moves. It drops in when it appears, answers the page's scroll (a fling makes
 * it trail and swing back), now and then a soft gust stirs it (every 6–12 s, only where `wind` is on),
 * and on Android a shake of the phone. Once still it stops completely until the next of those.
 * Off screen, in a hidden tab, or with "reduce motion", it hangs still and costs nothing.
 *
 * Its colours are read from the theme (--ribbon, --surface) at runtime, so it follows a theme switch live.
 * The parent must be positioned; place the canvas with CSS (see `.silk` in styles.css): its centre is
 * the ribbon's centre, its top edge the anchor, and --silk-half is half its width.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { SilkSim, paintSilk, srgbToLinear, type RGB, type SilkLook } from './silk';

export interface SilkRibbonProps {
  /** ribbon width, CSS px */
  width: number;
  /** anchor to the fork tips, CSS px */
  length: number;
  /** chain links: 12–14 for a large ribbon, 6–8 for a small one */
  segments?: number;
  /** painted cross-sections per link */
  sub?: number;
  /** strips across the width (4 shows the cupped surface; 2 for a small ribbon) */
  strips?: number;
  /** satin sheen, 0..1 */
  sheen?: number;
  /** idle gusts, 0 (none) .. 1 */
  wind?: number;
  /** how much the page's scroll moves it: 1 when it hangs on the page, a fraction on a fixed bar */
  scroll?: number;
  /** the phone's own movement (Android; never asks for a permission) */
  motion?: boolean;
  /** drop in when it appears (default true), after this many ms */
  drop?: boolean;
  delay?: number;
  /** a change of this value gives it a soft push (a page turned under it) */
  nudge?: string | number;
  className?: string;
}

/* ---------------- one loop for every ribbon ---------------- */

const all = new Set<Runner>();
const live = new Set<Runner>();
let raf = 0;
let lastTick = 0;

function tick(t: number) {
  raf = 0;
  // 60 frames a second is plenty for silk; a 120 Hz screen draws every other frame
  if (lastTick && t - lastTick < 1000 / 64) {
    raf = requestAnimationFrame(tick);
    return;
  }
  lastTick = t;
  for (const r of live) if (!r.frame(t)) live.delete(r);
  if (live.size) raf = requestAnimationFrame(tick);
  else lastTick = 0;
}
function wake(r: Runner) {
  live.add(r);
  if (!raf) raf = requestAnimationFrame(tick);
}

/* ---------------- what the page tells every ribbon ---------------- */

let listening = false;
const darkMq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const reducedMq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
let themeObs: MutationObserver | null = null;

const onScroll = () => {
  for (const r of all) if (r.scrollK > 0) r.poke();
};
const onTheme = () => {
  for (const r of all) r.restyle();
};
const onResize = () => {
  for (const r of all) r.measure();
};
const onVisibility = () => {
  for (const r of all) r.poke();
};
const onReduced = () => {
  for (const r of all) r.setReduced(!!reducedMq?.matches);
};
// the phone's acceleration, in m/s² (screen axes); iOS would ask for a permission, so not there
const MOTION_SCALE = 150;
const canMotion = () =>
  typeof window !== 'undefined' &&
  'DeviceMotionEvent' in window &&
  typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission !== 'function';
const onMotion = (e: DeviceMotionEvent) => {
  const a = e.acceleration;
  if (!a || a.x == null || a.y == null) return;
  const ang = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
  // device axes (x right, y up) turned to the screen's, then y down
  const sx = a.x * Math.cos(ang) + a.y * Math.sin(ang);
  const sy = -(-a.x * Math.sin(ang) + a.y * Math.cos(ang));
  const m = Math.hypot(sx, sy);
  if (m < 0.9) return; // the sensor's own noise, and a hand that holds still
  const k = Math.min(1, 7 / m) * MOTION_SCALE;
  for (const r of all) if (r.motion) r.shake(sx * k, sy * k);
};

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  darkMq?.addEventListener?.('change', onTheme);
  reducedMq?.addEventListener?.('change', onReduced);
  themeObs = new MutationObserver(onTheme);
  // the recordings and measurements reach the ribbons here (design/ribbon)
  (window as unknown as { __silk?: Set<Runner> }).__silk = all;
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style', 'class'] });
}
function updateMotion() {
  if (!canMotion()) return;
  const want = [...all].some((r) => r.motion);
  if (want) window.addEventListener('devicemotion', onMotion);
  else window.removeEventListener('devicemotion', onMotion);
}
function unlisten() {
  if (!listening || all.size) return;
  listening = false;
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onResize);
  document.removeEventListener('visibilitychange', onVisibility);
  darkMq?.removeEventListener?.('change', onTheme);
  reducedMq?.removeEventListener?.('change', onReduced);
  themeObs?.disconnect();
  themeObs = null;
}

/* ---------------- colours from the theme ---------------- */

function parseColor(v: string): RGB | null {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

/* ---------------- one ribbon ---------------- */

const SAFFRON: RGB = [215, 156, 43];
/** the bit of ribbon above the anchor, where it comes over the edge (CSS px) */
const TUCK = 2;

class Runner {
  sim: SilkSim;
  private ctx: CanvasRenderingContext2D | null;
  private look: SilkLook = { base: SAFFRON.map(srgbToLinear) as RGB, dark: false };
  private dpr = 1;
  private visible = true;
  private reduced = !!reducedMq?.matches;
  private last = 0;
  private pageY = 0;
  // the anchor follows the page, but with a limited acceleration: a finger's flick is ~30 g
  private anchorY = 0;
  private anchorV = 0;
  private flow = 0;
  private gustTimer = 0;
  private dropTimer = 0;
  private io: IntersectionObserver | null = null;
  private dead = false;
  scrollK: number;
  motion: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    private p: Required<Pick<SilkRibbonProps, 'width' | 'length' | 'segments' | 'sub' | 'strips' | 'sheen' | 'wind' | 'scroll' | 'motion' | 'drop' | 'delay'>>,
    private cw: number,
    private ch: number,
    private pad: number,
  ) {
    this.scrollK = p.scroll;
    this.motion = p.motion;
    this.sim = new SilkSim({ width: p.width, length: p.length, segments: p.segments, seed: (Math.random() * 1e9) | 0 });
    this.ctx = canvas.getContext('2d');
    this.pageY = window.scrollY;
    all.add(this);
    listen();
    updateMotion();
    this.restyle(false);
    this.measure();
    this.io = new IntersectionObserver((es) => {
      this.visible = es[es.length - 1].isIntersecting;
      this.poke();
    });
    this.io.observe(canvas);
    if (p.drop && !this.reduced) {
      this.sim.drop();
      this.paint();
      this.dropTimer = window.setTimeout(() => {
        this.dropTimer = 0;
        this.last = 0;
        this.go();
      }, p.delay);
    } else {
      this.paint();
      this.scheduleGust();
    }
  }

  private get running() {
    return !this.dead && !this.reduced && this.visible && !document.hidden;
  }
  private go() {
    if (this.running && !this.dropTimer) wake(this);
  }
  /** something happened (scroll, visible again): run if there is anything to do */
  poke() {
    if (!this.running) {
      live.delete(this);
      this.last = 0;
      return;
    }
    const y = window.scrollY;
    if (this.scrollK > 0 && Math.abs(y - this.pageY) > 0.5) this.go();
    else if (!this.sim.asleep) this.go();
    else this.pageY = y;
    if (!this.gustTimer && this.sim.asleep) this.scheduleGust();
  }
  shake(ax: number, ay: number) {
    if (!this.running) return;
    this.sim.shake(ax, ay);
    this.go();
  }
  nudge() {
    if (!this.running) return;
    this.sim.nudge(Math.random() < 0.5 ? -1 : 1, 0.8);
    this.go();
  }
  /** a gust now (the recordings) */
  gust(strength = 1) {
    if (!this.running) return;
    this.sim.gust(strength);
    this.go();
  }
  setReduced(r: boolean) {
    this.reduced = r;
    if (r) {
      live.delete(this);
      this.sim.settle();
      this.paint();
    } else this.scheduleGust();
  }

  private scheduleGust() {
    if (this.gustTimer || this.p.wind <= 0 || this.reduced || this.dead) return;
    this.gustTimer = window.setTimeout(() => {
      this.gustTimer = 0;
      if (!this.running) return; // poke() schedules again once it is seen
      this.sim.gust(this.p.wind * (0.35 + Math.random() * 0.65));
      this.go();
    }, 6000 + Math.random() * 6000);
  }

  frame(t: number) {
    if (!this.running) {
      this.last = 0;
      return false;
    }
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
    this.last = t;
    // the page: how far it moved since the last frame (a jump, as a tab restoring its place, is not a fling)
    const y = window.scrollY;
    let d = y - this.pageY;
    this.pageY = y;
    if (Math.abs(d) > window.innerHeight * 0.6) d = 0;
    const k = this.scrollK;
    const pv = (d / dt) * k;
    this.flow += (pv - this.flow) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.flow) < 3 && !d) this.flow = 0;
    const amax = this.sim.g * 1.1;
    const target = Math.max(-1400, Math.min(1400, -pv));
    const dv = Math.max(-amax * dt, Math.min(amax * dt, target - this.anchorV));
    this.anchorV += dv;
    if (Math.abs(this.anchorV) < 1 && !d) this.anchorV = 0;
    this.anchorY += this.anchorV * dt;
    const moving = this.sim.advance(dt, 0, this.anchorY, Math.abs(this.flow));
    this.paint();
    if (moving || this.anchorV || this.flow) return true;
    this.last = 0;
    this.scheduleGust();
    return false;
  }

  restyle(repaint = true) {
    const cs = getComputedStyle(this.canvas);
    const rib = parseColor(cs.getPropertyValue('--ribbon')) ?? SAFFRON;
    const surf = parseColor(cs.getPropertyValue('--surface')) ?? [255, 254, 251];
    const lum = 0.2126 * srgbToLinear(surf[0]) + 0.7152 * srgbToLinear(surf[1]) + 0.0722 * srgbToLinear(surf[2]);
    this.look = { base: rib.map(srgbToLinear) as RGB, dark: lum < 0.2 };
    if (repaint && !live.has(this)) this.paint();
  }

  measure() {
    const r = this.canvas.getBoundingClientRect();
    // CSS zoom on a parent (the recordings): draw at the zoomed resolution
    const zoom = r.width > 0 ? r.width / this.cw : 1;
    // up to 3 device pixels per CSS pixel (a 3x phone); a zoomed recording may ask for more
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1)) * Math.min(4, Math.max(1, zoom));
    const w = Math.round(this.cw * dpr);
    const h = Math.round(this.ch * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = w / this.cw;
    if (!live.has(this)) this.paint();
  }

  paint() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    paintSilk(ctx, this.sim, this.look, {
      ox: this.pad + this.p.width / 2,
      oy: TUCK,
      dpr: this.dpr,
      sub: this.p.sub,
      strips: this.p.strips,
      sheen: this.p.sheen,
      shadow: true,
      tuck: TUCK,
    });
  }

  destroy() {
    this.dead = true;
    live.delete(this);
    all.delete(this);
    clearTimeout(this.gustTimer);
    clearTimeout(this.dropTimer);
    this.io?.disconnect();
    updateMotion();
    unlisten();
  }
}

/* ---------------- the component ---------------- */

export function SilkRibbon({
  width,
  length,
  segments = 12,
  sub = 4,
  strips = 4,
  sheen = 1,
  wind = 0,
  scroll = 0,
  motion = false,
  drop = true,
  delay = 0,
  nudge,
  className,
}: SilkRibbonProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const runner = useRef<Runner | null>(null);
  // room for the swing and the shadow
  const pad = Math.round(length * 0.3 + 4);
  const cw = width + pad * 2;
  const ch = Math.round(TUCK + length + 6 + length * 0.12);

  useLayoutEffect(() => {
    const r = new Runner(ref.current!, { width, length, segments, sub, strips, sheen, wind, scroll, motion, drop, delay }, cw, ch, pad);
    runner.current = r;
    return () => {
      r.destroy();
      runner.current = null;
    };
  }, [width, length, segments, sub, strips, sheen, wind, scroll, motion, drop, delay, cw, ch, pad]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    runner.current?.nudge();
  }, [nudge]);

  const style = { width: cw, height: ch, '--silk-half': `${cw / 2}px`, '--silk-top': `${TUCK}px` } as CSSProperties;
  return <canvas ref={ref} className={`silk ${className ?? ''}`} style={style} aria-hidden="true" />;
}
