/** Tests for the widget data (run with TZ=Asia/Jerusalem): npm test */
import { CITIES } from '../src/lib/cities';
import { DEFAULT_SETTINGS } from '../src/lib/store';
import { gematriya } from '@hebcal/core';
import { EMPTY_STATE, mark } from '../src/lib/seasons/omer';
import { setLang } from '../src/lib/i18n';
import { timeFmt } from '../src/lib/cal';
import { CELL, buildWidgetData, omerGem, omerWeeksHe, omerWidgetModel, widgetModel, widgetOmer, widgetView, type WidgetData } from '../src/lib/widget';

let pass = 0;
let fail = 0;
const ok = (c: boolean, msg: string) => (c ? pass++ : (fail++, console.log('FAIL', msg)));

const jer = CITIES.find((c) => c.id === 'jerusalem')!;
const t0 = Date.now();
const data = buildWidgetData(new Date(2026, 10, 20, 12), 60, jer, DEFAULT_SETTINGS);
const ms = Date.now() - t0;
const size = JSON.stringify(data).length;
ok(data.days.length === 60, '60 days');
ok(size < 120_000, `json size ${size}`);
for (const d of data.days) {
  ok(d.z.length >= 9, `zmanim count ${d.d}`);
  ok(d.z.every((z, i) => i === 0 || z.t >= d.z[i - 1].t), `sorted ${d.d}`);
  ok(d.h !== d.he, `hebrew date changes at sunset ${d.d}`);
}

// Friday 20 Nov 2026, 10:15 in Jerusalem
const morning = widgetView(data, new Date('2026-11-20T10:15:00+02:00'))!;
ok(morning.hebrew === 'י׳ כסלו תשפ״ז', `morning hebrew ${morning.hebrew}`);
ok(!morning.eve, 'morning not eve');
ok(morning.label === 'ערב שבת קודש', `label ${morning.label}`);
ok(morning.next?.n === 'חצות היום', `next zman ${morning.next?.n}`);
ok(/פרשת ויצא · 15:57–17:16/.test(morning.shabbat), `shabbat line ${morning.shabbat}`);

// same Friday after sunset: Hebrew date already 11 Kislev, next is tzeit
const evening = widgetView(data, new Date('2026-11-20T16:45:00+02:00'))!;
ok(evening.eve && evening.hebrew === 'י״א כסלו תשפ״ז', `evening hebrew ${evening.hebrew}`);
ok(evening.next?.n === 'צאת הכוכבים', `evening next ${evening.next?.n}`);

// late night: next zman comes from tomorrow's list
const night = widgetView(data, new Date('2026-11-20T23:59:00+02:00'))!;
ok(night.next?.n === 'עלות השחר', `night next ${night.next?.n}`);

// outside the prepared range
ok(widgetView(data, new Date('2027-03-01T10:00:00+02:00')) === null, 'out of range -> null');

/* ---------------- the redesigned widget: widgetModel (mirrors WidgetModel.java) ---------------- */
for (const d of data.days) {
  ok(d.sk.length === 4 && d.sk.every((t, i) => i === 0 || t > d.sk[i - 1]), `sky times in order ${d.d}`);
  ok(/^אור ל(שבת|יום )/.test(d.o), `night label ${d.d} ${d.o}`);
  if (d.z.some((z) => z.n === 'צאת השבת')) ok(!d.z.some((z) => z.n === 'צאת הכוכבים'), `havdalah replaces tzeit ${d.d}`);
}
const vayetze = data.hol.find((h) => h.n === 'שבת פרשת ויצא');
ok(!!vayetze && vayetze.cs === '15:57' && vayetze.hs === '17:16' && !vayetze.hw, `holy window ${JSON.stringify(vayetze)}`);
ok(data.hol.every((h, i) => h.h > h.c && (i === 0 || h.c > data.hol[i - 1].h)), 'holy windows in order, apart');

