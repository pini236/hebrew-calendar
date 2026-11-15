/**
 * The live sky at the top of היום: the real sky of the chosen place and day, drawn behind the date.
 *
 * Integration (not done yet; TodayTab is being translated by others):
 *   In TodayTab, replace <header className="tab-head">…</header> with
 *
 *     <SkyScene selected={selected} now={now} city={city} settings={settings} z={z} items={items}>
 *       <SkyHeader selected={selected} city={city} onJump={p.onJump} onLocation={p.onLocation} />
 *     </SkyScene>
 *     <div className="sky-sheet"> …the "tonight" line, WeekStrip, today-grid… </div>
 *
 *   and render it outside the .tab padding (full bleed on the phone; on wide screens it becomes a
 *   rounded card, see sky.css). The status bar strip (body::before in styles.css) paints page colour
 *   over the top inset: for the sky to run under the clock it needs to be hidden while היום is open.
 *   Every prop is something TodayTab already has; nothing new is computed in App.
 *
 * Real data: sky colours from skyAt() (the day ribbon's colours), the sun's place along the day from
 * KosherJava's sunrise and sunset, its height and the twilight from KosherJava's solar elevation,
 * the moon's phase from the Hebrew date (moonPhase), Shabbat candles from Hebcal's candle lighting to
 * havdalah (nextShabbat), and a season's touch from the seasons engine (skyDecor: the Chanukah lights).
 * For a day other than today the scene shows that day at the current time of day.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as KZ from 'kosher-zmanim';
import * as SunCalc from 'suncalc';
import { HDate, addDays, dateKey, daysBetween, fromKey, gregDateStr, hebDateStr, hebMonthName, hebNum, hebYear, sameDay, zmanim, type DayItem } from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, tr } from '../lib/i18n';
import { skyAt } from '../lib/sky';
import { skyDecor } from '../lib/seasons';
import '../lib/seasons/all';
import type { Settings } from '../lib/store';
import { dayName, nextShabbat } from './dayinfo';
import { Icon } from './Icon';
import { SkyPainter, type SkyInput } from './skyPaint';
import './sky.css';

type Z = ReturnType<typeof zmanim>;
type RGB = [number, number, number];

export interface SkySceneProps {
  /** the selected day (TodayTab's `selected`) */
  selected: Date;
  /** the live clock */
  now: Date;
  city: City;
  settings: Settings;
  /** zmanim(selected, city, settings), as App already computes it */
  z: Z;
  /** the selected day's items (reserved: today the Shabbat window comes from nextShabbat) */
  items?: DayItem[];
  /** draw this exact moment instead (the demo's time scrubber) */
  at?: Date;
  /** the date header that sits over the sky */
  children?: ReactNode;
  className?: string;
}

