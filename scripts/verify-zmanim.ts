/**
 * Accuracy test. The app computes zmanim with KosherJava (kosher-zmanim) and the
 * calendar (Hebrew dates, holidays, candle lighting, havdalah) with Hebcal.
 * This script checks each one against the *other* library, for every city and
 * every day of a full year:
 *
 *   npm run verify
 *
 * Exits with code 1 on any disagreement beyond TOLERANCE seconds.
 */
import * as KZ from 'kosher-zmanim';
import { HDate, Location, Zmanim } from '@hebcal/core';
import { CITIES } from '../src/lib/cities';
import { addDays, dayItems, zmanim } from '../src/lib/cal';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/store';

const TOLERANCE = 5; // seconds
const START = new Date(2026, 10, 1, 12);
const DAYS = 366;

// Hebcal equivalents of every zman the app shows
const HEBCAL: Record<string, (z: Zmanim) => Date> = {
  alot: (z) => z.alotHaShachar(),
  misheyakir: (z) => z.misheyakir(),
  sunrise: (z) => z.sunrise(),
  shmaMGA: (z) => z.sofZmanShmaMGA(),
  shma: (z) => z.sofZmanShma(),
  tfillaMGA: (z) => z.sofZmanTfillaMGA(),
  tfilla: (z) => z.sofZmanTfilla(),
  minchaG: (z) => z.minchaGedola(),
  minchaK: (z) => z.minchaKetana(),
  plag: (z) => z.plagHaMincha(),
  sunset: (z) => z.sunset(),
  tzeit: (z) => z.tzeit(8.5),
  tzeitRT: (z) => {
    const t = z.tzeit72();
    return t ? new Date(t.epochMilliseconds) : new Date(NaN);
  },
  chametzEat: (z) => z.sofZmanTfilla(),
  chametzBurn: (z) => z.sofZmanBiurChametzGRA(),
};

let checked = 0;
let knownElevMGA = 0;
let worst = 0;
let worstAt = '';
const failures: string[] = [];
const fail = (s: string) => failures.push(s);

function checkZmanim(label: string, settings: Settings, cities = CITIES) {
  for (const city of cities) {
    const elev = settings.useElevation ? Math.max(0, city.elev) : 0;
    const loc = new Location(city.lat, city.lon, city.il, city.tz, city.name, undefined, undefined, elev);
    for (let i = 0; i < DAYS; i++) {
      const d = addDays(START, i);
      const app = zmanim(d, city, settings);
      const z = new Zmanim(loc, d, settings.useElevation);
      for (const row of app.rows) {
        if (row.id === 'chatzot' || row.id === 'chatzotNight') {
          // Different definitions: KosherJava = the sun's meridian transit; Hebcal = midpoint of sunrise and sunset.
          // They differ by up to ~1 minute; check they stay within that band.
          const ref = row.id === 'chatzot' ? z.chatzot() : new Date(z.chatzot().getTime() + 12 * 3600000);
          if (Math.abs(row.time.getTime() - ref.getTime()) > 60000) fail(`${label} ${city.id} ${d.toDateString()} ${row.id} differs > 60s`);
          continue;
        }
        if (settings.useElevation && (row.id === 'shmaMGA' || row.id === 'tfillaMGA')) {
          // Known definitional difference: with elevation on, KosherJava counts the 72 minutes from the
          // elevation-adjusted sunrise (earlier, i.e. stricter); Hebcal always uses sea-level sunrise.
          knownElevMGA++;
          continue;
        }
        const ref = HEBCAL[row.id]?.(z);
        if (!ref) throw new Error('no reference for ' + row.id);
        if (isNaN(ref.getTime())) continue;
        const diff = Math.abs(row.time.getTime() - ref.getTime()) / 1000;
        checked++;
        if (diff > worst) {
          worst = diff;
          worstAt = `${label} ${city.id} ${d.toDateString()} ${row.id}`;
        }
        if (diff > TOLERANCE) fail(`${label} ${city.id} ${d.toDateString()} ${row.id}: app ${row.time.toISOString()} hebcal ${ref.toISOString()} (${diff.toFixed(0)}s)`);
      }
    }
  }
}

checkZmanim('sea-level', DEFAULT_SETTINGS);
checkZmanim(
  'elevation',
  { ...DEFAULT_SETTINGS, useElevation: true },
  CITIES.filter((c) => c.il),
);

