/**
 * Chanukah: from Erev Chanukah (24 Kislev, the evening of the first candle) to the eighth day (2 or 3 Tevet).
 *
 * Everything calendrical comes from the app's engines, never computed here:
 *   - which evening lights how many candles: Hebcal's Chanukah events ("Chanukah: 3 Candles" on the civil day
 *     whose evening lights them; "Chanukah: 8th Day" on the last day, with no lighting that evening)
 *   - the lighting time: KosherJava's tzeit (8.5°) or sunset (a preference, tzeit by default), from zmanim()
 *   - Friday: before the Shabbat candles (Hebcal's candle lighting, the same as the app's Shabbat card)
 *   - Motzei Shabbat: after havdalah (Hebcal's havdalah, by the user's own opinion)
 *   - the earliest lighting with a blessing: plag hamincha (KosherJava, GRA)
 *
 * How long the candles burn in the app (the sky and the card): from lighting until 22:00, and at least an hour.
 * Real Chanukah candles burn for 30–60 minutes and oil for longer; the app keeps them lit through the evening,
 * so whoever opens it after dinner still sees tonight's lights, then lets them go out before night.
 * When the user taps "הדלקתי" the candles burn from that moment (also before the time, from plag, or late).
 */
import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { addDays, dateKey, noon, rangeItems, roundTo, timeFmt, zmanim } from '../cal';
import type { City } from '../cities';
import { isHe, tr } from '../i18n';
import type { Settings } from '../store';
import { loadSeasonState, registerSeason, type Season, type SeasonContext } from '../seasons';

export type LightingBasis = 'tzeit' | 'sunset';

export interface ChanukahPrefs {
  /** weekday lighting: at nightfall (tzeit, the default) or at sunset */
  basis: LightingBasis;
  /** a reminder each evening (native apps) */
  remind: boolean;
  /** Friday: the reminder this many minutes before the Shabbat candles */
  fridayMins: number;
}

export const CHANUKAH_DEFAULTS: ChanukahPrefs = { basis: 'tzeit', remind: true, fridayMins: 20 };

/** The card's own state: when the user tapped "הדלקתי", by the evening's date key; the evening whose lighting was shown */
export interface ChanukahState {
  lit: Record<string, number>;
  played?: string;
}
export const CHANUKAH_STATE: ChanukahState = { lit: {} };

/** Lit in the app until this hour of the evening, and at least this long */
export const BURN_UNTIL_HOUR = 22;
export const BURN_MIN_MS = 60 * 60000;

export function prefsOf(ctx: Pick<SeasonContext, 'prefs'>): ChanukahPrefs {
  const p = ctx.prefs as Partial<ChanukahPrefs>;
  return {
    basis: p.basis === 'sunset' ? 'sunset' : 'tzeit',
    remind: p.remind !== false,
    fridayMins: Number.isFinite(p.fridayMins) && (p.fridayMins as number) >= 0 ? (p.fridayMins as number) : CHANUKAH_DEFAULTS.fridayMins,
  };
}

/* ---------------- which evening, how many candles (Hebcal) ---------------- */

const dayCache = new Map<string, { candles: number; eighth: boolean }>();

function chanukahDay(day: Date) {
  const k = dateKey(day);
  let v = dayCache.get(k);
  if (!v) {
    v = { candles: 0, eighth: false };
    for (const ev of HebrewCalendar.getHolidaysOnDate(new HDate(noon(day))) ?? []) {
      const desc = ev.getDesc();
      const m = /^Chanukah: (\d) Candles?$/.exec(desc);
      if (m && ev.getFlags() & flags.CHANUKAH_CANDLES) v.candles = +m[1];
      if (desc === 'Chanukah: 8th Day') v.eighth = true;
    }
    if (dayCache.size > 400) dayCache.clear();
    dayCache.set(k, v);
  }
  return v;
}

