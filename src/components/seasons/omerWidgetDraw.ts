/**
 * The Omer widget's bitmaps, drawn on a canvas the way OmerWidgetDraw.java draws them on Android
 * (the same geometry, alphas and order, line for line), for the HTML twin (OmerWidgetMock) and the
 * design previews. Android draws white masks that the layout tints; here each mask is drawn in white on
 * its own canvas and then tinted, which comes to the same pixels.
 */
import { CELL, LAG_BAOMER, type OmerWidgetModel } from '../../lib/widget';

/** the masks, as OmerWidgetDraw.MUTED / GREEN / RIBBON */
export const MUTED = 0;
export const GREEN = 1;
export const RIBBON = 2;

/** The field's geometry for a square of side b: cell, gap, outer margin (OmerWidgetDraw.cell) */
export function fieldGeometry(b: number) {
  const c = b / 8.82;
  const g = c * 0.26;
  return { c, g, o: g / 2, r: c / 2 };
}

/** The centre of day k (1–49): day 1 at the top right in Hebrew, top left in English */
export function cellCenter(b: number, k: number, rtl: boolean) {
  const { c, g, o, r } = fieldGeometry(b);
  const row = Math.floor((k - 1) / 7);
  const col = (k - 1) % 7;
  const x = o + col * (c + g) + r;
  return { x: rtl ? b - x : x, y: o + row * (c + g) + r };
}

/** The day the ribbon marks: the count of now, or day 1 before the count; 0 after it */
export function ribbonDay(m: OmerWidgetModel) {
  if (m.state === 'after') return 0;
  return m.state === 'before' ? 1 : m.n;
}

/** OmerWidgetDraw.field: three white masks, square b px; `tab` draws the still ribbon (no frames to play) */
export function drawField(m: OmerWidgetModel, b: number, tab: boolean): HTMLCanvasElement[] {
  const out = [0, 1, 2].map(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.max(16, Math.round(b));
    return cv;
  });
  const cv = out.map((x) => x.getContext('2d')!);
  const { c, g, o, r } = fieldGeometry(b);
  const hair = c * 0.075;
  const before = m.state === 'before';
  const fill = (k: number, a: number, x: number, y: number, rad: number) => {
    cv[k].globalAlpha = a;
    cv[k].fillStyle = '#fff';
    cv[k].beginPath();
    cv[k].arc(x, y, rad, 0, Math.PI * 2);
    cv[k].fill();
  };
  const stroke = (k: number, a: number, w: number, x: number, y: number, rad: number) => {
    cv[k].globalAlpha = a;
    cv[k].strokeStyle = '#fff';
    cv[k].lineWidth = w;
    cv[k].beginPath();
    cv[k].arc(x, y, rad, 0, Math.PI * 2);
    cv[k].stroke();
  };

  // the band behind the week of the day shown
  if (m.week > 0) {
    const top = o + (m.week - 1) * (c + g) - g / 2;
    cv[MUTED].globalAlpha = 0.11;
    cv[MUTED].fillStyle = '#fff';
    cv[MUTED].beginPath();
    cv[MUTED].roundRect(0, top, b, c + g, (c + g) / 2);
    cv[MUTED].fill();
  }

  for (let k = 1; k <= 49; k++) {
    const { x, y } = cellCenter(b, k, m.he);
    const cell = m.cells[k - 1];
    const lag = k === LAG_BAOMER;
    switch (cell) {
      case CELL.future:
        stroke(MUTED, before ? 0.34 : 0.42, hair, x, y, r - hair / 2);
        break;
      case CELL.missed:
        stroke(MUTED, 0.42, hair, x, y, r - hair / 2);
        fill(MUTED, 0.75, x, y, c * 0.12);
        break;
      case CELL.passed:
        fill(MUTED, 0.18, x, y, r);
        break;
      case CELL.assumed:
        fill(GREEN, 0.4, x, y, r);
        break;
      case CELL.counted:
        fill(GREEN, 1, x, y, r);
        break;
      // the day of now is marked by the ribbon alone: its cell is drawn as any other
      case CELL.today:
        stroke(MUTED, before ? 0.34 : 0.42, hair, x, y, r - hair / 2);
        break;
      case CELL.todayCounted:
        fill(GREEN, 1, x, y, r);
        break;
    }
    // Lag BaOmer, quietly: a small saffron dot in its cell (not under the ribbon)
    if (lag && cell !== CELL.today && cell !== CELL.todayCounted) fill(RIBBON, before ? 0.7 : 1, x, y, c * 0.13);
  }

  const day = ribbonDay(m);
  if (tab && day > 0) {
    // the ribbon at rest on the day, as the frames' first one: hanging from just above the cell's top
    const { x, y } = cellCenter(b, day, m.he);
    const w = c * 0.5;
    const top = y - r - c * 0.06;
    const len = c * 0.92;
    const k = cv[RIBBON];
    k.globalAlpha = 1;
    k.fillStyle = '#fff';
    k.beginPath();
    k.moveTo(x - w / 2, top);
    k.lineTo(x + w / 2, top);
    k.lineTo(x + w / 2, top + len);
    k.lineTo(x, top + len - w * 0.5);
    k.lineTo(x - w / 2, top + len);
    k.closePath();
    k.fill();
  }
  return out;
}

