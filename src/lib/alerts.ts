/**
 * Which local notifications the native apps should have pending right now.
 *
 * Pure functions (no Capacitor), so the plan can be unit-tested: `npm test`.
 * The app calls planNotifications() on every open / resume and whenever the location,
 * the settings or the personal events change, and replaces the pending notifications with it.
 */
import { HDate } from '@hebcal/core';
import { WEEKDAYS_SHORT, addDays, dateKey, eventOccursOn, hebDateStr, rangeItems, roundTo, timeFmt, zmanim, type DayItem } from './cal';
import type { City } from './cities';
import { nativeAlerts, shabbatAlerts } from './ics';
import { REMIND_DEFAULT_TIME, type MyEvent, type Settings } from './store';

/** iOS keeps at most 64 pending local notifications per app (the rest are silently dropped) */
export const IOS_LIMIT = 64;

/** Zmanim a user can be notified about, in the order of the day. `label` is the notification wording. */
export const ZMAN_ALERTS: { id: string; label: string; hint?: string }[] = [
  { id: 'alot', label: 'עלות השחר' },
  { id: 'misheyakir', label: 'משיכיר', hint: 'טלית ותפילין' },
  { id: 'sunrise', label: 'הנץ החמה' },
  { id: 'shmaMGA', label: 'סוף זמן ק״ש (מג״א)' },
  { id: 'shma', label: 'סוף זמן ק״ש (גר״א)' },
  { id: 'tfillaMGA', label: 'סוף זמן תפילה (מג״א)' },
  { id: 'tfilla', label: 'סוף זמן תפילה (גר״א)' },
  { id: 'chatzot', label: 'חצות היום' },
  { id: 'minchaG', label: 'מנחה גדולה' },
  { id: 'minchaK', label: 'מנחה קטנה' },
  { id: 'plag', label: 'פלג המנחה' },
  { id: 'sunset', label: 'שקיעה' },
  { id: 'tzeit', label: 'צאת הכוכבים' },
  { id: 'tzeitRT', label: 'צאת הכוכבים (ר״ת)' },
  { id: 'chatzotNight', label: 'חצות הלילה' },
];
export const ZMAN_OFFSETS = [0, 5, 10, 15, 30];
export const CANDLE_OFFSETS = [10, 15, 20, 30, 45, 60];

/**
 * Each kind of notification has its own id range, so one kind can be cancelled or replaced
 * without touching the others. The Friday alerts keep the ids the app has always used (yyyymmdd).
 */
export type Group = 'friday' | 'zmanim' | 'holiday' | 'events';
export const GROUP_RANGES: Record<Group, readonly [number, number]> = {
  friday: [19_000_000, 30_000_000],
  zmanim: [100_000_000, 200_000_000],
  holiday: [200_000_000, 300_000_000],
  events: [300_000_000, 400_000_000],
};
export const groupOf = (id: number): Group | null => {
  for (const g of Object.keys(GROUP_RANGES) as Group[]) if (id >= GROUP_RANGES[g][0] && id < GROUP_RANGES[g][1]) return g;
  return null;
};
/** base + days since 2000-01-01 × 100 + slot (0–99): stable for the same thing on the same day */
const EPOCH = new Date(2000, 0, 1, 12).getTime();
const dayNo = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() - EPOCH) / 86400000);
const makeId = (g: Group, day: Date, slot: number) => GROUP_RANGES[g][0] + dayNo(day) * 100 + slot;

export type Channel = 'shabbat' | 'zmanim' | 'reminders';
export const CHANNELS: Record<Channel, { name: string; description: string }> = {
  shabbat: { name: 'שבת, חגים וצומות', description: 'התראה ביום שישי, הדלקת נרות, צאת שבת וחג, תחילת הצום וסיומו' },
  zmanim: { name: 'זמני היום', description: 'התראות לפני הזמנים שבחרתם' },
  reminders: { name: 'האירועים שלי', description: 'תזכורות לימי הולדת, יארצייטים ואירועים' },
};

export interface PlannedNotification {
  id: number;
  at: Date;
  title: string;
  body: string;
  group: Group;
  channel: Channel;
}

export interface Plan {
  list: PlannedNotification[];
  /** how far ahead each kind reaches, for the settings screen */
  zmanDays: number;
  fridayWeeks: number;
  events: number;
  holiday: number;
}

/** How many days ahead each kind looks */
export const HORIZON = { zmanim: 10, holiday: 14, events: 60, fridayWeeks: 52 } as const;
/** Kept even when many zmanim are on; the zmanim get what is left, in whole days */
const RESERVE = { events: 20, fridayWeeks: 4 } as const;

const inMins = (m: number) => (m === 0 ? 'עכשיו' : `בעוד ${m} דק׳`);