/** How many candles are lit on the evening of this (civil) day: 1–8, or 0 */
export function candlesOn(day: Date) {
  return chanukahDay(day).candles;
}
/** The eighth day of Chanukah (זאת חנוכה): no lighting that evening */
export function isEighthDay(day: Date) {
  return chanukahDay(day).eighth;
}
/** Erev Chanukah through the eighth day */
export function chanukahActive(day: Date) {
  const d = chanukahDay(day);
  return d.candles > 0 || d.eighth;
}

/* ---------------- the lighting time (KosherJava, Hebcal) ---------------- */

export type LightingRule = 'tzeit' | 'sunset' | 'friday' | 'motzash';

export interface ChanukahNight {
  /** the civil day whose evening this is (noon-pinned) */
  day: Date;
  /** 1–8 (the shamash is extra) */
  candles: number;
  rule: LightingRule;
  /** lighting time. Friday: the Shabbat candle lighting, which the Chanukah lights come before */
  at: Date;
  /** plag hamincha: the earliest lighting with a blessing */
  earliest: Date;
  /** the candles burn (in the app) until here */
  until: Date;
  /** Friday: the Shabbat candle lighting; Motzei Shabbat: havdalah */
  shabbat?: Date;
}

const nightCache = new Map<string, ChanukahNight | null>();

function lateHour(day: Date) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), BURN_UNTIL_HOUR, 0);
}
/** Lit at `from`: burning until 22:00, and at least an hour */
export function burnEnd(day: Date, from: Date) {
  return new Date(Math.max(lateHour(day).getTime(), from.getTime() + BURN_MIN_MS));
}

/** The evening of `day`: its candles and when to light them (null when no candles are lit that evening) */
export function chanukahNight(day: Date, city: City, settings: Settings, prefs: ChanukahPrefs = CHANUKAH_DEFAULTS): ChanukahNight | null {
  const d = noon(day);
  const candles = candlesOn(d);
  if (!candles) return null;
  const key = [dateKey(d), city.lat, city.lon, city.tz, city.elev, settings.candleMins ?? city.candle, settings.havdalah, settings.useElevation, prefs.basis].join('|');
  if (nightCache.has(key)) return nightCache.get(key)!;

  const z = zmanim(d, city, settings);
  const row = (id: string) => {
    const r = z.rows.find((x) => x.id === id);
    return r ? roundTo(r.time, r.round) : null;
  };
  const sunset = row('sunset') ?? z.sunset;
  const tzeit = row('tzeit') ?? sunset;
  const basisAt = prefs.basis === 'sunset' ? sunset : tzeit;
  const earliest = row('plag') ?? new Date(sunset.getTime() - 75 * 60000);
  let rule: LightingRule = prefs.basis;
  let at = basisAt;
  let shabbat: Date | undefined;

  const dow = d.getDay();
  if (dow === 5 || dow === 6) {
    const items = rangeItems(d, d, city, settings, false).get(dateKey(d)) ?? [];
    if (dow === 5) {
      // Friday: the Chanukah lights before the Shabbat candles
      const c = items.find((i) => i.kind === 'candles')?.time;
      if (c) {
        rule = 'friday';
        shabbat = c;
        at = c;
      }
    } else {
      // Motzei Shabbat: after havdalah
      const h = items.find((i) => i.kind === 'havdalah')?.time;
      if (h) {
        rule = 'motzash';
        shabbat = h;
        at = new Date(Math.max(h.getTime(), basisAt.getTime()));
      }
    }
  }
  const night: ChanukahNight = { day: d, candles, rule, at, earliest: new Date(Math.min(earliest.getTime(), at.getTime())), until: burnEnd(d, at), shabbat };
  if (nightCache.size > 200) nightCache.clear();
  nightCache.set(key, night);
  return night;
}

