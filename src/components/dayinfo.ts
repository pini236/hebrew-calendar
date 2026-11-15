/** Small view helpers shared by the tabs (no calendar maths here: that all lives in src/lib) */
import { WEEKDAYS, addDays, dateKey, daysBetween, eventsOn, rangeItems, roundTo, type DayItem, type ZmanRow } from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, locale, plural, tr } from '../lib/i18n';
import { skyAt } from '../lib/sky';
import type { MyEvent, Settings } from '../lib/store';

/** "5:41 שע׳" / "5:41 h", "15 דק׳" / "15 min" */
export function countdown(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60 * 24) {
    const d = Math.round(m / 60 / 24);
    return tr(`${d} ימים`, `${d} ${plural(d, 'day', 'days')}`);
  }
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ${tr('שע׳', 'h')}`;
  if (m >= 10) return `${m} ${tr('דק׳', 'min')}`;
  return `${m}:${String(s).padStart(2, '0')} ${tr('דק׳', 'min')}`;
}

/** "יום שני" / "Monday" */
export function dayName(d: Date) {
  return tr(`יום ${WEEKDAYS[d.getDay()]}`, WEEKDAYS[d.getDay()]);
}

/** Plural years after an event's name: "3 שנים" / "3 years" */
export function yearsWord(n: number) {
  return tr(`${n} שנים`, `${n} ${plural(n, 'year', 'years')}`);
}

/** "בעוד 5:41 שע׳" / "in 5:41 h" */
export function inTime(ms: number) {
  return tr(`בעוד ${countdown(ms)}`, `in ${countdown(ms)}`);
}

export function relWords(n: number) {
  if (n === 0) return tr('היום', 'today');
  if (n === 1) return tr('מחר', 'tomorrow');
  if (n === -1) return tr('אתמול', 'yesterday');
  if (isHe()) {
    if (n === 2) return 'מחרתיים';
    return n > 0 ? `בעוד ${n.toLocaleString('he-IL')} ימים` : `לפני ${(-n).toLocaleString('he-IL')} ימים`;
  }
  const a = Math.abs(n).toLocaleString(locale());
  return n > 0 ? `in ${a} days` : `${a} days ago`;
}

export interface ShabbatInfo {
  candle: { d: Date; it: DayItem };
  havdalah: { d: Date; it: DayItem };
  /** Hebrew title (display it with itemTitle(info)) */
  title: string;
  /** English title */
  en: string;
  isShabbat: boolean;
  isChag: boolean;
}

/** The coming Shabbat or Yom Tov (on Shabbat itself, the current one) */
export function nextShabbat(date: Date, city: City, settings: Settings): ShabbatInfo | null {
  const from = date.getDay() === 6 ? addDays(date, -1) : date;
  const map = rangeItems(from, addDays(from, 9), city, settings, false);
  let candle: ShabbatInfo['candle'] | null = null;
  let havdalah: ShabbatInfo['havdalah'] | null = null;
  let title = '';
  let en = '';
  let isShabbat = false;
  let isChag = false;
  for (let i = 0; i <= 9 && !havdalah; i++) {
    const d = addDays(from, i);
    for (const it of map.get(dateKey(d)) ?? []) {
      if (it.kind === 'candles' && !candle) candle = { d, it };
      if (!candle) continue;
      if (it.kind === 'havdalah' && !havdalah) havdalah = { d, it };
      if (it.kind === 'yomtov' && !title) {
        title = it.title;
        en = it.en ?? it.title;
        isChag = true;
      }
      if (it.kind === 'parasha') {
        isShabbat = true;
        if (!title) {
          title = it.title;
          en = it.en ?? it.title;
        }
      }
    }
  }
  if (!candle || !havdalah || !candle.it.time || !havdalah.it.time) return null;
  return { candle, havdalah, title: title || 'שבת', en: en || 'Shabbat', isShabbat, isChag };
}

/**
 * The parasha read on the Shabbat of the week that holds `date` (or the holiday read instead),
 * in both languages: display it with itemTitle()
 */
export function weekParasha(date: Date, city: City, settings: Settings): { title: string; en: string } | null {
  const sat = addDays(date, 6 - date.getDay());
  const its = rangeItems(sat, sat, city, settings, false).get(dateKey(sat)) ?? [];
  const p = its.find((i) => i.kind === 'parasha');
  if (p) return { title: p.title, en: p.en ?? p.title };
  const y = its.find((i) => i.kind === 'yomtov' || i.kind === 'cholhamoed');
  return y ? { title: `שבת ${y.title}`, en: `Shabbat ${y.en ?? y.title}` } : null;
}

/**
 * The day as one strip of sky colours, midnight to midnight (right to left).
 * Samples the same sky the old hero card used, keyed to the real sun times of the place.
 */
export function dayRibbon(date: Date, t: { dawn: Date; sunrise: Date; sunset: Date; dusk: Date }) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0).getTime();
  const stops: string[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const at = start + (i / N) * 86400000;
    const m = skyAt(at, t).background.match(/rgb\([^)]+\)/g);
    // the middle band of the sky is the truest single colour for that hour
    stops.push(`${m?.[1] ?? m?.[0] ?? 'rgb(0,0,0)'} ${((i / N) * 100).toFixed(1)}%`);
  }
  // the morning is on the right in Hebrew (RTL), on the left in English
  return `linear-gradient(to ${isHe() ? 'left' : 'right'}, ${stops.join(', ')})`;
}

/** Fraction of the local day (0 = midnight) */
export const dayFrac = (d: Date) => (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;

export interface AgendaRow {
  key: string;
  time: Date;
  name: string;
  hint?: string;
  kind: 'zman' | 'candles' | 'havdalah' | 'fast' | 'mine';
  color?: string;
  zmanId?: string;
}

/** Zmanim, candle lighting, havdalah, fasts and my timed events of one day, in time order */
export function agendaRows(rows: ZmanRow[], items: DayItem[], mine: { ev: MyEvent; years: number }[], date: Date, show: (r: ZmanRow) => boolean, candleMins: number) {
  const out: AgendaRow[] = [];
  for (const r of rows) if (show(r)) out.push({ key: r.id, time: roundTo(r.time, r.round), name: r.name, hint: r.hint, kind: 'zman', zmanId: r.id });
  for (const it of items) {
    if (!it.time) continue;
    if (it.kind === 'candles') out.push({ key: 'candles', time: it.time, name: tr('הדלקת נרות', 'Candle lighting'), hint: candleMins ? tr(`${candleMins} דק׳ לפני השקיעה`, `${candleMins} min before sunset`) : undefined, kind: 'candles' });
    if (it.kind === 'havdalah') out.push({ key: 'havdalah', time: it.time, name: tr('צאת השבת / החג', 'Shabbat / Yom Tov ends'), hint: tr('הבדלה', 'Havdalah'), kind: 'havdalah' });
    if (it.kind === 'fast-start') out.push({ key: 'fs', time: it.time, name: tr('תחילת הצום', 'Fast begins'), kind: 'fast' });
    if (it.kind === 'fast-end') out.push({ key: 'fe', time: it.time, name: tr('סיום הצום', 'Fast ends'), kind: 'fast' });
  }
  for (const m of mine) {
    if (!m.ev.time) continue;
    const [h, mi] = m.ev.time.split(':').map(Number);
    out.push({ key: 'ev' + m.ev.id, time: new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi), name: m.ev.title, hint: m.ev.note, kind: 'mine', color: m.ev.color });
  }
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

export interface Upcoming {
  ev: MyEvent;
  d: Date;
  years: number;
  inDays: number;
}

/** Each event's next occurrence from `from` (within `days`), soonest first; one-time events that passed come back in `past` */
export function upcomingEvents(list: MyEvent[], from: Date, days = 400) {
  const next = new Map<string, Upcoming>();
  for (let i = 0; i <= days && next.size < list.length; i++) {
    const d = addDays(from, i);
    for (const m of eventsOn(list, d)) if (!next.has(m.ev.id)) next.set(m.ev.id, { ev: m.ev, d, years: m.years, inDays: i });
  }
  const upcoming = [...next.values()].sort((a, b) => a.inDays - b.inDays);
  const past = list.filter((e) => !next.has(e.id)).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}

export { daysBetween };
