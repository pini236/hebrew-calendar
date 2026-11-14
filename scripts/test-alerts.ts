/**
 * Unit tests for the notification plan (src/lib/alerts.ts) and personal-event recurrence.
 * The scheduling itself needs a phone; everything that decides *what* is scheduled is pure
 * and is tested here:   npm test
 */
import { HDate } from '@hebcal/core';
import { GROUP_RANGES, IOS_LIMIT, ZMAN_ALERTS, eventNotifications, groupOf, holidayNotifications, planNotifications, type Group } from '../src/lib/alerts';
import { CITIES, findCity } from '../src/lib/cities';
import { addDays, eventOccursOn, eventsOn, fromKey } from '../src/lib/cal';
import { DEFAULT_SETTINGS, mergeSettings, type MyEvent, type Settings } from '../src/lib/store';

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
const allZmanim: Record<string, number> = Object.fromEntries(ZMAN_ALERTS.map((z) => [z.id, 15]));
const full: Settings = {
  ...DEFAULT_SETTINGS,
  nativeAlerts: true,
  candleAlert: true,
  havdalahAlert: true,
  fastAlerts: true,
  zmanAlerts: allZmanim,
};
const ev = (p: Partial<MyEvent>): MyEvent => ({ id: Math.random().toString(36).slice(2), title: 'אירוע', date: '1990-05-10', repeat: 'heb-yearly', color: '#000', ...p });

function validate(label: string, list: ReturnType<typeof planNotifications>['list'], now: Date) {
  check(list.length <= IOS_LIMIT, `${label}: ${list.length} <= ${IOS_LIMIT}`);
  const ids = new Set(list.map((n) => n.id));
  check(ids.size === list.length, `${label}: ids are unique`);
  for (const n of list) {
    check(Number.isInteger(n.id) && n.id > 0 && n.id < 2 ** 31, `${label}: id ${n.id} fits a Java int`);
    check(groupOf(n.id) === n.group, `${label}: id ${n.id} is in the ${n.group} range`);
    check(n.at.getTime() > now.getTime(), `${label}: ${n.title} is in the future`);
    check(n.title.length > 0 && n.body.length > 0, `${label}: has text`);
  }
  for (let i = 1; i < list.length; i++) check(list[i - 1].at <= list[i].at, `${label}: sorted by time`);
}