/** When the candles of this evening were lit: the user's tap ("הדלקתי"), or the lighting time */
export function litAt(night: ChanukahNight, state: ChanukahState = CHANUKAH_STATE) {
  const tap = state.lit[dateKey(night.day)];
  return Number.isFinite(tap) ? new Date(Math.min(tap, night.at.getTime())) : night.at;
}
/** Until when they burn: the evening's own end, or an hour after a late tap */
export function litUntil(night: ChanukahNight, state: ChanukahState = CHANUKAH_STATE) {
  const tap = state.lit[dateKey(night.day)];
  return Number.isFinite(tap) ? new Date(Math.max(night.until.getTime(), tap + BURN_MIN_MS)) : night.until;
}

/** The evening whose candles burn at this moment, if any (the evening before too, for a late lighting) */
export function burningAt(at: Date, city: City, settings: Settings, prefs: ChanukahPrefs = CHANUKAH_DEFAULTS, state: ChanukahState = CHANUKAH_STATE) {
  for (const d of [noon(at), addDays(noon(at), -1)]) {
    const n = chanukahNight(d, city, settings, prefs);
    if (n && at.getTime() >= litAt(n, state).getTime() && at.getTime() < litUntil(n, state).getTime()) return n;
  }
  return null;
}

/* ---------------- words ---------------- */

const ORD_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'];
const ORD_EN = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** "נר שלישי" / "3rd candle" */
export function candleName(n: number) {
  return isHe() ? `נר ${ORD_HE[n - 1]}` : `${ORD_EN[n - 1]} candle`;
}
/** "נר שלישי של חנוכה" / "Chanukah, 3rd candle" */
export function candleTitle(n: number) {
  return tr(`נר ${ORD_HE[n - 1]} של חנוכה`, `Chanukah, ${ORD_EN[n - 1]} candle`);
}
/** "צאת הכוכבים" / "שקיעה" / "לפני נרות שבת" / "אחרי הבדלה" */
export function ruleName(rule: LightingRule) {
  switch (rule) {
    case 'tzeit':
      return tr('צאת הכוכבים', 'Nightfall');
    case 'sunset':
      return tr('שקיעה', 'Sunset');
    case 'friday':
      return tr('לפני נרות שבת', 'Before the Shabbat candles');
    case 'motzash':
      return tr('אחרי הבדלה', 'After havdalah');
  }
}

/* ---------------- the season ---------------- */

function remindersFor(from: Date, days: number, now: Date, ctx: SeasonContext) {
  const prefs = prefsOf(ctx);
  if (!prefs.remind) return [];
  const f = timeFmt(ctx.city.tz);
  const out: { id: number; at: Date; title: string; body: string }[] = [];
  for (let i = 0; i < days; i++) {
    const n = chanukahNight(addDays(from, i), ctx.city, ctx.settings, prefs);
    if (!n) continue;
    const friday = n.rule === 'friday';
    const at = friday ? new Date(n.at.getTime() - prefs.fridayMins * 60000) : n.at;
    if (at.getTime() <= now.getTime() + 30000) continue;
    out.push({
      // the slot within the day: the candle number, so two evenings' reminders never share an id even when
      // the place's evening falls on the phone's next day (New York seen from a phone on Jerusalem time)
      id: n.candles,
      at,
      title: friday
        ? tr(`${candleTitle(n.candles)} · הדלקה עד ${f.format(n.at)}`, `${candleTitle(n.candles)} · light before ${f.format(n.at)}`)
        : tr(`${candleTitle(n.candles)} · הדלקה ב־${f.format(n.at)}`, `${candleTitle(n.candles)} · light at ${f.format(n.at)}`),
      body: `${ruleName(n.rule)} · ${ctx.city.name}`,
    });
  }
  return out;
}

export const chanukah: Season = {
  id: 'chanukah',
  name: () => tr('חנוכה', 'Chanukah'),
  defaults: { ...CHANUKAH_DEFAULTS },
  activeOn: (day) => chanukahActive(day),
  notifications: remindersFor,
  skyDecor(at, ctx) {
    const n = burningAt(at, ctx.city, ctx.settings, prefsOf(ctx), loadSeasonState('chanukah', CHANUKAH_STATE));
    return n ? { chanukahCandles: n.candles } : null;
  },
};

registerSeason(chanukah);