const fri = widgetModel(data, new Date('2026-11-20T10:15:00+02:00'))!;
ok(fri.dayMonth === 'י׳ כסלו' && fri.year === 'תשפ״ז', `model date ${fri.dayMonth} | ${fri.year}`);
ok(fri.side === 'ערב שבת קודש' && fri.sideKind === 'label', `model side ${fri.side}`);
ok(fri.next?.name === 'חצות היום' && fri.next.time === '11:25', `model next ${JSON.stringify(fri.next)}`);
ok(!!fri.holy && fri.holy.candlesToday && !fri.holy.inside && fri.holy.candles === '15:57' && fri.holy.havdalah === '17:16', `model holy ${JSON.stringify(fri.holy)}`);
ok(fri.list.items.length === 10 && !fri.list.tomorrow, `model list ${fri.list.items.length}`);
ok(fri.list.items.filter((x) => x.state === 'next').length === 1 && fri.list.items.find((x) => x.state === 'next')?.name === 'חצות היום', 'model list next');
ok(fri.list.items.some((x) => x.name === 'הדלקת נרות'), 'model list has candle lighting');
ok(fri.sky.dawn < fri.sky.sunrise && fri.sky.sunrise < fri.sky.now && fri.sky.now < fri.sky.sunset && fri.sky.sunset < fri.sky.dusk, `model sky ${JSON.stringify(fri.sky)}`);
ok(fri.wake > Date.parse('2026-11-20T10:15:00+02:00') && fri.wake <= Date.parse('2026-11-20T10:30:00+02:00'), 'model wakes within a quarter of an hour');

const friEve = widgetModel(data, new Date('2026-11-20T16:45:00+02:00'))!;
ok(friEve.eve && friEve.dayMonth === 'י״א כסלו' && friEve.side === 'אור לשבת' && friEve.sideKind === 'night', `model eve ${friEve.dayMonth} ${friEve.side}`);
ok(!!friEve.holy?.inside && !friEve.holy.candlesToday, 'model inside Shabbat');

const sat = widgetModel(data, new Date('2026-11-21T12:00:00+02:00'))!;
ok(sat.sideKind === 'city' && sat.side === jer.name, `model Shabbat side ${sat.side} (the parasha is already in the Shabbat column)`);
ok(sat.holy?.name === 'שבת פרשת ויצא' && sat.holy.inside, 'model Shabbat holy');
ok(sat.list.items.some((x) => x.name === 'צאת השבת') && !sat.list.items.some((x) => x.name === 'צאת הכוכבים'), 'model Shabbat list');

const motzash = widgetModel(data, new Date('2026-11-21T20:00:00+02:00'))!;
ok(motzash.list.tomorrow && motzash.list.items[0].state === 'next', 'model after the last zman: tomorrow, first is next');
ok(motzash.holy?.name === 'שבת פרשת וישלח' && !motzash.holy.inside, `model next week ${motzash.holy?.name}`);
ok(widgetModel(data, new Date('2027-03-01T10:00:00+02:00')) === null, 'model out of range -> null');

// Rosh Hashana 5788 is on Shabbat and Sunday (2–3.10.2027): one window from Friday's candles to havdalah on Sunday night
const rh = buildWidgetData(new Date(2027, 8, 26, 12), 14, jer, DEFAULT_SETTINGS);
const rhw = rh.hol.find((h) => h.n.includes('ראש השנה'));
ok(!!rhw && rhw.hw === 'א׳', `Rosh Hashana window ${JSON.stringify(rhw)}`);
const rhDay = widgetModel(rh, new Date('2027-10-03T12:00:00+03:00'))!;
ok(!!rhDay.holy?.inside && rhDay.holy.havdalah.startsWith('א׳ '), `Rosh Hashana model ${JSON.stringify(rhDay.holy)}`);
const rhEve = widgetModel(rh, new Date('2027-10-01T10:00:00+03:00'))!;
ok(rhEve.holy?.candlesToday === true, 'erev Rosh Hashana: candles today');

