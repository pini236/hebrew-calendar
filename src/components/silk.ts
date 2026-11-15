/**
 * The saffron bookmark ribbon, as silk: the physics of a hanging ribbon and the paint of its surface.
 * No DOM here (the physics is checked headless by scripts/test-silk.ts); SilkRibbon.tsx runs it.
 *
 * Space: x across the screen, y down the screen, z out of the page toward the reader. The ribbon is
 * sewn at the anchor (0,0,0) on the page's top edge and lies on the page (z = 0), which it can lift
 * off but never pass through.
 *
 * Physics: the centreline is a chain of points (Verlet, inextensible links, a little bending
 * stiffness), pulled by gravity and dragged by the air (more across the face than edge-on or along
 * the length). Each point also has a twist: an angle about the centreline with a torsion spring to
 * its neighbours, a spring back to the ribbon's own memory, and damping that calms the fast modes
 * first. Wind comes as soft gusts of smooth noise that travel down the ribbon. The page can scroll
 * (the anchor moves and the ribbon trails), and the app can nudge it or drop it in.
 *
 * Paint: the centreline is smoothed (Catmull-Rom) into thin cross-sections; between two sections a
 * quad (split across the width, since a ribbon cups a little) is shaded by its normal against a soft
 * light from the upper left: diffuse, plus a satin sheen (a narrow specular band) on the face and a
 * deeper, matte tone on the back. Width on screen is w·|cos twist|, so it turns and shows its edge.
 * The tail is a swallowtail (a V notch) cut from the same sections, so it bends and turns with them.
 */

export type RGB = [number, number, number];

export interface RibbonSpec {
  /** ribbon width, CSS px */
  width: number;
  /** anchor to the fork tips, CSS px */
  length: number;
  /** chain links (10–16 for a large ribbon, 6–8 for a small one) */
  segments: number;
  /** depth of the swallowtail notch, as a fraction of the width */
  notch?: number;
  /** a number that makes this ribbon's memory curl and wind its own */
  seed?: number;
}

/* ---------------- small deterministic noise ---------------- */

