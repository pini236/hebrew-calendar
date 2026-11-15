/**
 * Data for the home-screen widget.
 *
 * The widget is native code and cannot run the zmanim libraries, so the app computes
 * everything ahead of time (about two months) and hands it over as JSON. The widget then
 * only picks the right day, switches the Hebrew date at sunset and finds the next zman.
 * Pure function, unit-tested in scripts/test-widget.ts.
 *
 * `widgetModel` is what the widget shows at a given moment. It mirrors the native code
 * (android/.../LuachWidgetProvider.java, WidgetModel.java) line for line, so the tests and
 * the design previews (scripts/widget-preview.ts) check the same decisions the phone makes.
 */
import { HDate } from '@hebcal/core';
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, dateKey, gregDateStr, hebDateStr, rangeItems, roundTo, shortTitle, timeFmt, zmanim, type Kind } from './cal';
import type { City } from './cities';
import { shabbatAlerts } from './ics';
import type { Settings } from './store';

export interface WidgetZman {
  /** label, e.g. "סוף זמן ק״ש" */
  n: string;
  /** epoch ms */
  t: number;
  /** formatted "08:44" in the place's time zone */
  s: string;
}

export interface WidgetDay {
  /** yyyy-mm-dd (local calendar day of the place) */
  d: string;
  /** Hebrew date for the daytime, e.g. "י׳ כסלו תשפ״ז" */
  h: string;
  /** Hebrew date after sunset (the next Hebrew day) */
  he: string;
  /** "יום שישי · 20 בנובמבר" */
  g: string;
  /** sunset, epoch ms */
  ss: number;
  /** day label: holiday / parasha / erev shabbat ("" when none) */
  l: string;
  /** 1 when the label is a yom tov (shown in the luach's red) */
  y?: 1;
  /** after sunset: "אור ליום שני" / "אור לשבת" */
  o: string;
  /** the sky of the day, epoch ms: dawn (alot), sunrise, sunset, dusk (tzeit) */
  sk: [number, number, number, number];
  /** upcoming zmanim of the day, in order */
  z: WidgetZman[];
  /** coming Shabbat or Yom Tov line ("" when more than a week away) — kept for older widget code */
  sh: string;
}

/** A Shabbat or Yom Tov: from candle lighting to havdalah (several days when they run together) */
export interface WidgetHoly {
  /** "שבת פרשת ויצא", "ראש השנה" … */
  n: string;
  /** candle lighting, epoch ms and "16:18" */
  c: number;
  cs: string;
  /** havdalah, epoch ms and "17:17" */
  h: number;
  hs: string;
  /** weekday of havdalah ("ש׳") when it is not the night after the candles */
  hw?: string;
}

export interface WidgetData {
  v: 1;
  city: string;
  tz: string;
  generated: number;
  days: WidgetDay[];
  /** Shabbatot and Yamim Tovim in the range, in order */
  hol: WidgetHoly[];
}

const LABEL_KINDS: Kind[] = ['yomtov', 'cholhamoed', 'fast', 'erev', 'minor', 'roshchodesh', 'special-shabbat', 'parasha', 'modern'];

/** the zmanim the widget counts down to (a short, practical list) */
const WIDGET_ZMANIM: Record<string, string> = {
  alot: 'עלות השחר',
  sunrise: 'הנץ החמה',
  shma: 'סוף זמן ק״ש',
  tfilla: 'סוף זמן תפילה',
  chatzot: 'חצות היום',
  minchaG: 'מנחה גדולה',
  plag: 'פלג המנחה',
  sunset: 'שקיעה',
  tzeit: 'צאת הכוכבים',
};

const MIN = 60000;