/* ---- 1. budget across a whole year, every day, worst case (everything on, many events) ---- */
const manyEvents = Array.from({ length: 40 }, (_, i) =>
  ev({ title: `יום הולדת ${i}`, date: `19${50 + (i % 40)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, remind: (['day', 'eve', 'week'] as const)[i % 3] }),
);
let maxLen = 0;
let minZmanDays = 99;
const t0 = Date.now();
for (let i = 0; i < 365; i += 3) {
  const now = new Date(2026, 10, 15 + i, 7, 30);
  for (const [city, events] of [
    [jlm, manyEvents],
    [ny, []],
  ] as const) {
    const plan = planNotifications({ now, city, settings: full, events: [...events] });
    validate(`${city.id} ${now.toDateString()}`, plan.list, now);
    maxLen = Math.max(maxLen, plan.list.length);
    minZmanDays = Math.min(minZmanDays, plan.zmanDays);
    check(plan.zmanDays >= 1, `${city.id} ${now.toDateString()}: at least today's zmanim (${plan.zmanDays})`);
  }
}
console.log(`year of plans with everything on: max ${maxLen} pending (limit ${IOS_LIMIT}), min ${minZmanDays} days of zmanim, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/* ---- 2. fewer zmanim → more days; nothing on → nothing ---- */
{
  const now = new Date(2026, 10, 16, 6, 0);
  const two = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, zmanAlerts: { shma: 15, sunset: 0 } }, events: [] });
  check(two.zmanDays === 10, `2 zmanim → 10 days (got ${two.zmanDays})`);
  check(two.list.length === 20, `2 zmanim × 10 days = 20 (got ${two.list.length})`);
  const all = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, zmanAlerts: allZmanim }, events: [] });
  check(all.zmanDays < 10 && all.zmanDays >= 4, `15 zmanim → fewer days (got ${all.zmanDays})`);
  check(all.list.length <= IOS_LIMIT, 'all zmanim within budget');
  const none = planNotifications({ now, city: jlm, settings: DEFAULT_SETTINGS, events: [] });
  check(none.list.length === 0, 'nothing switched on → nothing scheduled');
  // Friday alerts alone keep a long horizon, like before
  const fri = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, nativeAlerts: true }, events: [] });
  check(fri.fridayWeeks >= 50, `Friday alerts alone → ~a year (got ${fri.fridayWeeks})`);
  check(fri.list.every((n) => n.group === 'friday' && n.id >= 20260000 && n.id < 21000000 && n.at.getDay() === 5), 'Friday alerts keep their yyyymmdd ids');
  // with all zmanim on, Friday alerts still get the next 4 weeks
  const mix = planNotifications({ now, city: jlm, settings: full, events: [] });
  check(mix.fridayWeeks >= 4, `Friday alerts reserved (got ${mix.fridayWeeks})`);
}

/* ---- 3. the text ---- */
{
  const now = new Date(2026, 10, 16, 5, 0);
  const plan = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, zmanAlerts: { shma: 15 } }, events: [] });
  const n = plan.list[0];
  const s = `${n.title} · ${n.body}`;
  console.log('example:', s);
  check(/^סוף זמן ק״ש \(גר״א\) בעוד 15 דק׳ · \d\d:\d\d · ירושלים$/.test(s), 'zman text format');
  const zero = planNotifications({ now, city: jlm, settings: { ...DEFAULT_SETTINGS, zmanAlerts: { sunset: 0 } }, events: [] }).list[0];
  check(zero.title === 'שקיעה עכשיו', `offset 0 wording (${zero.title})`);
  // the notification fires exactly offset minutes before the displayed (rounded) time
  const hh = n.body.slice(0, 5);
  const fire = new Date(n.at.getTime() + 15 * 60000);
  const shown = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jerusalem' }).format(fire);
  check(shown === hh, `fires 15 min before the shown time (${shown} vs ${hh})`);
}

/* ---- 4. candle lighting / havdalah / fasts ---- */
{
  // week of Friday 20 Nov 2026 (Shabbat Vayetze), Jerusalem: 40 min custom
  const now = new Date(2026, 10, 16, 9, 0);
  const s: Settings = { ...DEFAULT_SETTINGS, candleAlert: true, candleAlertMins: 30, havdalahAlert: true };
  const list = holidayNotifications(new Date(2026, 10, 16, 12), 14, jlm, s, now);
  const candles = list.filter((n) => n.title.includes('הדלקת נרות'));
  const hav = list.filter((n) => n.title.startsWith('צאת'));
  console.log('example:', candles[0] && `${candles[0].title} · ${candles[0].body}`, '|', hav[0] && `${hav[0].title} · ${hav[0].body}`);
  check(candles.length === 2 && hav.length === 2, `2 Shabbatot in 2 weeks (${candles.length}, ${hav.length})`);
  check(candles[0].at.getDay() === 5 && candles[0].title === '🕯️ הדלקת נרות בעוד 30 דק׳', 'candle reminder on Friday');
  check(candles[0].body.includes('ויצא'), 'candle reminder names the parasha');
  check(hav[0].at.getDay() === 6 && hav[0].title === 'צאת השבת', 'havdalah on Saturday');

  // Asara BeTevet 5787 = Sunday 20 Dec 2026 (a dawn fast): announced the evening before at 21:00, end at tzeit
  const f = holidayNotifications(new Date(2026, 11, 14, 12), 14, jlm, { ...DEFAULT_SETTINGS, fastAlerts: true }, new Date(2026, 11, 14, 9));
  console.log('example:', f.map((n) => `${n.at.toDateString()} ${n.at.getHours()}:${String(n.at.getMinutes()).padStart(2, '0')} ${n.title} · ${n.body}`).join(' | '));
  const start = f.find((n) => n.title.startsWith('מחר'));
  check(start && start.at.getHours() === 21 && start.at.getDate() === 19, 'dawn fast announced at 21:00 the evening before');
  check(start && start.title.includes('עשרה בטבת'), 'fast is named');
  check(f.some((n) => n.title === 'סיום הצום' && n.at.getDate() === 20), 'end of fast notification');

  // Tisha B'Av 5787 starts at sunset on Wed 11 Aug 2027 → 30 min before
  const tb = holidayNotifications(new Date(2027, 7, 9, 12), 7, jlm, { ...DEFAULT_SETTINGS, fastAlerts: true }, new Date(2027, 7, 9, 9));
  console.log('example:', tb.map((n) => `${n.at.toDateString()} ${n.at.getHours()}:${String(n.at.getMinutes()).padStart(2, '0')} ${n.title} · ${n.body}`).join(' | '));
  check(tb.some((n) => n.title.includes('הצום מתחיל בעוד 30') && n.title.includes('באב')), "Tisha B'Av start 30 min before sunset");

  // Yom Tov: Pesach 5787 (Wed 21 Apr 2027 evening candles), abroad: 2 days → candles on two evenings
  const pesach = holidayNotifications(new Date(2027, 3, 19, 12), 14, ny, { ...DEFAULT_SETTINGS, candleAlert: true, havdalahAlert: true }, new Date(2027, 3, 19, 9));
  console.log('example:', pesach.map((n) => `${n.at.toDateString()} ${n.title} · ${n.body}`).join(' | '));
  check(pesach.filter((n) => n.title.includes('הדלקת נרות')).length >= 3, 'Yom Tov candle reminders (abroad, 2 days + Shabbat)');
  check(pesach.some((n) => n.title === 'צאת החג'), 'end of Yom Tov');
}

/* ---- 5. personal events: reminders, after-sunset, Hebrew recurrence ---- */
{
  const now = new Date(2026, 10, 15, 10, 0);
  // born 10 Kislev 5751 (= 27 Nov 1990) → 10 Kislev 5787 = Fri 20 Nov 2026
  const bday = ev({ title: 'יום הולדת לאבא', date: '1990-11-27', remind: 'day', remindTime: '08:00' });
  const r = eventNotifications(new Date(2026, 10, 15, 12), 60, [bday], now);
  console.log('example:', r.map((n) => `${n.at.toString().slice(0, 21)} ${n.title} · ${n.body}`).join(' | '));
  check(r.length === 1 && r[0].at.getDate() === 20 && r[0].at.getHours() === 8, 'day-of reminder at 08:00 on the Hebrew anniversary');
  check(r[0]?.body.includes('36 שנה'), 'years counted');
  const eve = eventNotifications(new Date(2026, 10, 15, 12), 60, [{ ...bday, remind: 'eve', remindTime: undefined }], now);
  check(eve[0]?.at.getDate() === 19 && eve[0]?.at.getHours() === 20, 'evening-before reminder at 20:00');
  const wk = eventNotifications(new Date(2026, 10, 10, 12), 60, [{ ...bday, remind: 'week' }], new Date(2026, 10, 10, 9));
  check(wk[0]?.at.getDate() === 13, 'week-before reminder');
  check(eventNotifications(new Date(2026, 10, 15, 12), 60, [{ ...bday, remind: 'none' }], now).length === 0, 'no reminder → nothing');

  // after sunset: 27 Nov 1990 evening = 11 Kislev → Sat 21 Nov 2026
  const late = { ...bday, afterSunset: true };
  const d20 = new Date(2026, 10, 20, 12);
  const d21 = new Date(2026, 10, 21, 12);
  check(eventOccursOn(bday, d20, new HDate(d20)) === 36 && eventOccursOn(bday, d21, new HDate(d21)) === null, 'before sunset → 10 Kislev');
  check(eventOccursOn(late, d21, new HDate(d21)) === 36 && eventOccursOn(late, d20, new HDate(d20)) === null, 'after sunset → 11 Kislev');
  // after-sunset does not move a Gregorian-yearly event
  const g = { ...late, repeat: 'greg-yearly' as const };
  const n27 = new Date(2026, 10, 27, 12);
  check(eventOccursOn(g, n27, new HDate(n27)) === 36, 'Gregorian yearly ignores sunset');
  // first occurrence of an after-sunset Hebrew event is the next Gregorian day
  check(eventsOn([late], fromKey('1990-11-28')).length === 1 && eventsOn([late], fromKey('1990-11-27')).length === 0, 'after-sunset original shows on the next day');

  // an event created from a Hebrew date: 30 Adar I in a leap year → recurs (birthday rule) in non-leap years
  const adar = ev({ date: new HDate(30, 12, 5784).greg().toISOString().slice(0, 10), repeat: 'heb-yearly' });
  let found = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(new Date(2026, 0, 1, 12), i);
    if (eventOccursOn(adar, d, new HDate(d)) !== null) found++;
  }
  check(found === 1, `Adar I anniversary found once in 400 days (${found})`);
}

/* ---- 6. old saved settings still load ---- */
{
  const old = { cityId: 'haifa', gps: null, candleMins: 30, havdalah: 'min42', theme: 'dark', alertTime: '09:00', nativeAlerts: true } as Partial<Settings>;
  const m = mergeSettings(old);
  check(m.cityId === 'haifa' && m.havdalah === 'min42' && m.nativeAlerts, 'old fields kept');
  check(m.textSize === 'normal' && !m.highContrast && m.place === null && Array.isArray(m.recentPlaces) && typeof m.zmanAlerts === 'object' && m.candleAlertMins === 30, 'new fields defaulted');
  check(mergeSettings(null as unknown as Settings).cityId === 'jerusalem', 'garbage → defaults');
  check(mergeSettings({ place: { name: 'x' } } as unknown as Settings).place === null, 'invalid place dropped');
}

/* ---- 7. id ranges don't overlap and stay inside a Java int ---- */
{
  const r = Object.entries(GROUP_RANGES) as [Group, readonly [number, number]][];
  for (const [a, ra] of r) for (const [b, rb] of r) if (a !== b) check(ra[1] <= rb[0] || rb[1] <= ra[0], `ranges ${a}/${b} disjoint`);
  check(Math.max(...r.map(([, x]) => x[1])) < 2 ** 31, 'ranges < 2^31');
  check(CITIES.length >= 50, 'cities list intact');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