function hash(i: number, s: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(s, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** smooth value noise in [-1, 1] */
function noise(t: number, s: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, s);
  return a + (hash(i + 1, s) - a) * u;
}
function fbm(t: number, s: number) {
  return noise(t, s) * 0.68 + noise(t * 2.17 + 3.1, s + 17) * 0.32;
}
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

interface Gust {
  t0: number;
  attack: number;
  hold: number;
  release: number;
  amp: number;
  dir: number;
  seed: number;
}
function envelope(g: Gust, t: number) {
  const d = t - g.t0;
  if (d <= 0) return 0;
  if (d < g.attack) return smooth(d / g.attack);
  if (d < g.attack + g.hold) return 1;
  return 1 - smooth((d - g.attack - g.hold) / g.release);
}

/* ---------------- physics ---------------- */

const DT = 1 / 240;

export class SilkSim {
  readonly n: number;
  readonly seg: number;
  readonly width: number;
  readonly length: number;
  readonly notch: number;
  readonly g: number;
  /** positions relative to the world; the anchor moves with the page */
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  private px: Float64Array;
  private py: Float64Array;
  private pz: Float64Array;
  /** twist about the centreline (rad) and its rate */
  th: Float64Array;
  private om: Float64Array;
  private thRest: Float64Array;
  /** the rest shape, relative to the anchor */
  private rx: Float64Array;
  private ry: Float64Array;
  private rz: Float64Array;
  private torque: Float64Array;
  private contact: Float64Array;
  private lastAy = 0;
  /** the anchor, in the world (moves when the page scrolls) */
  ax = 0;
  ay = 0;
  /** 1: the top link is held straight down (sewn); 0: free hinge (while it drops in) */
  private hinge = 1;
  private hingeAt = 0;
  t = 0;
  private gusts: Gust[] = [];
  private rand: () => number;
  private seed: number;
  private curl: number;
  /** extra acceleration on the whole ribbon (device motion), px/s², fades by itself */
  private exX = 0;
  private exY = 0;
  /** the page's speed, smoothed (px/s) */
  private flowV = 0;
  private lastVa = 0;
  private jolt = 0;
  // torsion
  private kT: number;
  private kR: number;
  private cT: number;
  private cInt: number;
  private iters: number;
  /** how still it is: the largest speed (px/s) and offset from rest (px) in the last step */
  vmax = 0;
  dmax = 0;
  private quietFor = 0;

  constructor(spec: RibbonSpec) {
    this.width = spec.width;
    this.length = spec.length;
    this.notch = spec.notch ?? 0.5;
    const n = (this.n = Math.max(4, Math.round(spec.segments)) + 1);
    this.seg = spec.length / (n - 1);
    this.seed = spec.seed ?? 1;
    this.rand = rng(this.seed * 7919 + 13);
    // a smaller ribbon swings a little faster, but not by the full √L of a pendulum, so all of them feel calm
    this.g = 1250 * Math.sqrt(spec.length / 48);
    const f = () => new Float64Array(n);
    this.x = f();
    this.y = f();
    this.z = f();
    this.px = f();
    this.py = f();
    this.pz = f();
    this.th = f();
    this.om = f();
    this.thRest = f();
    this.rx = f();
    this.ry = f();
    this.rz = f();
    this.torque = f();
    this.contact = f();
    this.iters = n > 10 ? 10 : 7;
    // twist: the slowest mode turns about once a second; the fast ones are damped by internal friction
    const m = n - 2; // free points
    const lambda = (Math.PI / (2 * m + 1)) ** 2;
    const f0 = n > 10 ? 1.05 : 1.25;
    this.kR = 7;
    this.kT = ((2 * Math.PI * f0) ** 2 - this.kR) / lambda;
    this.cT = 2 * 0.2 * 2 * Math.PI * f0;
    this.cInt = Math.min(0.012 * this.kT, 0.4 / DT / 4);
    // a real ribbon is never quite straight: a slight curl to one side and a slight turn at the tail
    const side = this.rand() < 0.5 ? -1 : 1;
    this.curl = side * (0.012 + this.rand() * 0.01);
    const turn = (this.rand() < 0.5 ? -1 : 1) * (0.1 + this.rand() * 0.12);
    for (let i = 0; i < n; i++) this.thRest[i] = turn * (i / (n - 1)) ** 2;
    this.reset();
  }

  /** hanging still, at rest */
  reset() {
    const { n, seg } = this;
    for (let i = 0; i < n; i++) {
      this.x[i] = this.ax;
      this.y[i] = this.ay + i * seg;
      this.z[i] = 0;
      this.th[i] = this.thRest[i];
      this.om[i] = 0;
      this.rx[i] = 0;
      this.ry[i] = i * seg;
      this.rz[i] = 0;
    }
    this.px.set(this.x);
    this.py.set(this.y);
    this.pz.set(this.z);
    this.hinge = 1;
    this.gusts = [];
    this.exX = this.exY = 0;
    // let it find its own rest (the curl), then remember that shape
    this.lastAy = this.ay;
    for (let k = 0; k < 900; k++) this.step(DT, this.iters);
    for (let i = 0; i < n; i++) {
      this.rx[i] = this.x[i] - this.ax;
      this.ry[i] = this.y[i] - this.ay;
      this.rz[i] = this.z[i];
      this.th[i] = this.thRest[i];
      this.om[i] = 0;
    }
    this.settle();
  }

  /** snap exactly to rest (the last fraction of a pixel), zero speed */
  settle() {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.px[i] = this.ax + this.rx[i];
      this.y[i] = this.py[i] = this.ay + this.ry[i];
      this.z[i] = this.pz[i] = this.rz[i];
      this.th[i] = this.thRest[i];
      this.om[i] = 0;
    }
    this.vmax = this.dmax = 0;
    this.quietFor = 1;
  }

  /** start folded up over the top edge, toward the reader, and let it fall onto the page */
  drop() {
    const { n, seg } = this;
    const phi = (118 + this.rand() * 14) * (Math.PI / 180);
    const lean = (this.rand() < 0.5 ? -1 : 1) * (0.35 + this.rand() * 0.25);
    const lift = Math.sin(phi);
    for (let i = 0; i < n; i++) {
      const r = i * seg;
      this.x[i] = this.ax + r * lean * Math.abs(Math.cos(phi)) * 0.6;
      this.y[i] = this.ay + r * Math.cos(phi);
      this.z[i] = r * lift;
      this.th[i] = this.thRest[i] + (this.rand() - 0.5) * 0.6 * (i / (n - 1));
      this.om[i] = 0;
    }
    this.px.set(this.x);
    this.py.set(this.y);
    this.pz.set(this.z);
    this.lastAy = this.ay;
    this.hinge = 0;
    this.hingeAt = this.t;
    this.quietFor = 0;
  }

  /** a soft push to one side (dir ±1), as when the page under it is turned */
  nudge(dir: number, strength = 1) {
    const { n } = this;
    for (let i = 2; i < n; i++) {
      const k = (i / (n - 1)) ** 1.5;
      // a starting speed (px/s) toward one side, more at the tail, and a little turn with it
      this.px[i] -= dir * strength * 70 * k * DT;
      this.om[i] += dir * strength * 2.2 * k * Math.sign(this.curl);
    }
    this.quietFor = 0;
  }

  /** a gust of air, strength 0..1, that starts now */
  gust(strength = 1) {
    const r = this.rand;
    this.gusts.push({
      t0: this.t,
      attack: 0.5 + r() * 0.6,
      hold: 0.4 + r() * 1.4,
      release: 1.2 + r() * 0.9,
      amp: strength * (0.6 + r() * 0.4),
      dir: r() < 0.5 ? -1 : 1,
      seed: Math.floor(r() * 1e6),
    });
    this.quietFor = 0;
  }

  /** acceleration of the phone (screen axes, px/s²): the ribbon lags behind it */
  shake(ax: number, ay: number) {
    this.exX = -ax;
    this.exY = -ay;
    this.quietFor = 0;
  }

  /** the page jumped (a programmatic scroll): move with it, no inertia */
  teleport(dy: number) {
    this.ay += dy;
    this.lastAy += dy;
    for (let i = 0; i < this.n; i++) {
      this.y[i] += dy;
      this.py[i] += dy;
    }
  }

  get windy() {
    return this.gusts.length > 0;
  }

  /** still enough to stop drawing */
  get asleep() {
    return this.quietFor > 0.25;
  }

  /**
   * Run `elapsed` seconds in fixed steps while the anchor moves from where it is to (toX, toY).
   * `flow` is the page's speed (px/s) for the flutter, when it is not the anchor's own speed.
   * Returns false once the ribbon is still (it is then snapped to rest).
   */
  advance(elapsed: number, toX = this.ax, toY = this.ay, flow?: number) {
    const steps = Math.max(1, Math.min(24, Math.round(elapsed / DT)));
    const x0 = this.ax;
    const y0 = this.ay;
    // the page's speed: the air it moves past the ribbon makes it flutter (as a flag does)
    const vy = flow ?? (elapsed > 0 ? Math.abs(toY - y0) / elapsed : 0);
    this.flowV += (vy - this.flowV) * (1 - Math.exp(-elapsed * 9));
    if (Math.abs(this.flowV) < 2) this.flowV = 0;
    // the anchor's acceleration: a ribbon is never straight, so a jolt along it bends it to the side
    // it already curls to, and it swings back when the jolt is over
    const va = elapsed > 0 ? (toY - y0) / elapsed : 0;
    const aa = elapsed > 0 ? (va - this.lastVa) / elapsed : 0;
    this.lastVa = va;
    this.jolt += (clamp(aa, this.g * 1.5) - this.jolt) * (1 - Math.exp(-elapsed * 12));
    if (Math.abs(this.jolt) < 1) this.jolt = 0;
    for (let k = 1; k <= steps; k++) {
      this.ax = x0 + ((toX - x0) * k) / steps;
      this.ay = y0 + ((toY - y0) * k) / steps;
      this.step(DT, this.iters);
    }
    // the phone's push lasts as long as the phone moves
    const fade = Math.exp(-elapsed * 14);
    this.exX *= fade;
    this.exY *= fade;
    const still = !this.gusts.length && !this.flowV && !this.jolt && this.hinge >= 1 && this.vmax < 1.2 && this.dmax < 0.12 && Math.abs(this.exX) + Math.abs(this.exY) < 1;
    this.quietFor = still ? this.quietFor + elapsed : 0;
    if (this.asleep) {
      this.settle();
      return false;
    }
    return true;
  }

  private windAt(depth: number): [number, number, number] {
    let wx = 0;
    let wz = 0;
    let turb = 0;
    const f = Math.min(1, Math.abs(this.flowV) / 1400);
    if (f > 0.005) {
      // the page's own air: it lifts the ribbon off the paper and sets a wave running down it
      const tt = this.t - depth / 220;
      wx += f * 100 * fbm(tt * 1.6, 101);
      wz += f * (70 + 45 * fbm(tt * 1.3, 103));
      turb += f * 1.3 * fbm(tt * 2.2 + depth * 0.05, 107);
    }
    // a gust travels down the ribbon, so the tail answers a moment after the top
    for (const g of this.gusts) {
      const tt = this.t - depth / 160;
      const e = envelope(g, tt);
      if (e <= 0) continue;
      const a = e * g.amp;
      wx += a * g.dir * 115 * (0.62 + 0.55 * fbm(tt * 0.85, g.seed));
      wz += a * (26 + 34 * fbm(tt * 1.25, g.seed + 5));
      turb += a * fbm(tt * 1.9 + depth * 0.045, g.seed + 9);
    }
    return [wx, wz, turb];
  }

  step(dt: number, iters: number) {
    const { n, seg, g, x, y, z, px, py, pz, th, om } = this;
    this.t += dt;
    // gusts that are over
    if (this.gusts.length) this.gusts = this.gusts.filter((q) => this.t - q.t0 < q.attack + q.hold + q.release + this.length / 160 + 0.05);
    // the hinge closes softly after a drop
    if (this.hinge < 1) this.hinge = smooth((this.t - this.hingeAt - 0.32) / 0.6);
    const near = !this.gusts.length && !this.flowV && this.hinge >= 1 && this.vmax < 10 && this.dmax < 1;
    // the last fraction of a pixel settles a little faster (invisible, and it stops sooner)
    const calm = near ? 2.2 : 1;
    const cd = 2.6 * calm;
    const vsat = 380;
    const dt2 = dt * dt;
    let vmax = 0;
    let dmax = 0;
    const L = n - 1;

    for (let i = 1; i < n; i++) {
      if (i === 1) {
        // the second point is held by the hinge: it moves only with the anchor
        if (this.hinge >= 1) {
          px[1] = x[1];
          py[1] = y[1];
          pz[1] = z[1];
          continue;
        }
      }
      const vx = (x[i] - px[i]) / dt;
      const vy = (y[i] - py[i]) / dt;
      const vz = (z[i] - pz[i]) / dt;
      const sp = vx * vx + vy * vy + vz * vz;
      if (sp > vmax) vmax = sp;
      const ddx = x[i] - this.ax - this.rx[i];
      const ddy = y[i] - this.ay - this.ry[i];
      const ddz = z[i] - this.rz[i];
      const dd = ddx * ddx + ddy * ddy + ddz * ddz;
      if (dd > dmax) dmax = dd;
      const twd = Math.abs(th[i] - this.thRest[i]) * this.width * 0.5;
      if (twd * twd > dmax) dmax = twd * twd;
      const tw = Math.abs(om[i]) * this.width * 0.5;
      if (tw * tw > vmax) vmax = tw * tw;
      if (i === 1) continue;

      // local frame from the link above: tangent t, across-width u, face normal nn
      let tx = x[i] - x[i - 1];
      let ty = y[i] - y[i - 1];
      let tz = z[i] - z[i - 1];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // e1: screen-x made perpendicular to t; e2 = e1 × t (points at the reader when hanging)
      let e1x = 1 - tx * tx;
      let e1y = -tx * ty;
      let e1z = -tx * tz;
      const el = Math.hypot(e1x, e1y, e1z) || 1;
      e1x /= el;
      e1y /= el;
      e1z /= el;
      const e2x = e1y * tz - e1z * ty;
      const e2y = e1z * tx - e1x * tz;
      const e2z = e1x * ty - e1y * tx;
      const c = Math.cos(th[i]);
      const s = Math.sin(th[i]);
      const ux = c * e1x + s * e2x;
      const uy = c * e1y + s * e2y;
      const uz = c * e1z + s * e2z;
      const nx = -s * e1x + c * e2x;
      const ny = -s * e1y + c * e2y;
      const nz = -s * e1z + c * e2z;

      const depth = i * seg;
      const [wx, wz, turb] = this.gusts.length || this.flowV ? this.windAt(depth) : [0, 0, 0];
      // air relative to this piece of ribbon, saturated (a fast fling must not blow it away)
      const rx = wx - vx;
      const ry = -vy;
      const rz = wz - vz;
      const rn = clamp(rx * nx + ry * ny + rz * nz, vsat);
      const ru = clamp(rx * ux + ry * uy + rz * uz, vsat);
      const rt = clamp(rx * tx + ry * ty + rz * tz, vsat);
      // the face catches the air; edge-on and along the length it slips through
      const kn = cd;
      const ku = cd * 0.5;
      const kt = cd * 0.28;
      const k = (i / L) ** 2;
      let accX = kn * rn * nx + ku * ru * ux + kt * rt * tx + this.curl * g * k + this.exX + Math.sign(this.curl) * 0.2 * this.jolt * k;
      let accY = kn * rn * ny + ku * ru * uy + kt * rt * ty + g + this.exY;
      let accZ = kn * rn * nz + ku * ru * uz + kt * rt * tz - 0.05 * g;
      // the hinge is free while it drops in: no curl, just fall
      if (this.hinge < 1) {
        accX -= this.curl * g * k * (1 - this.hinge);
      }

      const nxp = x[i] + (x[i] - px[i]) + accX * dt2;
      const nyp = y[i] + (y[i] - py[i]) + accY * dt2;
      const nzp = z[i] + (z[i] - pz[i]) + accZ * dt2;
      px[i] = x[i];
      py[i] = y[i];
      pz[i] = z[i];
      x[i] = nxp;
      y[i] = nyp;
      z[i] = nzp;

      // twist: the air turns the lower part (more toward the free tail), and the sideways swing
      // turns it a little too, so it shows its edge as it swings
      const d = (i / L) ** 1.2;
      this.torque[i] = (turb * 90 + (ru / 100) * 6 * Math.sign(this.curl)) * d;
    }
    this.vmax = Math.sqrt(vmax);
    this.dmax = Math.sqrt(dmax);

    // twist update (all torques first, so there is no order bias down the chain)
    const kT = this.kT;
    const kR = this.kR;
    const cT = this.cT * calm;
    const cI = this.cInt;
    th[0] = 0;
    th[1] = this.thRest[1] * this.hinge + th[1] * (1 - this.hinge);
    for (let i = 2; i < n; i++) {
      const up = th[i - 1];
      const dn = i + 1 < n ? th[i + 1] : th[i];
      const oup = om[i - 1];
      const odn = i + 1 < n ? om[i + 1] : om[i];
      const onPage = z[i] < 0.05 ? 1.6 : 1;
      this.torque[i] += kT * (up - 2 * th[i] + dn - (this.thRest[i - 1] - 2 * this.thRest[i] + (i + 1 < n ? this.thRest[i + 1] : this.thRest[i]))) - kR * onPage * (th[i] - this.thRest[i]) - cT * om[i] + cI * (oup - 2 * om[i] + odn);
    }
    for (let i = 2; i < n; i++) {
      om[i] += this.torque[i] * dt;
      th[i] += om[i] * dt;
    }

    // constraints: sewn at the top, links of fixed length, a little bending stiffness, the page behind
    const h = this.hinge;
    const s2 = seg * 2;
    const contact = this.contact;
    contact.fill(1);
    const dAy = this.ay - this.lastAy;
    this.lastAy = this.ay;
    for (let it = 0; it < iters; it++) {
      x[0] = this.ax;
      y[0] = this.ay;
      z[0] = 0;
      if (h > 0) {
        x[1] += (this.ax + this.rx[1] - x[1]) * h;
        y[1] += (this.ay + this.ry[1] - y[1]) * h;
        z[1] += (this.rz[1] - z[1]) * h;
      }
      for (let i = 0; i < n - 1; i++) {
        const j = i + 1;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dz = z[j] - z[i];
        const dl = Math.hypot(dx, dy, dz) || 1e-6;
        const wi = i === 0 ? 0 : i === 1 ? 1 - h : 1;
        const wj = j === 1 ? 1 - h : 1;
        const ws = wi + wj;
        if (!ws) continue;
        const diff = (dl - seg) / dl / ws;
        x[i] += dx * diff * wi;
        y[i] += dy * diff * wi;
        z[i] += dz * diff * wi;
        x[j] -= dx * diff * wj;
        y[j] -= dy * diff * wj;
        z[j] -= dz * diff * wj;
      }
      // bending: links two apart are pulled gently toward straight
      for (let i = 0; i < n - 2; i++) {
        const j = i + 2;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dz = z[j] - z[i];
        const dl = Math.hypot(dx, dy, dz) || 1e-6;
        if (dl >= s2) continue;
        const wi = i === 0 ? 0 : i === 1 ? 1 - h : 1;
        const ws = wi + 1;
        const diff = ((dl - s2) / dl / ws) * 0.06;
        x[i] += dx * diff * wi;
        y[i] += dy * diff * wi;
        z[i] += dz * diff * wi;
        x[j] -= dx * diff;
        y[j] -= dy * diff;
        z[j] -= dz * diff;
      }
      for (let i = 1; i < n; i++) if (z[i] < 0) z[i] = contact[i] = 0;
    }
    // landing on paper: the motion into the page stops, and silk slides on it with a little friction
    for (let i = 2; i < n; i++) {
      if (contact[i] !== 0) continue;
      contact[i] = 1;
      if (pz[i] < 0) pz[i] = 0;
      px[i] += (x[i] - px[i]) * 0.012;
      py[i] += (y[i] - py[i] - dAy) * 0.012;
    }
  }
}