/** Where the ribbon's frames go (dp), for a field of side f dp: OmerWidgetProvider.placeRibbon */
export function ribbonBox(m: OmerWidgetModel, f: number) {
  const day = ribbonDay(m);
  if (!day) return null;
  const { c, r } = fieldGeometry(f);
  const { x, y } = cellCenter(f, day, m.he);
  // the frames are 22×22 with a 10×18 ribbon hanging from 2 down, centred: scaled so the ribbon is about a cell long
  const s = (c * 0.92) / 18;
  const box = 22 * s;
  return { left: x - box / 2, top: Math.max(0, y - r - c * 0.06 - 2 * s), size: box };
}

/* ---------------- the sky from dawn to the next count (OmerWidgetDraw.sky) ---------------- */

const NIGHT = 0x0b1230;
const DAWN = 0x2d2a63;
const SUNRISE = 0x5f6fa8;
const MORNING = 0x3d86cf;
const NOON = 0x2f7bcb;
const AFTERNOON = 0x4d84bf;
const SUNSET = 0x7a4b78;
const DUSK = 0x272558;

function mix(a: number, b: number, f: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** WidgetDraw.skyMid: the sky's middle colour at a moment (dawn, sunrise, sunset, dusk) */
export function skyMid(now: number, t: [number, number, number, number]) {
  const [dawn, rise, set, dusk] = t;
  const hr = 3600000;
  const at = [dawn - 0.5 * hr, dawn + (rise - dawn) * 0.45, rise, rise + 1.5 * hr, (rise + set) / 2, set - 1.6 * hr, set, set + (dusk - set) * 0.6, dusk + 0.6 * hr];
  const col = [NIGHT, DAWN, SUNRISE, MORNING, NOON, AFTERNOON, SUNSET, DUSK, NIGHT];
  let out = NIGHT;
  if (now > at[0] && now < at[at.length - 1]) {
    for (let i = 0; i < at.length - 1; i++) {
      if (now >= at[i] && now <= at[i + 1]) {
        out = mix(col[i], col[i + 1], (now - at[i]) / (at[i + 1] - at[i]));
        break;
      }
    }
  }
  return out;
}

/**
 * The day from dawn to the next count, in the sky's colours, in the reading direction (dawn at the start):
 * hairlines at sunrise and sunset, "now" as a saffron tick. 10 dp tall.
 */
export function drawSky(band: NonNullable<OmerWidgetModel['band']>, rtl: boolean, wPx: number, d: number, ribbon: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const w = Math.max(8, Math.round(wPx));
  const h = Math.max(4, Math.round(10 * d));
  cv.width = w;
  cv.height = h;
  const k = cv.getContext('2d')!;
  const span = band.to - band.from;
  const frac = (t: number) => Math.min(1, Math.max(0, (t - band.from) / span));
  const X = (f: number) => (rtl ? (1 - f) * w : f * w);
  const sk: [number, number, number, number] = [band.from, band.sunrise, band.sunset, band.to];
  const n = 32;
  const grad = k.createLinearGradient(X(0), 0, X(1), 0);
  for (let i = 0; i <= n; i++) {
    const c = skyMid(band.from + (i / n) * span, sk);
    grad.addColorStop(i / n, `#${c.toString(16).padStart(6, '0')}`);
  }
  const top = 2 * d;
  const bh = 6 * d;
  k.fillStyle = grad;
  k.beginPath();
  k.roundRect(0, top, w, bh, 3 * d);
  k.fill();
  k.fillStyle = 'rgba(255,255,255,0.55)';
  const hair = Math.max(1, d);
  for (const t of [band.sunrise, band.sunset]) {
    const x = X(frac(t));
    k.fillRect(x - hair / 2, top, hair, bh);
  }
  k.fillStyle = ribbon;
  const tick = 2 * d;
  const x = Math.min(w - tick / 2, Math.max(tick / 2, X(frac(band.now))));
  k.beginPath();
  k.roundRect(x - tick / 2, 0, tick, h, d);
  k.fill();
  return cv;
}

/** A tinted copy of a white mask */
export function tint(mask: HTMLCanvasElement, color: string) {
  const cv = document.createElement('canvas');
  cv.width = mask.width;
  cv.height = mask.height;
  const k = cv.getContext('2d')!;
  k.drawImage(mask, 0, 0);
  k.globalCompositeOperation = 'source-in';
  k.fillStyle = color;
  k.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
