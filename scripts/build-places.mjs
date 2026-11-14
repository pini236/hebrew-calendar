/**
 * Builds src/data/places.txt — the offline worldwide location search (gazetteer).
 *
 *   npm i --no-save cities.json@1.1.66 all-the-cities@3.1.0 geo-tz@8.1.11
 *   node scripts/build-places.mjs
 *
 * The three packages are only needed to regenerate the file (the result is committed),
 * so they are deliberately not in package.json: the app build and CI never download them.
 *
 * Sources (all GeoNames, CC BY 4.0):
 *  - cities.json: names, coordinates and country of every GeoNames place with population > 1000.
 *    The same data the coordinates in src/lib/cities.ts were taken from. It has no population and no time zone.
 *  - all-the-cities: the same GeoNames dump with population. Joined to cities.json by country + name +
 *    coordinates (within ~1 km) to decide which places to keep.
 *  - geo-tz: time zone of each point from the timezone-boundary-builder polygons (point-in-polygon).
 *    This is exact for land points, so no country → zone guessing is needed. If geo-tz returns nothing
 *    or only an "Etc/" sea zone (a point just off the coast), the most common zone of that country's
 *    other places is used.
 *
 * What is kept:
 *  - every place with population >= MIN_POP
 *  - every place in Israel (IL) and in Judea, Samaria and Gaza (PS), whatever its size. All of them get
 *    Asia/Jerusalem (geo-tz says Asia/Hebron or Asia/Gaza for PS, whose DST dates differ from Israel's;
 *    the Jewish towns there keep Israeli time) and are treated as Eretz Yisrael (one day Yom Tov).
 *  - places that are one of the hand-made cities in src/lib/cities.ts are tagged with that city's id,
 *    so choosing them keeps the Hebrew name, elevation and candle-lighting custom.
 *
 * Format (UTF-8 text, one place per line, biggest population first):
 *   line 1: "#tz" TAB zone|zone|…
 *   line 2: "#a1" TAB region|region|…        (first-level region names, e.g. "New York", "England")
 *   then:   name TAB country TAB regionIndex TAB lat TAB lon TAB zoneIndex [TAB cityId]
 * lat/lon have 3 decimals (~100 m, under half a second of sunrise/sunset).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MIN_POP = 15000;
const OUT = new URL('../src/data/places.txt', import.meta.url);

const cities = require('cities.json/cities.json');
const admin1 = require('cities.json/admin1.json');
const allTheCities = require('all-the-cities');
const { find: findTz } = require('geo-tz');

// the hand-made list (id, lat, lon) from src/lib/cities.ts, read as text to avoid a TS loader
const src = readFileSync(new URL('../src/lib/cities.ts', import.meta.url), 'utf8');
const handMade = [...src.matchAll(/^\s*[cw]\('([^']+)', (?:'[^']*'|"[^"]*"), (-?[\d.]+), (-?[\d.]+)/gm)].map((m) => ({ id: m[1], lat: +m[2], lon: +m[3] }));
if (handMade.length < 50) throw new Error('could not read src/lib/cities.ts');

const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// population lookup: the two packages are different GeoNames snapshots, so a place may have been
// re-spelled (Rishon LeTsiyyon / Rishon LeẔiyyon) or nudged a few hundred metres (Haifa).
// Match on a 0.2° grid in the same country: same letters within ~20 km, or same first 4 letters within ~3 km.
const key = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const grid = new Map();
const cell = (country, lat, lon) => `${country}|${Math.floor(lat * 5)}|${Math.floor(lon * 5)}`;
for (const c of allTheCities) {
  const [lon, lat] = c.loc.coordinates;
  const k = cell(c.country, lat, lon);
  const v = { lat, lon, pop: c.population, key: key(c.name), section: c.featureCode === 'PPLX' };
  const arr = grid.get(k);
  if (arr) arr.push(v);
  else grid.set(k, [v]);
}
function population(c) {
  const k = key(c.name);
  let best = 0;
  let section = false;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      for (const v of grid.get(cell(c.country, c.lat + i / 5, c.lon + j / 5)) ?? []) {
        const d = Math.max(Math.abs(v.lat - c.lat), Math.abs(v.lon - c.lon));
        // (re-spelled: same first 4 letters and about the same length, so "Paris 01 Louvre" is not "Paris")
        const same = v.key === k ? d < 0.2 : d < 0.03 && k.length >= 4 && v.key.slice(0, 4) === k.slice(0, 4) && Math.abs(v.key.length - k.length) <= 3;
        if (same && v.pop >= best) {
          best = v.pop;
          section = v.section;
        }
      }
    }
  return { pop: best, section };
}

const regionName = new Map(admin1.map((a) => [a.code, a.name]));
const ERETZ = new Set(['IL', 'PS']);

let kept = [];
for (const raw of cities) {
  const c = { name: raw.name.trim(), country: raw.country, lat: +raw.lat, lon: +raw.lng, admin1: raw.admin1 };
  if (!c.name || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
  Object.assign(c, population(c));
  if (c.pop >= MIN_POP || ERETZ.has(c.country)) kept.push(c);
}

// time zones
const byCountry = new Map();
for (const c of kept) {
  c.tz = ERETZ.has(c.country) ? 'Asia/Jerusalem' : findTz(c.lat, c.lon)[0] ?? null;
  if (c.tz && !c.tz.startsWith('Etc/')) {
    const m = byCountry.get(c.country) ?? new Map();
    m.set(c.tz, (m.get(c.tz) ?? 0) + 1);
    byCountry.set(c.country, m);
  }
}
let tzFallbacks = 0;
for (const c of kept) {
  if (c.tz && !c.tz.startsWith('Etc/')) continue;
  const m = byCountry.get(c.country);
  const best = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : c.tz;
  if (!best) throw new Error('no time zone for ' + c.name + ' ' + c.country);
  c.tz = best;
  tzFallbacks++;
}

// hand-made cities (their coordinates come from GeoNames): tag the same place (within 500 m)
const km = (a1, o1, a2, o2) => {
  const r = Math.PI / 180;
  const h = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// Beitar Illit is not in GeoNames (its coordinates are hand-entered); the village 400 m away is another place
const NOT_IN_GEONAMES = new Set(['beitar']);
for (const h of handMade) {
  if (NOT_IN_GEONAMES.has(h.id)) continue;
  let best = null;
  let bestScore = Infinity;
  for (const c of kept) {
    if (c.id || Math.abs(c.lat - h.lat) > 0.1 || Math.abs(c.lon - h.lon) > 0.1) continue;
    const d = km(h.lat, h.lon, c.lat, c.lon);
    if (d > 0.5) continue;
    const score = d - Math.log10(c.pop + 10) / 50; // the closest place; the bigger one when two are equally close
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) best.id = h.id;
}

// de-duplicate exact repeats (same name, country and ~same place)
const seen = new Set();
kept = kept.filter((c) => {
  const k = `${c.country}|${c.name}|${c.lat.toFixed(2)}|${c.lon.toFixed(2)}`;
  if (seen.has(k) && !c.id) return false;
  seen.add(k);
  return true;
});

// neighbourhoods and city districts (GeoNames PPLX: "Paris 15 Vaugirard", "Borough Park") after the real towns,
// so a country listing or a short search shows cities first; they stay searchable by name
kept.sort((a, b) => Number(a.section && !a.id) - Number(b.section && !b.id) || b.pop - a.pop || a.name.localeCompare(b.name));

const tzList = [...new Set(kept.map((c) => c.tz))].sort();
const tzIdx = new Map(tzList.map((t, i) => [t, i]));
const regions = [];
const regionIdx = new Map();
const regionOf = (c) => {
  const name = regionName.get(`${c.country}.${c.admin1}`) ?? '';
  if (!regionIdx.has(name)) {
    regionIdx.set(name, regions.length);
    regions.push(name);
  }
  return regionIdx.get(name);
};
const clean = (s) => s.replace(/[\t\n|]/g, ' ');
const lines = [`#tz\t${tzList.join('|')}`, ''];
for (const c of kept) {
  const row = [clean(c.name), c.country, regionOf(c), +c.lat.toFixed(3), +c.lon.toFixed(3), tzIdx.get(c.tz)];
  if (c.id) row.push(c.id);
  lines.push(row.join('\t'));
}
lines[1] = `#a1\t${regions.map(clean).join('|')}`;
const text = lines.join('\n') + '\n';
mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, text);

const tagged = kept.filter((c) => c.id);
console.log(`districts (PPLX, listed last): ${kept.filter((c) => c.section).length}`);
console.log(`places: ${kept.length} (population >= ${MIN_POP}, plus all ${kept.filter((c) => ERETZ.has(c.country)).length} in IL/PS)`);
console.log(`time zones: ${tzList.length}, filled from country: ${tzFallbacks}; regions: ${regions.length}`);
console.log(
  `hand-made cities matched: ${tagged.length}/${handMade.length - NOT_IN_GEONAMES.size}`,
  handMade.filter((h) => !NOT_IN_GEONAMES.has(h.id) && !kept.some((c) => c.id === h.id)).map((h) => h.id),
);
console.log(tagged.map((c) => `${c.id}=${c.name}`).join(', '));
console.log(`size: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