/* ---------------- paint ---------------- */

export interface SilkLook {
  /** the ribbon colour, linear RGB 0..1 */
  base: RGB;
  /** the dark theme (a deeper shadow, a softer sheen) */
  dark: boolean;
}

export interface PaintOpts {
  /** the anchor's place on the canvas, CSS px */
  ox: number;
  oy: number;
  /** device pixels per CSS px */
  dpr: number;
  /** cross-sections per chain link */
  sub: number;
  /** strips across the width (2 or 4) */
  strips: number;
  /** satin sheen 0..1 */
  sheen: number;
  /** draw the contact shadow */
  shadow: boolean;
  /** how much of the ribbon shows above the anchor, where it comes over the edge (CSS px) */
  tuck: number;
}

export function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number) {
  c = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}
const css = (r: number, g: number, b: number) => `rgb(${linearToSrgb(r)},${linearToSrgb(g)},${linearToSrgb(b)})`;

// a soft key light from the upper left and in front; the viewer looks straight at the page
const LX = -0.34;
const LY = -0.6;
const LZ = 0.72;
const LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN;
const ly = LY / LN;
const lz = LZ / LN;
// the sheen: the half-vector of a window to the left, so the satin band lights up when the face
// turns about 20° toward it, and runs along the ribbon with the twist
const WX = -0.72;
const WY = -0.18;
const WZ = 0.67;
const WN = Math.hypot(WX, WY, WZ);
const SN = Math.hypot(WX / WN, WY / WN, WZ / WN + 1);
const sx = WX / WN / SN;
const sy = WY / WN / SN;
const sz = (WZ / WN + 1) / SN;

