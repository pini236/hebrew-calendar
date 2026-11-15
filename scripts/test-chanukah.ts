/**
 * Tests for the Chanukah season (src/lib/seasons/chanukah.ts): which days it shows, how many candles each
 * evening, when to light (weekday / Friday / Motzei Shabbat), how long they burn in the app, the
 * reminders, and what it gives the live sky.   npm test   (runs with TZ=Asia/Jerusalem)
 */
import { HDate, months } from '@hebcal/core';
import '../src/lib/seasons/all';
import { GROUP_RANGES, IOS_LIMIT, planNotifications, seasonNotifications } from '../src/lib/alerts';
import { addDays, dateKey, rangeItems, roundTo, zmanim } from '../src/lib/cal';
import { findCity } from '../src/lib/cities';
import { setLang } from '../src/lib/i18n';
import { activeSeasons, seasonContext, skyDecor, SEASON_SLOTS } from '../src/lib/seasons';
import { BURN_MIN_MS, burningAt, candlesOn, chanukah, chanukahActive, chanukahNight, isEighthDay, prefsOf, type ChanukahPrefs } from '../src/lib/seasons/chanukah';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/store';

let failed = 0;
let passed = 0;
function check(cond: unknown, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log('  FAIL ' + msg);
  }
}

const jlm = findCity('jerusalem')!;
const ny = findCity('new-york')!;
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const hm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const withPrefs = (p: Partial<ChanukahPrefs>, s: Settings = DEFAULT_SETTINGS): Settings => ({ ...s, seasons: { chanukah: p } });

/* ---- 1. the season's days and the candles of each evening, 5787 ---- */
{
  check(!chanukahActive(day(2026, 12, 3)), '23 Kislev: not yet');
  check(chanukahActive(day(2026, 12, 4)), '24 Kislev (Erev Chanukah): shows');
  check(candlesOn(day(2026, 12, 3)) === 0, '23 Kislev: no candles');
  for (let i = 0; i < 8; i++) check(candlesOn(day(2026, 12, 4 + i)) === i + 1, `Dec ${4 + i}: ${i + 1} candles (got ${candlesOn(day(2026, 12, 4 + i))})`);
  check(candlesOn(day(2026, 12, 12)) === 0 && isEighthDay(day(2026, 12, 12)), '2 Tevet 5787: the eighth day, no lighting');
  check(chanukahActive(day(2026, 12, 12)), 'the eighth day still shows');
  check(!chanukahActive(day(2026, 12, 13)), '3 Tevet 5787: over');
  check(chanukahNight(day(2026, 12, 12), jlm, DEFAULT_SETTINGS) === null, 'the eighth day: no night to light');
  check(activeSeasons(day(2026, 12, 6), jlm, DEFAULT_SETTINGS).some((s) => s.id === 'chanukah'), 'activeSeasons has chanukah on 26 Kislev');
  check(!activeSeasons(day(2026, 11, 20), jlm, DEFAULT_SETTINGS).some((s) => s.id === 'chanukah'), 'no chanukah in mid-Kislev');
}

/* ---- 2. every year: 24 Kislev to 2 or 3 Tevet, nine days, candles 1..8 in a row ---- */
{
  let short = 0;
  for (let y = 5780; y <= 5800; y++) {
    const start = new HDate(20, months.KISLEV, y).greg();
    const days: Date[] = [];
    for (let i = 0; i < 20; i++) {
      const d = addDays(start, i);
      if (chanukahActive(d)) days.push(d);
    }
    check(days.length === 9, `${y}: nine days (got ${days.length})`);
    const first = new HDate(days[0]);
    const last = new HDate(days[days.length - 1]);
    check(first.getMonth() === months.KISLEV && first.getDate() === 24, `${y}: starts on 24 Kislev (${first.toString()})`);
    check(last.getMonth() === months.TEVET && (last.getDate() === 2 || last.getDate() === 3), `${y}: ends on 2 or 3 Tevet (${last.toString()})`);
    if (last.getDate() === 3) short++;
    check(days.slice(0, 8).every((d, i) => candlesOn(d) === i + 1), `${y}: candles 1..8 on consecutive evenings`);
    check(isEighthDay(days[8]) && candlesOn(days[8]) === 0, `${y}: the ninth day is the eighth day of Chanukah`);
  }
  check(short > 0, `some years have a short Kislev (8th day on 3 Tevet): ${short}`);
}