export function anyAlertsOn(s: Settings, events: MyEvent[] = []) {
  return (
    s.nativeAlerts ||
    s.candleAlert ||
    s.havdalahAlert ||
    s.fastAlerts ||
    Object.keys(s.zmanAlerts).length > 0 ||
    events.some((e) => e.remind && e.remind !== 'none')
  );
}

/* ---------------- zmanim ---------------- */

export function zmanNotifications(from: Date, days: number, city: City, s: Settings, now: Date): PlannedNotification[][] {
  const on = ZMAN_ALERTS.map((z, slot) => ({ ...z, slot, mins: s.zmanAlerts[z.id] })).filter((z) => z.mins !== undefined && Number.isFinite(z.mins));
  if (!on.length) return [];
  const f = timeFmt(city.tz);
  const out: PlannedNotification[][] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const rows = zmanim(d, city, s).rows;
    const day: PlannedNotification[] = [];
    for (const z of on) {
      const row = rows.find((r) => r.id === z.id);
      if (!row) continue; // e.g. no alot in a northern summer
      const t = roundTo(row.time, row.round);
      const at = new Date(t.getTime() - z.mins * 60000);
      if (at.getTime() <= now.getTime() + 30000) continue;
      day.push({
        id: makeId('zmanim', d, z.slot),
        at,
        title: `${z.label} ${inMins(z.mins)}`,
        body: `${f.format(t)} · ${city.name}`,
        group: 'zmanim',
        channel: 'zmanim',
      });
    }
    day.sort((a, b) => a.at.getTime() - b.at.getTime());
    out.push(day);
  }
  return out;
}

/* ---------------- candle lighting, end of Shabbat / Yom Tov, fasts ---------------- */

/** The hour of `d` on the clock of time zone `tz` */
function hourIn(tz: string, d: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d));
}

function occasion(items: DayItem[], next: DayItem[]) {
  const yt = next.find((i) => i.kind === 'yomtov') ?? next.find((i) => i.kind === 'cholhamoed');
  if (yt) return yt.title;
  const p = next.find((i) => i.kind === 'parasha');
  if (p) return p.title.startsWith('פרשת') ? `שבת ${p.title}` : p.title;
  const fast = items.find((i) => i.kind === 'fast');
  return fast?.title ?? 'שבת';
}