export function buildWidgetData(from: Date, days: number, city: City, s: Settings): WidgetData {
  const fmt = timeFmt(city.tz);
  const end = addDays(from, days);
  // a few days on both sides, so a Shabbat or Yom Tov that runs over the edges is whole
  const items = rangeItems(addDays(from, -3), addDays(end, 10), city, s, false);
  const shabbats = shabbatAlerts(addDays(from, -1), Math.ceil(days / 7) + 2, city, s);
  const out: WidgetDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const hd = new HDate(d);
    const z = zmanim(d, city, s);
    const its = items.get(dateKey(d)) ?? [];

    // most important label of the day
    let label = '';
    let yomtov = false;
    for (const k of LABEL_KINDS) {
      const it = its.find((x) => x.kind === k);
      if (it) {
        label = shortTitle(it.title);
        yomtov = k === 'yomtov';
        break;
      }
    }
    if (!label && d.getDay() === 5) label = 'ערב שבת קודש';

    const zl: WidgetZman[] = [];
    for (const r of z.rows) {
      const name = WIDGET_ZMANIM[r.id];
      if (!name) continue;
      const t = roundTo(r.time, r.round);
      zl.push({ n: name, t: t.getTime(), s: fmt.format(t) });
    }
    // candle lighting / havdalah / fasts of this day go into the countdown too
    for (const it of its) {
      if (!it.time) continue;
      const n = it.kind === 'candles' ? 'הדלקת נרות' : it.kind === 'havdalah' ? 'צאת השבת' : it.kind === 'fast-start' ? 'תחילת הצום' : it.kind === 'fast-end' ? 'סיום הצום' : '';
      if (n) zl.push({ n, t: it.time.getTime(), s: fmt.format(it.time) });
    }
    // on a havdalah night "צאת השבת" takes the place of a "צאת הכוכבים" in the same minutes
    const hv = zl.find((x) => x.n === 'צאת השבת');
    if (hv) {
      const k = zl.findIndex((x) => x.n === WIDGET_ZMANIM.tzeit && Math.abs(x.t - hv.t) <= 3 * MIN);
      if (k >= 0) zl.splice(k, 1);
    }
    zl.sort((a, b) => a.t - b.t);

    // the next Shabbat whose havdalah is still ahead of this day
    let sh = '';
    const next = shabbats.find((a) => addDays(a.havdalahDay, 1).getTime() > d.getTime());
    if (next) {
      const away = Math.round((next.friday.getTime() - d.getTime()) / 86400000);
      if (away <= 6) sh = `${next.title} · ${fmt.format(next.candles)}–${fmt.format(next.havdalah)}`;
    }

    const tomorrow = addDays(d, 1).getDay();
    const minute = (x: Date) => roundTo(x, 'round').getTime();
    const day: WidgetDay = {
      d: dateKey(d),
      h: hebDateStr(hd),
      he: hebDateStr(new HDate(addDays(d, 1))),
      g: `יום ${WEEKDAYS[d.getDay()]} · ${gregDateStr(d, false)}`,
      ss: roundTo(z.sunset, 'floor').getTime(),
      l: label,
      o: tomorrow === 6 ? 'אור לשבת' : `אור ליום ${WEEKDAYS[tomorrow]}`,
      sk: [minute(z.dawn), minute(z.sunrise), minute(z.sunset), minute(z.dusk)],
      z: zl,
      sh,
    };
    if (yomtov) day.y = 1;
    out.push(day);
  }

  // Shabbatot and Yamim Tovim: candle lighting opens one, the next havdalah closes it
  const hol: WidgetHoly[] = [];
  let open: { c: Date; day: Date } | null = null;
  for (let i = -3; i < days + 10; i++) {
    const d = addDays(from, i);
    const its = items.get(dateKey(d)) ?? [];
    const hv = its.find((x) => x.kind === 'havdalah' && x.time)?.time;
    const cn = its.find((x) => x.kind === 'candles' && x.time)?.time;
    if (open && hv) {
      const first = items.get(dateKey(addDays(open.day, 1))) ?? [];
      const name =
        first.find((x) => x.kind === 'yomtov')?.title ??
        first.find((x) => x.kind === 'cholhamoed')?.title ??
        first.find((x) => x.kind === 'parasha')?.title ??
        'שבת';
      const nights = Math.round((d.getTime() - open.day.getTime()) / 86400000);
      const w: WidgetHoly = { n: name.startsWith('פרשת') ? `שבת ${name}` : name, c: open.c.getTime(), cs: fmt.format(open.c), h: hv.getTime(), hs: fmt.format(hv) };
      if (nights > 1) w.hw = WEEKDAYS_SHORT[d.getDay()];
      if (hv.getTime() > from.getTime() - 86400000 && open.c.getTime() < end.getTime()) hol.push(w);
      open = null;
    }
    if (!open && cn && (!hv || cn.getTime() > hv.getTime())) open = { c: cn, day: d };
  }

  return { v: 1, city: city.name, tz: city.tz, generated: Date.now(), days: out, hol };
}