/* ---- 3. when to light ---- */
for (const city of [jlm, ny]) {
  const items = (d: Date) => rangeItems(d, d, city, DEFAULT_SETTINGS, false).get(dateKey(d)) ?? [];
  // Friday 4 Dec 2026, the first night: before the Shabbat candles
  const fri = chanukahNight(day(2026, 12, 4), city, DEFAULT_SETTINGS)!;
  const shabbat = items(day(2026, 12, 4)).find((i) => i.kind === 'candles')!.time!;
  check(fri.rule === 'friday', `${city.id} Fri: the Friday rule`);
  check(fri.at.getTime() === shabbat.getTime(), `${city.id} Fri: by the Shabbat candle lighting ${hm(shabbat)} (got ${hm(fri.at)})`);
  check(fri.at.getTime() < zmanim(day(2026, 12, 4), city, DEFAULT_SETTINGS).sunset.getTime(), `${city.id} Fri: before sunset`);
  check(fri.earliest.getTime() <= fri.at.getTime(), `${city.id} Fri: plag before the lighting`);
  // Motzei Shabbat 5 Dec: after havdalah
  const sat = chanukahNight(day(2026, 12, 5), city, DEFAULT_SETTINGS)!;
  const havdalah = items(day(2026, 12, 5)).find((i) => i.kind === 'havdalah')!.time!;
  check(sat.rule === 'motzash', `${city.id} Sat: after havdalah`);
  check(sat.at.getTime() >= havdalah.getTime(), `${city.id} Sat: not before havdalah ${hm(havdalah)} (got ${hm(sat.at)})`);
  check(sat.candles === 2, `${city.id} Sat night: 2 candles`);
  // with a later havdalah opinion, later
  const sat72 = chanukahNight(day(2026, 12, 5), city, { ...DEFAULT_SETTINGS, havdalah: 'min72' })!;
  check(sat72.at.getTime() > sat.at.getTime(), `${city.id} Sat: follows the havdalah opinion (72 min: ${hm(sat72.at)})`);
  // a weekday: tzeit by default, sunset by preference
  const z = zmanim(day(2026, 12, 8), city, DEFAULT_SETTINGS);
  const row = (id: string) => {
    const r = z.rows.find((x) => x.id === id)!;
    return roundTo(r.time, r.round);
  };
  const tue = chanukahNight(day(2026, 12, 8), city, DEFAULT_SETTINGS)!;
  check(tue.rule === 'tzeit' && tue.at.getTime() === row('tzeit').getTime(), `${city.id} Tue: at tzeit ${hm(row('tzeit'))} (got ${hm(tue.at)})`);
  const tueS = chanukahNight(day(2026, 12, 8), city, DEFAULT_SETTINGS, { basis: 'sunset', remind: true, fridayMins: 20 })!;
  check(tueS.rule === 'sunset' && tueS.at.getTime() === row('sunset').getTime(), `${city.id} Tue: at sunset by preference ${hm(row('sunset'))}`);
  check(tue.candles === 5, `${city.id} Tue 8 Dec: the fifth candle`);
  // they burn (in the app) until 22:00, and at least an hour
  // (the app's days are the phone's own: New York seen from a phone on Jerusalem time lights after 22:00)
  const by22 = new Date(2026, 11, 8, 22, 0).getTime();
  check(tue.until.getTime() === Math.max(by22, tue.at.getTime() + BURN_MIN_MS), `${city.id} Tue: lit until 22:00, and at least an hour (${hm(tue.until)})`);
}
{
  const p = prefsOf(seasonContext('chanukah', jlm, withPrefs({ basis: 'sunset' })));
  check(p.basis === 'sunset' && p.remind === true && p.fridayMins === 20, 'preferences merge over the defaults');
  const bad = prefsOf({ prefs: { basis: 'noon', fridayMins: -3 } });
  check(bad.basis === 'tzeit' && bad.fridayMins === 20, 'unknown preference values fall back');
}

/* ---- 4. the sky: while tonight's candles burn ---- */
{
  const at = (iso: string) => skyDecor(new Date(iso), jlm, DEFAULT_SETTINGS).chanukahCandles;
  check(at('2026-12-04T15:00:00+02:00') === undefined, 'Fri 15:00: not yet lit');
  check(at('2026-12-04T19:00:00+02:00') === 1, 'Fri 19:00: the first candle, with Shabbat');
  check(at('2026-12-05T12:00:00+02:00') === undefined, 'Shabbat noon: none');
  check(at('2026-12-05T17:30:00+02:00') === 2, 'Motzei Shabbat 17:30: two');
  check(at('2026-12-08T18:30:00+02:00') === 5, 'Tue 18:30: five');
  check(at('2026-12-08T22:30:00+02:00') === undefined, 'Tue 22:30: out');
  check(at('2026-12-11T18:00:00+02:00') === 8, 'Fri 11 Dec 18:00: eight');
  check(at('2026-12-12T19:00:00+02:00') === undefined, 'the eighth day, evening: none');
  // "הדלקתי" earlier (from plag) or later than the time
  const early = burningAt(new Date('2026-12-08T16:40:00+02:00'), jlm, DEFAULT_SETTINGS, undefined, { lit: { '2026-12-08': new Date('2026-12-08T16:30:00+02:00').getTime() } });
  check(early?.candles === 5, 'lit at 16:30 by a tap: burning at 16:40');
  const late = burningAt(new Date('2026-12-08T23:10:00+02:00'), jlm, DEFAULT_SETTINGS, undefined, { lit: { '2026-12-08': new Date('2026-12-08T22:50:00+02:00').getTime() } });
  check(late?.candles === 5, 'lit late at 22:50: still burning at 23:10');
  const after = burningAt(new Date('2026-12-09T00:10:00+02:00'), jlm, DEFAULT_SETTINGS, undefined, { lit: { '2026-12-08': new Date('2026-12-08T22:50:00+02:00').getTime() } });
  check(after === null, 'lit at 22:50: out after an hour');
}