export function holidayNotifications(from: Date, days: number, city: City, s: Settings, now: Date): PlannedNotification[] {
  if (!s.candleAlert && !s.havdalahAlert && !s.fastAlerts) return [];
  const start = addDays(from, -1); // a fast starting at dawn is announced the evening before
  const map = rangeItems(start, addDays(from, days + 1), city, s, false);
  const get = (d: Date) => map.get(dateKey(d)) ?? [];
  const f = timeFmt(city.tz);
  const out: PlannedNotification[] = [];
  const push = (d: Date, slot: number, at: Date, title: string, body: string) => {
    if (at.getTime() <= now.getTime() + 30000) return;
    out.push({ id: makeId('holiday', d, slot), at, title, body, group: 'holiday', channel: 'shabbat' });
  };
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    const items = get(d);
    const next = get(addDays(d, 1));
    items.forEach((it, slot) => {
      if (!it.time) return;
      const t = it.time;
      if (it.kind === 'candles' && s.candleAlert) {
        const m = s.candleAlertMins;
        push(d, slot, new Date(t.getTime() - m * 60000), `🕯️ הדלקת נרות ${inMins(m)}`, `${f.format(t)} · ${city.name} · ${occasion(items, next)}`);
      } else if (it.kind === 'havdalah' && s.havdalahAlert) {
        const chag = items.some((x) => x.kind === 'yomtov');
        const what = d.getDay() === 6 ? (chag ? 'צאת השבת והחג' : 'צאת השבת') : 'צאת החג';
        push(d, slot, t, what, `${f.format(t)} · ${city.name}`);
      } else if (it.kind === 'fast-start' && s.fastAlerts) {
        // the hebcal item for a fast that starts at sunset sits on the day before the fast
        const hour = hourIn(city.tz, t);
        const name = (get(hour < 12 ? d : addDays(d, 1)).find((x) => x.kind === 'fast') ?? items.find((x) => x.kind === 'fast'))?.title ?? 'צום';
        if (hour < 8) {
          // a dawn fast: no alarm at 4 a.m.; say it the evening before, while there is still time to eat
          const eve = addDays(d, -1);
          push(d, slot, new Date(eve.getFullYear(), eve.getMonth(), eve.getDate(), 21, 0), `מחר ${name}`, `תחילת הצום ${f.format(t)} · ${city.name}`);
        } else {
          push(d, slot, new Date(t.getTime() - 30 * 60000), `${name}: הצום מתחיל בעוד 30 דק׳`, `${f.format(t)} · ${city.name}`);
        }
      } else if (it.kind === 'fast-end' && s.fastAlerts) {
        const name = items.find((x) => x.kind === 'fast')?.title;
        push(d, slot, t, 'סיום הצום', `${f.format(t)} · ${city.name}${name ? ' · ' + name : ''}`);
      }
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ---------------- Friday alerts ---------------- */

export function fridayNotifications(from: Date, weeks: number, city: City, s: Settings, now: Date): PlannedNotification[] {
  if (!s.nativeAlerts) return [];
  return nativeAlerts(shabbatAlerts(from, weeks, city, s), city, s.alertTime)
    .filter((a) => a.at.getTime() > now.getTime() + 30000)
    .map((a) => ({ ...a, group: 'friday' as const, channel: 'shabbat' as const }));
}

/* ---------------- personal events ---------------- */

export function eventNotifications(from: Date, days: number, events: MyEvent[], now: Date): PlannedNotification[] {
  const withRemind = events.filter((e) => e.remind && e.remind !== 'none');
  if (!withRemind.length) return [];
  const out: PlannedNotification[] = [];
  const slots = new Map<string, number>();
  // an occurrence up to a week after the window can still need its "a week before" reminder inside it
  for (let i = 0; i <= days + 7; i++) {
    const d = addDays(from, i);
    const hd = new HDate(d);
    for (const e of withRemind) {
      const years = eventOccursOn(e, d, hd);
      if (years === null) continue;
      const kind = e.remind as 'day' | 'eve' | 'week';
      const [hh, mm] = (e.remindTime || REMIND_DEFAULT_TIME[kind]).split(':').map(Number);
      const fire = kind === 'day' ? d : addDays(d, kind === 'eve' ? -1 : -7);
      const at = new Date(fire.getFullYear(), fire.getMonth(), fire.getDate(), hh || 0, mm || 0);
      if (at.getTime() <= now.getTime() + 30000 || at.getTime() > addDays(from, days).getTime() + 86400000) continue;
      const k = dateKey(fire);
      const slot = slots.get(k) ?? 0;
      if (slot > 99) continue;
      slots.set(k, slot + 1);
      const when = kind === 'day' ? 'היום' : kind === 'eve' ? 'מחר' : 'בעוד שבוע';
      const age = e.repeat !== 'none' && years > 0 ? ` · ${years} שנה` : '';
      out.push({
        id: makeId('events', fire, slot),
        at,
        title: e.title,
        body: `${when}, יום ${WEEKDAYS_SHORT[d.getDay()]} ${hebDateStr(hd, false)}${e.time ? ` · ${e.time}` : ''}${age}`,
        group: 'events',
        channel: 'reminders',
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ---------------- the whole plan, within the budget ---------------- */

/**
 * Everything to schedule, at most `budget` notifications (iOS: 64 in total).
 * Priority: personal event reminders (the 20 soonest), candle lighting / end of Shabbat / fasts
 * for two weeks, the next 4 Friday alerts; then as many whole days of zmanim as fit (up to 10;
 * fewer days when many zmanim are on); whatever is left extends the Friday alerts (up to a year)
 * and the remaining event reminders.
 */
export function planNotifications(opts: { now: Date; city: City; settings: Settings; events: MyEvent[]; budget?: number }): Plan {
  const { now, city, settings: s, events } = opts;
  const budget = opts.budget ?? IOS_LIMIT;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  const evs = eventNotifications(start, HORIZON.events, events, now);
  const hol = holidayNotifications(start, HORIZON.holiday, city, s, now);
  const fri = fridayNotifications(start, HORIZON.fridayWeeks, city, s, now);

  const take: PlannedNotification[] = [];
  const room = () => budget - take.length;
  const add = (xs: PlannedNotification[]) => {
    const n = Math.max(0, Math.min(xs.length, room()));
    take.push(...xs.slice(0, n));
    return n;
  };

  let evN = add(evs.slice(0, RESERVE.events));
  const holN = add(hol);
  let friN = add(fri.slice(0, RESERVE.fridayWeeks));

  // zmanim: whole days while they fit
  let zmanDays = 0;
  const zDays = zmanNotifications(start, HORIZON.zmanim, city, s, now);
  for (const day of zDays) {
    if (!day.length) {
      zmanDays++;
      continue;
    }
    if (day.length > room()) {
      if (zmanDays === 0) add(day); // never leave today without its zmanim if anything fits
      break;
    }
    add(day);
    zmanDays++;
  }
  if (!zDays.length) zmanDays = 0;

  friN += add(fri.slice(RESERVE.fridayWeeks));
  evN += add(evs.slice(RESERVE.events));

  take.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { list: take, zmanDays, fridayWeeks: friN, events: evN, holiday: holN };
}