/* ---------------- the Omer widget: omerWidgetModel (mirrors OmerWidgetModel.java) ---------------- */
ok(!!data.om && data.om.t.length === 50 && data.om.y === 5787, 'widget data carries the coming Omer (5787)');
ok(JSON.stringify(data.om).length < 5000, `omer block is small: ${JSON.stringify(data.om).length} bytes`);
ok(data.lang === 'he' && data.om!.l === 'he' && data.om!.ct!.length === 49 && data.om!.st === 'ליל ט״ז בניסן · 22 באפריל', `omer texts: ${data.om!.st}`);
ok(data.om!.ct![32] === 'היום שלושה ושלושים יום, שהם ארבעה שבועות וחמישה ימים לעומר', `count line (sefard): ${data.om!.ct![32]}`);
ok(buildWidgetData(new Date(2026, 10, 20, 12), 1, jer, { ...DEFAULT_SETTINGS, seasons: { omer: { nusach: 'ashkenaz' } } }).om!.ct![32].endsWith('בעומר'), 'count line (ashkenaz): בעומר');
for (let n = 1; n <= 49; n++) ok(omerGem(n) === gematriya(n), `widget gematria ${n}: ${omerGem(n)} = ${gematriya(n)}`);
ok(omerWeeksHe(1) === 'יום אחד' && omerWeeksHe(7) === 'שבוע אחד' && omerWeeksHe(8) === 'שבוע אחד ויום אחד' && omerWeeksHe(33) === '4 שבועות ו־5 ימים' && omerWeeksHe(49) === '7 שבועות', 'widget weeks text');

// Pesach 5787: 15 Nisan is Thursday 22.4.2027; the count begins at that night's nightfall
let st = EMPTY_STATE;
for (let k = 1; k <= 32; k++) if (![2, 9, 16, 23, 30, 20].includes(k)) st = mark(st, 5787, k, 'night', 0);
const om = widgetOmer(new Date(2027, 3, 1, 12), jer, DEFAULT_SETTINGS, st);
const ow = (iso: string) => omerWidgetModel({ om } as WidgetData, new Date(iso))!;
ok(om.t.every((t, i) => i === 0 || t - om.t[i - 1] > 23 * 3600000), 'one nightfall a day');
ok(new Date(om.t[0]).getDate() === 22 && new Date(om.t[0]).getHours() === 19, `first count: the evening of 22.4 (${new Date(om.t[0])})`);
const before = ow('2027-04-10T12:00:00+03:00');
ok(before.state === 'before' && before.pre === 'בעוד' && before.num === '12' && before.post === 'ימים' && before.sefira === 'ספירת העומר' && before.sub === 'ליל ט״ז בניסן · 22 באפריל' && before.cells[0] === CELL.today && before.n === 0, `before: ${before.pre} ${before.num} ${before.post} · ${before.sub}`);
const tomorrow = ow('2027-04-21T12:00:00+03:00');
const tonight = ow('2027-04-22T12:00:00+03:00');
ok(ow('2027-04-20T12:00:00+03:00').num === 'יומיים' && ow('2027-04-20T12:00:00+03:00').pre === 'בעוד', 'before: בעוד יומיים');
ok(tomorrow.num === 'מחר' && tomorrow.post === 'בערב' && tonight.num === 'הלילה' && /^ליל ט״ז בניסן · 19:\d\d$/.test(tonight.sub), `before: tomorrow evening, tonight (${tonight.sub})`);
const first = ow('2027-04-22T21:00:00+03:00');
ok(first.state === 'count' && first.n === 1 && first.num === 'א׳' && first.sefira === 'חסד שבחסד' && first.sub === 'היום יום אחד לעומר' && !first.next && !first.band, `first night: ${first.num} ${first.sefira} ${first.sub}`);
// Lag BaOmer: day 33 begins at nightfall on Monday 24.5; at 17:00 it is still day 32
const day32 = ow('2027-05-24T17:00:00+03:00');
const lag = ow('2027-05-24T21:00:00+03:00');
ok(day32.n === 32 && lag.n === 33 && lag.num === 'ל״ג' && lag.sefira === 'הוד שבהוד' && lag.sub === 'היום שלושה ושלושים יום, שהם ארבעה שבועות וחמישה ימים לעומר' && lag.week === 5, `day turns at nightfall: ${day32.n} → ${lag.n} ${lag.sefira}`);
ok(day32.cells[31] === CELL.todayCounted && lag.cells[32] === CELL.today && lag.cells[31] === CELL.counted, 'the day of now: counted, then tonight');
ok(lag.cells[19] === CELL.missed && lag.cells[1] === CELL.assumed && lag.cells[40] === CELL.future, 'missed day 20, Shabbat assumed, the future empty');
ok(day32.wake <= om.t[32] + 1000 && day32.wake > Date.parse('2027-05-24T17:00:00+03:00'), 'the widget wakes at nightfall');
const after = ow('2027-06-13T12:00:00+03:00');
ok(after.state === 'after' && after.num === '26' && after.post === 'מתוך 49' && after.sub === 'הספירה הושלמה' && after.week === 0, `after: ${after.num} ${after.post}`);
const none = omerWidgetModel({ om: widgetOmer(new Date(2027, 3, 1, 12), jer, DEFAULT_SETTINGS) } as WidgetData, new Date('2027-05-03T10:00:00+03:00'))!;
ok(none.cells.slice(0, none.n - 1).every((c) => c === CELL.passed) && none.cells[none.n - 1] === CELL.today, 'no marks: the days that went by are quiet, none missed');
// two weeks after Shavuot the widget moves on to next year's count
ok(widgetOmer(new Date(2027, 5, 30, 12), jer, DEFAULT_SETTINGS).y === 5788, 'after the season: next year');
ok(omerWidgetModel({} as WidgetData, new Date()) === null, 'no Omer data: null');