/* ---- 5. reminders ---- */
{
  setLang('he');
  const ctx = seasonContext('chanukah', jlm, DEFAULT_SETTINGS);
  const from = day(2026, 12, 1);
  const now = new Date('2026-12-01T08:00:00+02:00');
  const list = chanukah.notifications!(from, 14, now, ctx);
  check(list.length === 8, `eight reminders, one each evening (got ${list.length})`);
  const fri = list[0];
  check(fri.title === 'נר ראשון של חנוכה · הדלקה עד 15:54', `Friday title: ${fri.title}`);
  check(fri.body === 'לפני נרות שבת · ירושלים', `Friday body: ${fri.body}`);
  check(hm(fri.at) === '15:34', `Friday: 20 min before the Shabbat candles (got ${hm(fri.at)})`);
  check(list[1].title.startsWith('נר שני של חנוכה · הדלקה ב־') && list[1].body.startsWith('אחרי הבדלה'), `Motzei Shabbat: ${list[1].title} / ${list[1].body}`);
  check(list[2].title === `נר שלישי של חנוכה · הדלקה ב־${hm(chanukahNight(day(2026, 12, 6), jlm, DEFAULT_SETTINGS)!.at)}` && list[2].body === 'צאת הכוכבים · ירושלים', `Sunday: ${list[2].title} / ${list[2].body}`);
  check(list[7].title.startsWith('נר שמיני של חנוכה · הדלקה עד'), `the eighth night is a Friday: ${list[7].title}`);
  check(list.every((n) => !/[\u{1F300}-\u{1FAFF}]/u.test(n.title + n.body)), 'no emoji');
  const fri30 = chanukah.notifications!(from, 14, now, seasonContext('chanukah', jlm, withPrefs({ fridayMins: 30 })));
  check(hm(fri30[0].at) === '15:24', `Friday 30 min before (got ${hm(fri30[0].at)})`);
  check(chanukah.notifications!(from, 14, now, seasonContext('chanukah', jlm, withPrefs({ remind: false }))).length === 0, 'reminder off: none');
  const mid = chanukah.notifications!(day(2026, 12, 8), 14, new Date('2026-12-08T18:00:00+02:00'), ctx);
  check(mid.length === 3 && mid[0].title.startsWith('נר שישי'), `from Tuesday evening, after its lighting: the 6th, 7th, 8th (got ${mid.map((n) => n.title).join(' | ')})`);
  check(chanukah.notifications!(day(2026, 11, 1), 20, new Date('2026-11-01T08:00:00+02:00'), ctx).length === 0, 'none in November');

  // in the plan: the season group, the 'seasons' channel, chanukah's slots, within the budget
  const all = seasonNotifications(from, 14, jlm, DEFAULT_SETTINGS, now).filter((n) => n.title.includes('חנוכה'));
  check(all.length === 8, 'seasonNotifications carries them');
  for (const n of all) {
    check(n.group === 'season' && n.channel === 'seasons', 'group season, channel seasons');
    check(n.id >= GROUP_RANGES.season[0] && n.id < GROUP_RANGES.season[1] && n.id % 100 >= SEASON_SLOTS.chanukah && n.id % 100 < SEASON_SLOTS.chanukah + 20, `id ${n.id} in chanukah's slots`);
  }
  check(new Set(all.map((n) => n.id)).size === all.length, 'ids unique');
  // New York seen from a phone on Jerusalem time: Motzei Shabbat's reminder falls after local midnight,
  // on the same phone day as Sunday's
  const nyAll = seasonNotifications(from, 14, ny, DEFAULT_SETTINGS, now);
  check(nyAll.length === 8 && new Set(nyAll.map((n) => n.id)).size === 8, 'New York: eight reminders, ids unique');
  const plan = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, candleAlert: true, zmanAlerts: { shma: 15, sunset: 0, tzeit: 0 } }, events: [] });
  check(plan.list.filter((n) => n.group === 'season').length === 8 && plan.list.length <= IOS_LIMIT, `planNotifications: 8 Chanukah reminders among ${plan.list.length}`);

  setLang('en');
  const en = chanukah.notifications!(from, 14, now, seasonContext('chanukah', ny, DEFAULT_SETTINGS));
  check(en[0].title.startsWith('Chanukah, 1st candle · light before ') && en[0].body.startsWith('Before the Shabbat candles · '), `English: ${en[0].title} / ${en[0].body}`);
  check(en[2].title.startsWith('Chanukah, 3rd candle · light at ') && en[2].body.startsWith('Nightfall · '), `English weekday: ${en[2].title} / ${en[2].body}`);
  setLang('he');
}

console.log(`chanukah: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
