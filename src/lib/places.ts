/**
 * Worldwide location search, offline: ~25,000 GeoNames places (population ≥ 15,000, plus every
 * locality in Israel / Judea and Samaria). The data file is built by scripts/build-places.mjs and
 * loaded lazily, only when the location screen opens, so app start-up stays fast.
 */
import { CITIES, findCity, type City } from './cities';

export interface Place {
  name: string;
  /** ISO country code */
  cc: string;
  region: string;
  lat: number;
  lon: number;
  tz: string;
  /** the hand-made city (Hebrew name, elevation, candle custom) this place is */
  cityId?: string;
  /** position in the file = population rank */
  rank: number;
}

export interface PlaceDB {
  places: Place[];
  /** search keys (lower-case, no accents), parallel to `places` */
  keys: string[];
  /** country codes present (filled on first use) */
  countries?: string[];
}

// letters that NFD does not split into a base letter + accent
const FOLD: Record<string, string> = { ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', ı: 'i', þ: 'th' };

/** lower-case, accents and apostrophes removed: "Ra‘anana" → "raanana", "Montréal" → "montreal" */
export function searchKey(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[øœæßłđıþ]/g, (c) => FOLD[c])
    .replace(/[‘’ʼ'`´"״׳]/g, '')
    .replace(/[-–_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePlaces(text: string): PlaceDB {
  const lines = text.split('\n');
  const tz = lines[0].split('\t')[1].split('|');
  const regions = lines[1].split('\t')[1].split('|');
  const places: Place[] = [];
  const keys: string[] = [];
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const [name, cc, r, lat, lon, z, cityId] = l.split('\t');
    places.push({ name, cc, region: regions[+r] ?? '', lat: +lat, lon: +lon, tz: tz[+z], cityId: cityId || undefined, rank: places.length });
    keys.push(searchKey(name));
  }
  return { places, keys };
}

let loading: Promise<PlaceDB> | null = null;
/** Load (once) and parse the gazetteer. A separate chunk: nothing is fetched until this is called. */
export function loadPlaces(): Promise<PlaceDB> {
  loading ??= import('../data/places.txt?raw').then((m) => parsePlaces(m.default)).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/* ---------------- countries ---------------- */

let regionNames: Intl.DisplayNames | null | undefined;
/** Country name in Hebrew ("FR" → "צרפת"), or the code if the browser has no names */
export function countryName(cc: string) {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['he'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/* ---------------- search ---------------- */

const HEBREW = /[֐-׿]/;

export interface Hit {
  place?: Place;
  city?: City;
}

/**
 * Hebrew text searches the Hebrew city names and Hebrew country names ("צרפת" lists French cities);
 * Latin text searches the gazetteer: names that start with the text first, then a word that starts
 * with it, then anywhere; bigger places first. "springfield, il" narrows by region or country.
 */
export function searchPlaces(db: PlaceDB | null, query: string, limit = 40): Hit[] {
  const q = query.trim();
  if (!q) return [];
  if (HEBREW.test(q)) {
    const hits: Hit[] = CITIES.filter((c) => c.name.includes(q)).map((city) => ({ city }));
    if (db && hits.length < limit) {
      db.countries ??= [...new Set(db.places.map((p) => p.cc))];
      const ccs = new Set(db.countries.filter((cc) => countryName(cc).startsWith(q)));
      const listed = new Set(hits.map((h) => h.city?.id));
      for (const p of db.places) {
        if (hits.length >= limit) break;
        if (ccs.has(p.cc) && !(p.cityId && listed.has(p.cityId))) hits.push({ place: p });
      }
    }
    return hits.slice(0, limit);
  }
  if (!db) return [];
  const [namePart, ...rest] = q.split(',');
  const k = searchKey(namePart);
  const where = searchKey(rest.join(' '));
  if (!k) return [];
  const buckets: Place[][] = [[], [], []];
  for (let i = 0; i < db.places.length; i++) {
    const key = db.keys[i];
    const pos = key.indexOf(k);
    if (pos < 0) continue;
    const p = db.places[i];
    if (where && !(searchKey(p.region).startsWith(where) || p.cc.toLowerCase() === where || searchKey(countryName(p.cc)).startsWith(where))) continue;
    const b = pos === 0 ? 0 : key[pos - 1] === ' ' ? 1 : 2;
    if (buckets[b].length < limit) buckets[b].push(p);
  }
  return buckets
    .flat()
    .slice(0, limit)
    .map((place) => ({ place }));
}

/* ---------------- to a City ---------------- */

/** Some devices ship without every IANA zone; fall back to the phone's own zone */
export function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
}

export const isEretzYisrael = (cc: string) => cc === 'IL' || cc === 'PS';

/** A place as the City the app computes with. Elevation is unknown, so 0 (sea level). */
export function placeToCity(p: Place): City {
  const known = p.cityId ? findCity(p.cityId) : undefined;
  if (known) return known;
  const il = isEretzYisrael(p.cc);
  return {
    id: `geo:${p.cc}:${p.lat},${p.lon}`,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    tz: safeTz(p.tz),
    elev: 0,
    candle: il ? 20 : 18,
    il,
  };
}

/** One line under a place's name: "New York · ארצות הברית" */
export function placeSub(p: Place) {
  const country = countryName(p.cc);
  return p.region && p.region !== p.name ? `${p.region} · ${country}` : country;
}

/** Closest gazetteer place to a GPS fix */
export function nearestPlace(db: PlaceDB, lat: number, lon: number): { place: Place; km: number } | null {
  let best: Place | null = null;
  let bestD = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const p of db.places) {
    const dy = p.lat - lat;
    if (Math.abs(dy) > 1) continue;
    const dx = (p.lon - lon) * cos;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { place: best, km: Math.sqrt(bestD) * 111.2 } : null;
}
