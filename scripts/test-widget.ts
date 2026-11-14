/** Tests for the widget data (run with TZ=Asia/Jerusalem): npm test */
import { CITIES } from '../src/lib/cities';
import { DEFAULT_SETTINGS } from '../src/lib/store';
import { buildWidgetData, widgetView } from '../src/lib/widget';

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

console.log(`widget: ${data.days.length} days, ${Math.round(size / 1024)} KB json, built in ${ms} ms`);
console.log('example:', JSON.stringify(morning));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