/** What the widget shows at `now` — mirrors the native logic, used by the tests and the in-app preview */
export function widgetView(data: WidgetData, now: Date) {
  const key = dateKey(now);
  const i = data.days.findIndex((x) => x.d === key);
  if (i < 0) return null;
  const day = data.days[i];
  const afterSunset = now.getTime() >= day.ss;
  const upcoming = [...day.z, ...(data.days[i + 1]?.z ?? [])].find((x) => x.t > now.getTime()) ?? null;
  return { hebrew: afterSunset ? day.he : day.h, eve: afterSunset, greg: day.g, label: day.l, next: upcoming, shabbat: day.sh };
}

/* ---------------- the redesigned widget (mirrors WidgetModel.java) ---------------- */

export type SlotState = 'past' | 'next' | 'future';

export interface WidgetModel {
  /** the Hebrew date in two parts: "ה׳ כסלו" and "תשפ״ז" */
  dayMonth: string;
  year: string;
  eve: boolean;
  /** "יום ראשון · 15 בנובמבר" */
  greg: string;
  /** the quiet slot opposite the Gregorian date: the day's label, the city, or "אור ליום שני" */
  side: string;
  sideKind: 'label' | 'chag' | 'city' | 'night';
  city: string;
  next: { name: string; time: string; at: number } | null;
  holy: { name: string; candles: string; havdalah: string; candlesToday: boolean; inside: boolean } | null;
  /** today's zmanim (tomorrow's once the last one passed) for the tall widget */
  list: { tomorrow: boolean; items: { name: string; time: string; state: SlotState }[] };
  /** fractions of the local day (0 = midnight) for the sky band */
  sky: { dawn: number; sunrise: number; sunset: number; dusk: number; now: number };
  /** when the widget has to redraw next (epoch ms) */
  wake: number;
}

export const LIST_SLOTS = 10;
const HOUR = 3600000;

/** Fraction of the local day of the device (0 = midnight) */
function frac(t: number, midnight: number) {
  return Math.min(1, Math.max(0, (t - midnight) / (24 * HOUR)));
}

export function widgetModel(data: WidgetData, now: Date): WidgetModel | null {
  const key = dateKey(now);
  const i = data.days.findIndex((x) => x.d === key);
  if (i < 0) return null;
  const t = now.getTime();
  const day = data.days[i];
  const after = data.days[i + 1];
  const eve = t >= day.ss;
  const heb = eve ? day.he : day.h;
  const cut = heb.lastIndexOf(' ');

  // the coming Shabbat / Yom Tov (shown when its candles are within a week)
  const w = (data.hol ?? []).find((x) => x.h > t && x.c - t < 7 * 24 * HOUR) ?? null;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  let side = data.city;
  let sideKind: WidgetModel['sideKind'] = 'city';
  if (eve) {
    side = day.o;
    sideKind = 'night';
  } else if (day.l && !(w && w.n.includes(day.l))) {
    side = day.l;
    sideKind = day.y ? 'chag' : 'label';
  }

  const upcoming = [...day.z, ...(after?.z ?? [])].find((x) => x.t > t) ?? null;
  const todayLeft = day.z.some((x) => x.t > t);
  const src = todayLeft || !after ? day.z : after.z;
  const shown = src.slice(Math.max(0, src.length - LIST_SLOTS));
  const nextInList = shown.findIndex((x) => x.t > t);

  let wake = Math.min(t + 15 * 60000, nextMidnight + 5000);
  if (upcoming) wake = Math.min(wake, upcoming.t + 1000);
  if (!eve) wake = Math.min(wake, day.ss + 1000);
  if (w) wake = Math.min(wake, (w.c > t ? w.c : w.h) + 1000);

  return {
    dayMonth: cut > 0 ? heb.slice(0, cut) : heb,
    year: cut > 0 ? heb.slice(cut + 1) : '',
    eve,
    greg: day.g,
    side,
    sideKind,
    city: data.city,
    next: upcoming ? { name: upcoming.n, time: upcoming.s, at: upcoming.t } : null,
    holy: w
      ? {
          name: w.n,
          candles: w.cs,
          havdalah: w.hw ? `${w.hw} ${w.hs}` : w.hs,
          candlesToday: w.c > t && w.c < nextMidnight,
          inside: w.c <= t,
        }
      : null,
    list: { tomorrow: src !== day.z, items: shown.map((x, k) => ({ name: x.n, time: x.s, state: k === nextInList ? 'next' : x.t <= t ? 'past' : 'future' })) },
    sky: { dawn: frac(day.sk[0], midnight), sunrise: frac(day.sk[1], midnight), sunset: frac(day.sk[2], midnight), dusk: frac(day.sk[3], midnight), now: frac(t, midnight) },
    wake,
  };
}