// Candle lighting and havdalah (Hebcal) vs KosherJava, Friday/Saturday, every city
let shabbatChecks = 0;
for (const city of CITIES) {
  const czc = new KZ.ComplexZmanimCalendar(new KZ.GeoLocation(city.name, city.lat, city.lon, 0, city.tz));
  czc.setCandleLightingOffset(city.candle);
  for (let i = 0; i < DAYS; i++) {
    const d = addDays(START, i);
    if (d.getDay() !== 5 && d.getDay() !== 6) continue;
    czc.setDate(d);
    const items = dayItems(d, city, { ...DEFAULT_SETTINGS, showLearning: false });
    const cl = items.find((x) => x.kind === 'candles');
    if (d.getDay() === 5 && cl?.time) {
      const ref = czc.getCandleLighting()!.toJSDate();
      shabbatChecks++;
      // Hebcal publishes these rounded down to the whole minute
      if (Math.abs(cl.time.getTime() - ref.getTime()) > 60000) fail(`${city.id} ${d.toDateString()} candles: app ${cl.time.toISOString()} kosherjava ${ref.toISOString()}`);
    }
    const hv = items.find((x) => x.kind === 'havdalah');
    if (d.getDay() === 6 && hv?.time) {
      const ref = czc.getTzaisGeonim8Point5Degrees()!.toJSDate();
      shabbatChecks++;
      if (Math.abs(hv.time.getTime() - ref.getTime()) > 60000) fail(`${city.id} ${d.toDateString()} havdalah: app ${hv.time.toISOString()} kosherjava ${ref.toISOString()}`);
    }
  }
}

// Hebrew dates 1950–2100, and Yom Tov days in Israel and abroad, vs KosherJava's JewishCalendar
let dateChecks = 0;
for (let d = new Date(1950, 0, 1, 12); d.getFullYear() < 2100; d = addDays(d, 1)) {
  const h = new HDate(d);
  const jc = new KZ.JewishCalendar(d);
  dateChecks++;
  if (h.getDate() !== jc.getJewishDayOfMonth() || h.getMonth() !== jc.getJewishMonth() || h.getFullYear() !== jc.getJewishYear()) {
    fail(`Hebrew date ${d.toDateString()}: app ${h.toString()} kosherjava ${jc.toString()}`);
  }
}
for (const il of [true, false]) {
  const city = CITIES.find((c) => c.il === il)!;
  for (let i = 0; i < 365 * 5; i++) {
    const d = addDays(new Date(2026, 0, 1, 12), i);
    const jc = new KZ.JewishCalendar(d);
    jc.setInIsrael(il);
    const app = dayItems(d, city, { ...DEFAULT_SETTINGS, showLearning: false }).some((x) => x.kind === 'yomtov');
    dateChecks++;
    if (app !== jc.isYomTovAssurBemelacha()) fail(`Yom Tov ${il ? 'IL' : 'abroad'} ${d.toDateString()}: app ${app} kosherjava ${jc.isYomTovAssurBemelacha()}`);
  }
}

console.log(`zmanim compared with Hebcal: ${checked.toLocaleString()} (${CITIES.length} cities × ${DAYS} days, sea level + elevation)`);
console.log(`(not compared: ${knownElevMGA.toLocaleString()} MGA times in elevation mode, where the two libraries define them differently)`);
console.log(`largest difference: ${worst.toFixed(1)} s  [${worstAt}]`);
console.log(`candle lighting / havdalah compared with KosherJava: ${shabbatChecks.toLocaleString()}`);
console.log(`Hebrew dates (1950–2100) and Yom Tov days compared with KosherJava: ${dateChecks.toLocaleString()}`);
if (failures.length) {
  console.log(`\n${failures.length} mismatches:`);
  const groups = new Map<string, number>();
  for (const f of failures) {
    const k = f.replace(/ \w{3} \w{3} \d\d \d{4}/, "").replace(/:.*$/, "").replace(/ [a-z-]+ (?=\w+$)/, " * ");
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  console.log(Object.fromEntries(groups));
  for (const f of failures.slice(0, 40)) console.log('  ' + f);
  process.exit(1);
}
console.log('OK: both libraries agree on every value.');