/** scratch buffers, grown as needed */
let buf = new Float64Array(0);

export function paintSilk(ctx: CanvasRenderingContext2D, sim: SilkSim, look: SilkLook, o: PaintOpts) {
  const { n } = sim;
  const sub = Math.max(1, o.sub);
  const K = (n - 1) * sub + 1;
  // per section: cx, cy, cz, ux, uy, uz, nx, ny, nz, a (arc fraction)
  const STR = 10;
  if (buf.length < K * STR) buf = new Float64Array(K * STR);
  const b = buf;
  const ax = sim.ax;
  const ay = sim.ay;
  const X = sim.x;
  const Y = sim.y;
  const Z = sim.z;
  const T = sim.th;

  // centreline through the chain points (Catmull-Rom), relative to the anchor
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i2 = i + 1;
    const i3 = Math.min(n - 1, i + 2);
    // mirror the ends so the curve keeps its direction there
    const p0x = i === 0 ? 2 * X[0] - X[1] : X[i0];
    const p0y = i === 0 ? 2 * Y[0] - Y[1] : Y[i0];
    const p0z = i === 0 ? 2 * Z[0] - Z[1] : Z[i0];
    const p3x = i3 === i2 ? 2 * X[i2] - X[i] : X[i3];
    const p3y = i3 === i2 ? 2 * Y[i2] - Y[i] : Y[i3];
    const p3z = i3 === i2 ? 2 * Z[i2] - Z[i] : Z[i3];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      const c0 = -0.5 * t3 + t2 - 0.5 * t;
      const c1 = 1.5 * t3 - 2.5 * t2 + 1;
      const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const c3 = 0.5 * t3 - 0.5 * t2;
      const q = (i * sub + k) * STR;
      b[q] = c0 * p0x + c1 * X[i] + c2 * X[i2] + c3 * p3x - ax;
      b[q + 1] = c0 * p0y + c1 * Y[i] + c2 * Y[i2] + c3 * p3y - ay;
      b[q + 2] = c0 * p0z + c1 * Z[i] + c2 * Z[i2] + c3 * p3z;
      // twist, eased between points
      const u = t * t * (3 - 2 * t);
      b[q + 9] = T[i] + (T[i2] - T[i]) * (0.5 * t + 0.5 * u);
    }
  }
  {
    const q = (K - 1) * STR;
    b[q] = X[n - 1] - ax;
    b[q + 1] = Y[n - 1] - ay;
    b[q + 2] = Z[n - 1];
    b[q + 9] = T[n - 1];
  }
  // frames: tangent from the neighbours, then the width and the face normal turned by the twist
  for (let k = 0; k < K; k++) {
    const q = k * STR;
    const qa = Math.max(0, k - 1) * STR;
    const qb = Math.min(K - 1, k + 1) * STR;
    let tx = b[qb] - b[qa];
    let ty = b[qb + 1] - b[qa + 1];
    let tz = b[qb + 2] - b[qa + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let e1x = 1 - tx * tx;
    let e1y = -tx * ty;
    let e1z = -tx * tz;
    const el = Math.hypot(e1x, e1y, e1z) || 1;
    e1x /= el;
    e1y /= el;
    e1z /= el;
    const e2x = e1y * tz - e1z * ty;
    const e2y = e1z * tx - e1x * tz;
    const e2z = e1x * ty - e1y * tx;
    const th = b[q + 9];
    const c = Math.cos(th);
    const s = Math.sin(th);
    b[q + 3] = c * e1x + s * e2x;
    b[q + 4] = c * e1y + s * e2y;
    b[q + 5] = c * e1z + s * e2z;
    b[q + 6] = -s * e1x + c * e2x;
    b[q + 7] = -s * e1y + c * e2y;
    b[q + 8] = -s * e1z + c * e2z;
  }

  const hw = sim.width / 2;
  // the swallowtail: past this arc fraction the centre is cut away, down to a V between two tips
  const tail0 = Math.max(0.5, 1 - (sim.notch * sim.width) / sim.length);
  const cut = (k: number) => smooth01((k / (K - 1) - tail0) / (1 - tail0));
  // a point across the section, s in [-1, 1]; edge-on it keeps a hairline so it never vanishes
  const px = (k: number, s: number) => {
    const q = k * STR;
    let ux = b[q + 3];
    if (Math.abs(ux) < 0.05) ux = ux < 0 ? -0.05 : 0.05;
    return o.ox + b[q] + s * hw * ux;
  };
  const py = (k: number, s: number) => {
    const q = k * STR;
    return o.oy + b[q + 1] + s * hw * b[q + 4];
  };

  const ctx2 = ctx;
  ctx2.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);

  // the outline: down the left edge, the left tip, the notch, the right tip, up the right edge
  const outline = (dx: (k: number) => number, dy: (k: number) => number) => {
    ctx2.beginPath();
    ctx2.moveTo(px(0, -1) + dx(0), py(0, -1) + dy(0));
    for (let k = 1; k < K; k++) ctx2.lineTo(px(k, -1) + dx(k), py(k, -1) + dy(k));
    // notch apex: the centre at the start of the tail
    const ka = Math.round(tail0 * (K - 1));
    ctx2.lineTo(px(ka, 0) + dx(ka), py(ka, 0) + dy(ka));
    for (let k = K - 1; k >= 0; k--) ctx2.lineTo(px(k, 1) + dx(k), py(k, 1) + dy(k));
    ctx2.closePath();
  };

  // 1. a very soft shadow on the page: tight where the ribbon lies on it, wider and fainter where it lifts
  if (o.shadow) {
    const off = 10000;
    const zx = -lx / lz;
    const zy = -ly / lz;
    let zm = 0;
    for (let k = 0; k < K; k++) zm += b[k * STR + 2];
    zm /= K;
    // lifted high (as it drops in) the shadow fades rather than wandering off across the page
    const fadeZ = 1 / (1 + zm / 5);
    ctx2.save();
    ctx2.translate(-off, 0);
    ctx2.shadowOffsetX = off * o.dpr;
    const zc = (k: number) => Math.min(6, b[k * STR + 2]);
    const sdx = (k: number) => 0.25 + zc(k) * zx;
    const sdy = (k: number) => 0.55 + zc(k) * zy;
    ctx2.fillStyle = '#000';
    // one pass (a blur is the costliest thing drawn here): soft, a little softer as it lifts
    ctx2.shadowColor = look.dark ? `rgba(0,0,0,${0.6 * fadeZ})` : `rgba(70,45,5,${0.26 * fadeZ})`;
    ctx2.shadowBlur = (1.4 + Math.min(6, zm) * 0.3) * o.dpr;
    outline(sdx, sdy);
    ctx2.fill();
    ctx2.restore();
  }

  // 2. the ribbon: a base fill (so no seam shows between quads), then each quad shaded
  const [br, bg, bb] = look.base;
  // the back of satin is matte and a little deeper
  const kr = br ** 1.12 * 0.8;
  const kg = bg ** 1.12 * 0.8;
  const kb = bb ** 1.12 * 0.8;
  const amb = 0.56;
  const kd = 0.56;
  const rest = amb + kd * lz; // a flat ribbon facing the reader shows exactly its own colour
  const sheen = o.sheen * (look.dark ? 0.75 : 1);
  ctx2.fillStyle = css(br, bg, bb);
  outline(
    () => 0,
    () => 0,
  );
  ctx2.fill();

  // where it comes over the edge: seen from above, so shorter and in shadow, lighter at the fold
  if (o.tuck > 0) {
    const l = px(0, -1);
    const r = px(0, 1);
    const gr = ctx2.createLinearGradient(0, o.oy - o.tuck, 0, o.oy);
    gr.addColorStop(0, css(br * 0.66, bg * 0.66, bb * 0.66));
    gr.addColorStop(0.75, css(br * 0.8, bg * 0.8, bb * 0.8));
    gr.addColorStop(1, css(br * 1.08, bg * 1.06, bb * 1.02));
    ctx2.fillStyle = gr;
    ctx2.fillRect(Math.min(l, r), o.oy - o.tuck, Math.abs(r - l), o.tuck + 0.3);
  }

  const S = Math.max(2, o.strips & ~1);
  // the edges curl toward the reader a little (a large ribbon only: on a small one it reads as a fold)
  const cup = S >= 4 ? 0.1 : 0;
  // quads overlap their neighbours by a hair, so the page never shows through a seam
  const seamS = 0.45 / hw;
  const seam = 0.4;
  for (let k = 0; k < K - 1; k++) {
    const q0 = k * STR;
    const q1 = (k + 1) * STR;
    const f0 = cut(k);
    const f1 = cut(k + 1);
    // the lower edge of this quad reaches a little into the next one (not at the tips)
    let ex = 0;
    let ey = 0;
    if (k < K - 2) {
      const dx = b[q1] - b[q0];
      const dy = b[q1 + 1] - b[q0 + 1];
      const dl = Math.hypot(dx, dy) || 1;
      ex = (dx / dl) * seam;
      ey = (dy / dl) * seam;
    }
    // the section normal and width between the two sections
    let nx = b[q0 + 6] + b[q1 + 6];
    let ny = b[q0 + 7] + b[q1 + 7];
    let nz = b[q0 + 8] + b[q1 + 8];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const ux = (b[q0 + 3] + b[q1 + 3]) / 2;
    const uy = (b[q0 + 4] + b[q1 + 4]) / 2;
    const uz = (b[q0 + 5] + b[q1 + 5]) / 2;
    for (let j = 0; j < S; j++) {
      // across-width range of this strip; in the tail each half keeps S/2 strips between edge and notch
      const left = j < S / 2;
      const jj = left ? j : j - S / 2;
      const span = (f: number) => {
        const a = left ? -1 : f;
        const z = left ? -f : 1;
        const lo = a + ((z - a) * jj) / (S / 2);
        let hi = a + ((z - a) * (jj + 1)) / (S / 2);
        if (hi < 0.999) hi += seamS;
        return [lo, hi];
      };
      const [a0, z0] = span(f0);
      const [a1, z1] = span(f1);
      if (z0 - a0 < seamS + 1e-3 && z1 - a1 < seamS + 1e-3) continue;
      const sm = (a0 + z0 + a1 + z1) / 4;
      const ph = cup * sm;
      const cc = Math.cos(ph);
      const ss = Math.sin(ph);
      let mx = nx * cc - ux * ss;
      let my = ny * cc - uy * ss;
      let mz = nz * cc - uz * ss;
      let back = false;
      if (mz < 0) {
        mx = -mx;
        my = -my;
        mz = -mz;
        back = true;
      }
      const dif = Math.max(0, mx * lx + my * ly + mz * lz);
      const shade = (amb + kd * dif) / rest;
      const nh = Math.max(0, mx * sx + my * sy + mz * sz);
      let r: number;
      let g: number;
      let bl: number;
      if (!back) {
        // satin: a narrow, warm band where the face turns toward the window
        const sp = sheen * 0.5 * nh ** 44;
        r = br * shade + sp * 1.0;
        g = bg * shade + sp * 0.86;
        bl = bb * shade + sp * 0.55;
      } else {
        const sp = sheen * 0.06 * nh ** 8;
        r = kr * shade + sp;
        g = kg * shade + sp * 0.85;
        bl = kb * shade + sp * 0.5;
      }
      ctx2.fillStyle = css(r, g, bl);
      ctx2.beginPath();
      ctx2.moveTo(px(k, a0), py(k, a0));
      ctx2.lineTo(px(k, z0), py(k, z0));
      ctx2.lineTo(px(k + 1, z1) + ex, py(k + 1, z1) + ey);
      ctx2.lineTo(px(k + 1, a1) + ex, py(k + 1, a1) + ey);
      ctx2.closePath();
      ctx2.fill();
    }
  }
}

function smooth01(x: number) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}
