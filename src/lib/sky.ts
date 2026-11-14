/** Sky colours keyed to the real sun times of the selected place */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

interface Stop {
  top: RGB;
  mid: RGB;
  bottom: RGB;
}
const S = (t: string, m: string, b: string): Stop => ({ top: hex(t), mid: hex(m), bottom: hex(b) });

const NIGHT = S('#050817', '#0b1230', '#18204a');
const DAWN = S('#101640', '#2d2a63', '#7a4f7e');
const SUNRISE = S('#27407f', '#5f6fa8', '#e98f63');
const MORNING = S('#1f5fb3', '#3d86cf', '#7fb9e2');
const NOON = S('#1653a8', '#2f7bcb', '#6eb0e3');
const AFTERNOON = S('#22589f', '#4d84bf', '#d9a76f');
const SUNSET = S('#2b2d68', '#7a4b78', '#ec7a52');
const DUSK = S('#0d1336', '#272558', '#4f3466');

export interface SkyState {
  background: string;
  night: boolean;
  /** 0..1 position of the sun between sunrise and sunset; null at night */
  sun: number | null;
  phase: 'night' | 'dawn' | 'day' | 'dusk';
}

export function skyAt(now: number, t: { dawn: Date; sunrise: Date; sunset: Date; dusk: Date }): SkyState {
  const dawn = t.dawn.getTime();
  const rise = t.sunrise.getTime();
  const set = t.sunset.getTime();
  const dusk = t.dusk.getTime();
  const H = 3600000;
  const keys: [number, Stop][] = [
    [dawn - 0.5 * H, NIGHT],
    [dawn + (rise - dawn) * 0.45, DAWN],
    [rise, SUNRISE],
    [rise + 1.5 * H, MORNING],
    [(rise + set) / 2, NOON],
    [set - 1.6 * H, AFTERNOON],
    [set, SUNSET],
    [set + (dusk - set) * 0.6, DUSK],
    [dusk + 0.6 * H, NIGHT],
  ];
  let stop: Stop = NIGHT;
  if (now > keys[0][0] && now < keys[keys.length - 1][0]) {
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, s0] = keys[i];
      const [t1, s1] = keys[i + 1];
      if (now >= t0 && now <= t1) {
        const f = (now - t0) / (t1 - t0);
        stop = { top: mix(s0.top, s1.top, f), mid: mix(s0.mid, s1.mid, f), bottom: mix(s0.bottom, s1.bottom, f) };
        break;
      }
    }
  }
  const phase = now < dawn || now > dusk ? 'night' : now < rise ? 'dawn' : now <= set ? 'day' : 'dusk';
  return {
    background: `linear-gradient(180deg, ${css(stop.top)} 0%, ${css(stop.mid)} 55%, ${css(stop.bottom)} 100%)`,
    night: phase === 'night' || phase === 'dusk' || (phase === 'dawn' && now < (dawn + rise) / 2),
    sun: phase === 'day' ? (now - rise) / (set - rise) : null,
    phase,
  };
}