/* ---------------- time in the place's own clock ---------------- */

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function wallParts(tz: string, ms: number) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    partsFmt.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(ms)) if (p.type !== 'literal') o[p.type] = +p.value;
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
/** The instant that reads y-m-d, `secs` past midnight on the clocks of `tz` */
export function wallTime(tz: string, y: number, m: number, d: number, secs: number) {
  const guess = Date.UTC(y, m, d) + secs * 1000;
  const off = (ms: number) => {
    const p = wallParts(tz, ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  let t = guess - off(guess);
  const o2 = off(t);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}
/** Seconds past midnight on the clocks of `tz` */
export function wallSecs(tz: string, ms: number) {
  const p = wallParts(tz, ms);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

/** The moment the scene shows: now on today; on another day, the same time of day there */
export function sceneMoment(selected: Date, now: Date, tz: string) {
  if (sameDay(selected, now)) return now.getTime();
  return wallTime(tz, selected.getFullYear(), selected.getMonth(), selected.getDate(), wallSecs(tz, now.getTime()));
}

const rgbOf = (css: string): RGB[] => (css.match(/rgb\((\d+),(\d+),(\d+)\)/g) ?? []).map((m) => m.slice(4, -1).split(',').map(Number) as RGB);

/** KosherJava's solar elevation (NOAA) at an instant, in degrees */
function solarElevation(ms: number, city: City) {
  return KZ.NOAACalculator.getSolarElevation(KZ.DateTime.fromMillis(ms, { zone: 'UTC' }), city.lat, city.lon);
}

/** A stable 0..1 from a date: how many (made-up) high clouds that day has */
function cloudsOf(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  return r < 0.25 ? 0.15 : r;
}

/** Candle lighting → havdalah windows around the day (Shabbat and Yom Tov), from Hebcal */
function candleWindows(selected: Date, city: City, settings: Settings) {
  const out: [number, number][] = [];
  for (const d of [addDays(selected, -1), selected]) {
    const s = nextShabbat(d, city, settings);
    if (s?.candle.it.time && s.havdalah.it.time) out.push([s.candle.it.time.getTime(), s.havdalah.it.time.getTime()]);
  }
  return out;
}

export function SkyScene({ selected, now, city, settings, z, at, children, className }: SkySceneProps) {
  const host = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof startEngine> | null>(null);
  const key = dateKey(selected);
  const rtl = isHe();

  // live: repaint the layers once a minute (the sun moves a quarter of a degree); the clouds move every frame
  const moment = at ? at.getTime() : Math.floor(sceneMoment(selected, now, city.tz) / 60000) * 60000;
  const windows = useMemo(() => candleWindows(selected, city, settings), [key, city, settings.candleMins, settings.havdalah]); // eslint-disable-line react-hooks/exhaustive-deps
  // a season's own state changed (e.g. "הדלקתי" on the Chanukah card): ask the engine again
  const [seasonTick, setSeasonTick] = useState(0);
  useEffect(() => {
    const on = () => setSeasonTick((n) => n + 1);
    window.addEventListener('luachi:season-state', on);
    return () => window.removeEventListener('luachi:season-state', on);
  }, []);

  const input = useMemo<SkyInput>(() => {
    const sky = rgbOf(skyAt(moment, z).background) as [RGB, RGB, RGB];
    const rise = z.sunrise.getTime();
    const set = z.sunset.getTime();
    // the moon's real place and phase at this moment (SunCalc, after Meeus' Astronomical Algorithms)
    const mpos = SunCalc.getMoonPosition(new Date(moment), city.lat, city.lon);
    const mill = SunCalc.getMoonIllumination(new Date(moment));
    const chatzot = z.rows.find((r) => r.id === 'chatzot')?.time.getTime() ?? (rise + set) / 2;
    const late = moment < chatzot ? 1 : Math.max(0, Math.min(1, (moment - (chatzot + 12 * 3600000)) / (40 * 60000)));
    return {
      at: moment,
      rise,
      set,
      elev: solarElevation(moment, city),
      sky,
      moonIllum: mill.fraction,
      moonWaxing: mill.phase < 0.5,
      // SunCalc 2 gives degrees, azimuth clockwise from north; the painter wants it from south, west positive
      moonAlt: mpos.altitude,
      moonAz: mpos.azimuth - 180,
      candles: windows.some(([a, b]) => moment >= a && moment < b),
      // the seasons' touch (Chanukah: tonight's candles), from the seasons engine
      chanukah: skyDecor(new Date(moment), city, settings).chanukahCandles ?? 0,
      late,
      clouds: cloudsOf(key),
      rtl,
    };
  }, [moment, z, city, key, windows, rtl, settings.seasons, seasonTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    engine.current = startEngine(canvas.current!, host.current!);
    return () => engine.current?.stop();
  }, []);

  // what changed since the last moment: the time only, the day (the land sways toward it) or the place (crossfade)
  const last = useRef<{ key: string; city: string } | null>(null);
  useEffect(() => {
    const prev = last.current;
    let change: 'same' | 'next' | 'prev' | 'swap' = 'same';
    if (prev && prev.city !== city.id + city.lat + city.lon) change = 'swap';
    else if (prev && prev.key !== key) {
      const d = daysBetween(fromKey(prev.key), selected);
      change = d > 0 ? 'next' : d < 0 ? 'prev' : 'swap';
    }
    last.current = { key, city: city.id + city.lat + city.lon };
    engine.current?.set(input, change);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={host} className={`sky ${className ?? ''}`}>
      <canvas ref={canvas} className="sky-canvas" aria-hidden="true" />
      <div className="sky-over">{children}</div>
    </section>
  );
}

/* ---------------- the loop: 20fps at rest, 30 while the day changes, only while seen ---------------- */

function startEngine(canvas: HTMLCanvasElement, host: HTMLElement) {
  const painter = new SkyPainter(canvas);
  const reducedMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!reducedMq?.matches;
  let inView = true;
  let raf = 0;
  let last = 0;
  let size = '';

  const measure = () => {
    const r = host.getBoundingClientRect();
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    // CSS zoom on a parent: draw at the zoomed resolution
    const zoom = r.width / w;
    // the ground rises to hold whatever sits on it (the date block grows with the text-size setting)
    const g = host.querySelector<HTMLElement>('[data-sky-ground]');
    const ground = g ? Math.round((r.bottom - g.getBoundingClientRect().top) / zoom + 10) : 80;
    const foot = parseFloat(getComputedStyle(host).getPropertyValue('--sky-sheet')) || 0;
    // 2x is plenty for soft gradients; 3x phones would only triple the pixels to fill
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * zoom);
    const k = `${w}x${h}@${dpr}/${ground}/${foot}`;
    if (k === size) return;
    size = k;
    painter.resize(w, h, dpr, ground, foot);
    paintOnce();
  };

  const running = () => !reduced && inView && !document.hidden;
  const tick = (t: number) => {
    raf = 0;
    if (!running()) return;
    // 30fps while the day slides; 20fps at rest, where the clouds move a fraction of a pixel per frame
    // and the flames sway slowly: more frames would only cost battery
    const fps = painter.transitioning ? 30 : 20;
    if (t - last >= 1000 / fps - 4) {
      last = t;
      painter.frame(t);
    }
    raf = requestAnimationFrame(tick);
  };
  const go = () => {
    if (!raf && running()) raf = requestAnimationFrame(tick);
  };
  const paintOnce = () => {
    if (running()) go();
    else painter.frame(performance.now(), true);
  };

  const ro = new ResizeObserver(measure);
  ro.observe(host);
  const groundEl = host.querySelector('[data-sky-ground]');
  if (groundEl) ro.observe(groundEl);
  const io = new IntersectionObserver((es) => {
    inView = es[es.length - 1].isIntersecting;
    go();
  });
  io.observe(host);
  const onVis = () => go();
  document.addEventListener('visibilitychange', onVis);
  const onMq = () => {
    reduced = !!reducedMq?.matches;
    paintOnce();
  };
  reducedMq?.addEventListener?.('change', onMq);
  measure();

  // the demo and the measurements read these
  (window as unknown as { __sky?: SkyPainter }).__sky = painter;

  return {
    set(s: SkyInput, change: 'same' | 'next' | 'prev' | 'swap') {
      painter.set(s, change, performance.now(), running());
      paintOnce();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reducedMq?.removeEventListener?.('change', onMq);
    },
  };
}

/* ---------------- the date over the sky ---------------- */

export function SkyHeader({ selected, city, onJump, onLocation }: { selected: Date; city: City; onJump?: () => void; onLocation?: () => void }) {
  const hd = new HDate(selected);
  return (
    <>
      <div className="sky-top">
        <button className="sky-place" onClick={onLocation} aria-label={tr(`מיקום: ${city.name}. שינוי מיקום`, `Location: ${city.name}. Change location`)}>
          <Icon name={city.id === 'gps' ? 'locate' : 'pin'} size={16} />
          <span>{city.name}</span>
        </button>
        {onJump && (
          <button className="sky-chip" onClick={onJump}>
            <Icon name="today" size={16} />
            <span>{tr('תאריך אחר', 'Other date')}</span>
          </button>
        )}
      </div>
      <button className="sky-date" data-sky-ground onClick={onJump} aria-label={tr(`${hebDateStr(hd)}. מעבר לתאריך אחר`, `${hebDateStr(hd)}. Go to another date`)}>
        <span className="sky-greg" key={'g' + dateKey(selected)}>
          {dayName(selected)} · {gregDateStr(selected)}
        </span>
        <span className="sky-heb" key={'h' + dateKey(selected)}>
          {hebNum(hd.getDate())} {hebMonthName(hd.getMonth(), hd.getFullYear())}
          <span className="sky-year"> {hebYear(hd.getFullYear())}</span>
          <Icon name="down" size={18} />
        </span>
      </button>
    </>
  );
}
