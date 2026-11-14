/**
 * Data for the home-screen widget.
 *
 * The widget is native code and cannot run the zmanim libraries, so the app computes
 * everything ahead of time (about two months) and hands it over as JSON. The widget then
 * only picks the right day, switches the Hebrew date at sunset and finds the next zman.
 * Pure function, unit-tested in scripts/test-widget.ts.
 */
import { HDate } from '@hebcal/core';
import { WEEKDAYS, addDays, dateKey, gregDateStr, hebDateStr, rangeItems, roundTo, shortTitle, timeFmt, zmanim, type Kind } from './cal';
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
  /** upcoming zmanim of the day, in order */
  z: WidgetZman[];
  /** coming Shabbat or Yom Tov line ("" when more than a week away) */
  sh: string;
}

export interface WidgetData {
  v: 1;
  city: string;
  tz: string;
  generated: number;
  days: WidgetDay[];
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

export function buildWidgetData(from: Date, days: number, city: City, s: Settings): WidgetData {
  const fmt = timeFmt(city.tz);
  const end = addDays(from, days);
  const items = rangeItems(from, end, city, s, false);
  const shabbats = shabbatAlerts(addDays(from, -1), Math.ceil(days / 7) + 2, city, s);
  const out: WidgetDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const hd = new HDate(d);
    const z = zmanim(d, city, s);
    const its = items.get(dateKey(d)) ?? [];

    // most important label of the day
    let label = '';
    for (const k of LABEL_KINDS) {
      const it = its.find((x) => x.kind === k);
      if (it) {
        label = shortTitle(it.title);
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
    zl.sort((a, b) => a.t - b.t);

    // the next Shabbat whose havdalah is still ahead of this day
    let sh = '';
    const next = shabbats.find((a) => addDays(a.havdalahDay, 1).getTime() > d.getTime());
    if (next) {
      const away = Math.round((next.friday.getTime() - d.getTime()) / 86400000);
      if (away <= 6) sh = `${next.title} · ${fmt.format(next.candles)}–${fmt.format(next.havdalah)}`;
    }

    out.push({
      d: dateKey(d),
      h: hebDateStr(hd),
      he: hebDateStr(new HDate(addDays(d, 1))),
      g: `יום ${WEEKDAYS[d.getDay()]} · ${gregDateStr(d, false)}`,
      ss: roundTo(z.sunset, 'floor').getTime(),
      l: label,
      z: zl,
      sh,
    });
  }
  return { v: 1, city: city.name, tz: city.tz, generated: Date.now(), days: out };
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
