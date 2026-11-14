/**
 * Tests for the offline worldwide location search (src/data/places.txt + src/lib/places.ts):   npm test
 */
import { readFileSync, statSync } from 'node:fs';
import { CITIES } from '../src/lib/cities';
import { addDays, dayItems, zmanim } from '../src/lib/cal';
import { planNotifications, ZMAN_ALERTS } from '../src/lib/alerts';
import { parsePlaces, placeToCity, searchPlaces, nearestPlace } from '../src/lib/places';
import { DEFAULT_SETTINGS } from '../src/lib/store';

let failed = 0;
let passed = 0;
function check(cond: unknown, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log('  FAIL ' + msg);
  }
}

const file = new URL('../src/data/places.txt', import.meta.url);
const bytes = statSync(file).size;
const t0 = performance.now();
const db = parsePlaces(readFileSync(file, 'utf8'));
const parseMs = performance.now() - t0;
console.log(`places.txt: ${(bytes / 1024).toFixed(0)} KB, ${db.places.length} places, parsed in ${parseMs.toFixed(0)} ms`);
check(bytes < 1.5 * 1024 * 1024, 'data file < 1.5 MB');
check(db.places.length > 20000, 'more than 20,000 places');

// every zone is a real IANA zone
const zones = new Set(db.places.map((p) => p.tz));
for (const z of zones) {
  let ok = true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: z });
  } catch {
    ok = false;
  }
  check(ok, `valid time zone ${z}`);
}
check(db.places.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.name && /^[A-Z]{2}$/.test(p.cc)), 'coordinates and country codes');

// Israel: every locality, Israeli time, Eretz Yisrael
const il = db.places.filter((p) => p.cc === 'IL' || p.cc === 'PS');
check(il.length > 700, `all Israeli localities (${il.length})`);
check(il.every((p) => p.tz === 'Asia/Jerusalem'), 'IL/PS on Asia/Jerusalem');
check(il.every((p) => placeToCity(p).il), 'IL/PS are Eretz Yisrael');

// the hand-made cities are tagged (Beitar Illit is not in GeoNames)
for (const c of CITIES) {
  if (c.id === 'beitar') continue;
  const p = db.places.find((x) => x.cityId === c.id);
  check(p, `hand-made city ${c.id} is in the gazetteer`);
  if (p) {
    check(placeToCity(p) === c, `${c.id} keeps its Hebrew name / elevation / candle custom`);
    check(p.tz === c.tz, `${c.id} zone ${p.tz} = ${c.tz}`);
  }
}

// search
const first = (q: string) => {
  const h = searchPlaces(db, q)[0];
  return h ? (h.city ?? placeToCity(h.place!)) : null;
};
check(first('london')?.id === 'london', 'london → לונדון');
check(first('jerusalem')?.name === 'ירושלים', 'jerusalem → ירושלים');
check(first('ירו')?.name === 'ירושלים', 'ירו → ירושלים');
check(first('montreal')?.name === 'מונטריאול', 'accents ignored (Montréal)');
check(first('raanana')?.name === 'רעננה', "apostrophes ignored (Ra'anana)");
check(first('springfield, illinois')?.lat.toFixed(1) === '39.8', 'region filter (Springfield, Illinois)');
check(first('springfield, massachusetts')?.lat.toFixed(1) === '42.1', 'region filter (Springfield, Massachusetts)');
check(first('sydney')?.tz === 'Australia/Sydney', 'Sydney → Australia/Sydney');
check(first('boca raton')?.tz === 'America/New_York', 'Boca Raton → America/New_York');
check(first('efrat')?.il === true, 'Efrata (PS) → Eretz Yisrael');
const fr = searchPlaces(db, 'צרפת').map((h) => h.city ?? placeToCity(h.place!));
check(fr[0]?.name === 'פריז' && fr.length > 10, `Hebrew country name lists its cities, Paris first (${fr[0]?.name})`);
check(searchPlaces(db, 'xqzxqz').length === 0, 'no match → empty');
const ts = performance.now();
for (const q of ['a', 'new', 'tel', 'san', 'בני', 'ישראל']) searchPlaces(db, q);
console.log(`6 searches in ${(performance.now() - ts).toFixed(0)} ms`);

// GPS naming
const near = nearestPlace(db, 31.7, 35.12); // near Beitar Illit
check(near && near.km < 3, 'nearest place to a GPS fix');

// a new place: sea level, local candle custom
const sydney = first('sydney')!;
check(sydney.elev === 0 && sydney.candle === 18 && !sydney.il, 'new place: elevation 0, 18 min, abroad');

// the far north: polar night / midnight sun must not break zmanim, the calendar or the notification plan
for (const name of ['tromso', 'murmansk', 'reykjavik', 'anchorage', 'ushuaia']) {
  const c = first(name);
  check(c, `found ${name}`);
  if (!c) continue;
  let threw = '';
  try {
    for (let i = 0; i < 366; i += 2) {
      const d = addDays(new Date(2026, 0, 1, 12), i);
      zmanim(d, c, DEFAULT_SETTINGS);
      dayItems(d, c, DEFAULT_SETTINGS);
    }
    for (const m of [0, 5, 11]) {
      const s = { ...DEFAULT_SETTINGS, nativeAlerts: true, candleAlert: true, havdalahAlert: true, fastAlerts: true, zmanAlerts: Object.fromEntries(ZMAN_ALERTS.map((z) => [z.id, 5])) };
      const plan = planNotifications({ now: new Date(2026, m, 20, 8), city: c, settings: s, events: [] });
      check(plan.list.length <= 64, `${name} plan within budget`);
    }
  } catch (e) {
    threw = String(e);
  }
  check(!threw, `${name} all year without errors ${threw}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