// before nightfall: the sky from dawn to the next count, and its hour; none after nightfall (the next count is tomorrow's)
const may = buildWidgetData(new Date(2027, 4, 20, 12), 10, jer, DEFAULT_SETTINGS, st);
const owd = (iso: string) => omerWidgetModel(may, new Date(iso))!;
const lagDay = owd('2027-05-25T15:46:00+03:00');
ok(lagDay.n === 33 && !!lagDay.band && !!lagDay.next && lagDay.next.label === 'הספירה הבאה' && lagDay.next.time === timeFmt(jer.tz).format(new Date(may.om!.t[33])), `day: next count ${lagDay.next?.time}`);
ok(lagDay.band!.from === may.days.find((d) => d.d === '2027-05-25')!.sk[0] && lagDay.band!.to === may.om!.t[33], 'day: the sky from dawn to nightfall');
ok(lagDay.wake <= Date.parse('2027-05-25T16:06:00+03:00'), 'day: the sky moves (wake within twenty minutes)');
const lagNight = owd('2027-05-24T21:00:00+03:00');
ok(lagNight.n === 33 && !lagNight.band && !lagNight.next, 'night: no sky, the next count is tomorrow');
ok(!owd('2027-05-25T03:00:00+03:00').band && owd('2027-05-25T03:00:00+03:00').wake <= may.days.find((d) => d.d === '2027-05-25')!.sk[0] + 1000, 'before dawn: no sky, wake at dawn');
// done: the day of now marked in the app
const st33 = mark(st, 5787, 33, 'night', 0);
const done = omerWidgetModel(buildWidgetData(new Date(2027, 4, 24, 12), 3, jer, DEFAULT_SETTINGS, st33), new Date('2027-05-24T21:00:00+03:00'))!;
ok(done.done && done.doneText === 'ספרתי' && done.cells[32] === CELL.todayCounted && !lagNight.done, 'done: ספרתי');
// the week's labels are the sefirot
ok(lag.weeks.join(' ') === 'חסד גבורה תפארת נצח הוד יסוד מלכות', 'weeks');
// English: digits, the sefira in transliteration, the count in English
setLang('en');
const en = buildWidgetData(new Date(2027, 4, 20, 12), 10, jer, DEFAULT_SETTINGS, st);
setLang('he');
const enLag = omerWidgetModel(en, new Date('2027-05-25T15:46:00+03:00'))!;
ok(en.lang === 'en' && !enLag.he && enLag.num === '33' && enLag.sefira === "Hod sheb'Hod" && enLag.sub === 'Today is 33 days, which are 4 weeks and 5 days of the Omer' && enLag.next?.label === 'Next count', `English: ${enLag.num} ${enLag.sefira} · ${enLag.sub}`);
ok(en.om!.st === 'Night of 16 Nisan · April 22' && enLag.weeks[4] === 'Hod', `English start: ${en.om!.st}`);

console.log(`widget: ${data.days.length} days, ${Math.round(size / 1024)} KB json, built in ${ms} ms`);
console.log('example:', JSON.stringify(morning));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
