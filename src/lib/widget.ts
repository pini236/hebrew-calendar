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
import { EMPTY_STATE, SEFIRA_WORDS, countedHow, firstEve, offlineDay, omerYear, tzeitOn, type OmerState } from './seasons/omer';

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
  /** Sefirat HaOmer, for the Omer widget: this year's count, or the next one (see omerWidgetModel) */
  om?: WidgetOmer;
}

/** The Omer widget's data: when each count begins, and what the user marked in the app */
export interface WidgetOmer {
  /** Hebrew year */
  y: number;
  /** nightfall that begins each day's count: t[k] begins day k+1; t[49] ends the 49th day (epoch ms) */
  t: number[];
  /** counted days as of the app's last push, bit k-1 for day k (0 when the user doesn't mark them here) */
  c: number;
  /** days on Shabbat or Yom Tov (the app can't be told about them), bit k-1 */
  f: number;
  /** the seven sefirot, and their "within" forms ("שבחסד") */
  sw: string[];
  sp: string[];
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

export function buildWidgetData(from: Date, days: number, city: City, s: Settings, omer?: OmerState): WidgetData {
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

  return { v: 1, city: city.name, tz: city.tz, generated: Date.now(), days: out, hol, om: widgetOmer(from, city, s, omer) };
}

/** The season the Omer widget shows: this year's until two weeks after Shavuot, then next year's */
export function widgetOmer(from: Date, city: City, s: Settings, state: OmerState = EMPTY_STATE): WidgetOmer {
  let y = new HDate(from).getFullYear();
  const end = (year: number) => omerYear(year).days[48];
  if (from.getTime() > addDays(end(y), 14).getTime()) y++;
  const t = [firstEve(y), ...omerYear(y).days].map((d) => tzeitOn(d, city, s).getTime());
  let c = 0;
  let f = 0;
  for (let k = 1; k <= 49; k++) {
    // 2^(k-1), not a bit shift: JavaScript shifts are 32-bit
    if (countedHow(state, y, k)) c += 2 ** (k - 1);
    if (offlineDay(y, k, city.il)) f += 2 ** (k - 1);
  }
  return { y, t, c, f, sw: SEFIRA_WORDS.he, sp: SEFIRA_WORDS.in };
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

/* ---------------- the Omer widget (mirrors OmerWidgetModel.java) ---------------- */

/** a cell of the 7×7 field */
export const CELL = { future: 0, counted: 1, missed: 2, passed: 3, today: 4, todayCounted: 5, assumed: 6 } as const;

export interface OmerWidgetModel {
  state: 'before' | 'count' | 'after';
  /** the day shown: 1–49 (49 after the count), 0 before it */
  n: number;
  /** "ל״ג" ('' before the count) */
  num: string;
  /** "הוד שבהוד", or "ספירת העומר" before it */
  sefira: string;
  /** "4 שבועות ו־5 ימים" · "תתחיל בעוד 12 ימים" · "ספרתם 47 מתוך 49" */
  sub: string;
  /** the 49 cells (CELL), day 1 first */
  cells: number[];
  /** the week of the day shown (1–7), 0 for none */
  week: number;
  /** when the widget has to redraw next (epoch ms) */
  wake: number;
}

const bit = (mask: number, k: number) => Math.floor(mask / 2 ** (k - 1)) % 2 === 1;

/** Gematria for 1–49, as the widget writes it ("ט״ו", "ל״ג", "ז׳") */
export function omerGem(n: number) {
  const tens = ['', 'י', 'כ', 'ל', 'מ'];
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  let s = tens[Math.floor(n / 10)] + ones[n % 10];
  if (n === 15) s = 'טו';
  if (n === 16) s = 'טז';
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

/** "4 שבועות ו־5 ימים" (the widget is Hebrew) */
export function omerWeeksHe(n: number) {
  const w = Math.floor(n / 7);
  const d = n % 7;
  const days = d === 1 ? 'יום אחד' : `${d} ימים`;
  if (w === 0) return days;
  const weeks = w === 1 ? 'שבוע אחד' : `${w} שבועות`;
  if (d === 0) return weeks;
  return d === 1 ? `${weeks} ויום אחד` : `${weeks} ו־${d} ימים`;
}

export function omerWidgetModel(data: WidgetData, now: Date): OmerWidgetModel | null {
  const om = data.om;
  if (!om || om.t.length !== 50) return null;
  const t = now.getTime();
  let n = 0;
  while (n < 49 && om.t[n] <= t) n++;
  const after = t >= om.t[49];
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  let wake = Math.min(t + 6 * HOUR, nextMidnight + 5000);
  for (const x of om.t) {
    if (x > t) {
      wake = Math.min(wake, x + 1000);
      break;
    }
  }

  let first = 0;
  let counted = 0;
  for (let k = 1; k <= 49; k++) {
    if (bit(om.c, k)) {
      counted++;
      if (!first) first = k;
    }
  }
  const cells: number[] = [];
  for (let k = 1; k <= 49; k++) {
    const c = bit(om.c, k);
    if (n === 0 || k > n) cells.push(n === 0 && k === 1 ? CELL.today : CELL.future);
    else if (k === n && !after) cells.push(c ? CELL.todayCounted : CELL.today);
    else if (c) cells.push(CELL.counted);
    else if (first === 0 || k < first) cells.push(CELL.passed);
    else cells.push(bit(om.f, k) ? CELL.assumed : CELL.missed);
  }

  if (n === 0) {
    // days from today to the evening the count begins
    const e = new Date(om.t[0]);
    const days = Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime() - midnight) / 86400000);
    const sub = days <= 0 ? 'מתחילה הלילה' : days === 1 ? 'מתחילה מחר בערב' : `תתחיל בעוד ${days} ימים`;
    return { state: 'before', n: 0, num: '', sefira: 'ספירת העומר', sub, cells, week: 0, wake };
  }
  const sefira = `${om.sw[(n - 1) % 7]} ${om.sp[Math.floor((n - 1) / 7)]}`;
  if (after) {
    const sub = first ? `ספרתם ${counted} מתוך 49` : 'הספירה הושלמה';
    return { state: 'after', n: 49, num: omerGem(49), sefira, sub, cells, week: 0, wake };
  }
  return { state: 'count', n, num: omerGem(n), sefira, sub: omerWeeksHe(n), cells, week: Math.floor((n - 1) / 7) + 1, wake };
}
