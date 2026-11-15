import {
  HebrewCalendar,
  HDate,
  Location,
  gematriya,
  flags,
  tachanun,
  hallel,
  type Event,
  type CalOptions,
} from '@hebcal/core';
import '@hebcal/learning';
import * as KZ from 'kosher-zmanim';
import type { City } from './cities';
import type { MyEvent, Settings } from './store';
import { byLang, isHe, tr } from './i18n';

/* ---------- plain date helpers (all dates are local, pinned to noon) ---------- */

export function noon(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}
export function today() {
  return noon(new Date());
}
export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromKey(k: string) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function daysBetween(a: Date, b: Date) {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000);
}

/* ---------- Hebrew text ---------- */

/** Removes vowel points and cantillation marks, keeping punctuation: maqaf (־ in "בן־גוריון"), paseq, sof pasuq */
export function stripNiqqud(s: string) {
  return s.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '');
}

// these lists read in the interface language wherever they are used (see i18n.ts byLang)
export const GREG_MONTHS = byLang(
  ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
);
export const GREG_MONTHS_SHORT = byLang(
  ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
);
export const WEEKDAYS = byLang(
  ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbat'],
);
export const WEEKDAYS_SHORT = byLang(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

const HEB_MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
};
const HEB_MONTHS_EN: Record<number, string> = {
  1: 'Nisan', 2: 'Iyar', 3: 'Sivan', 4: 'Tammuz', 5: 'Av', 6: 'Elul',
  7: 'Tishrei', 8: 'Cheshvan', 9: 'Kislev', 10: 'Tevet', 11: 'Shevat', 12: 'Adar', 13: 'Adar II',
};

export function hebMonthName(month: number, year: number) {
  if (month === 12 && HDate.isLeapYear(year)) return tr('אדר א׳', 'Adar I');
  return isHe() ? HEB_MONTHS[month] : HEB_MONTHS_EN[month];
}
/** A Hebrew day number: gematria in Hebrew ("ט״ו"), digits in English ("15") */
export function hebNum(n: number) {
  return isHe() ? gematriya(n) : String(n);
}
export function hebYear(y: number) {
  return isHe() ? gematriya(y) : String(y);
}
/** "ט״ו כסלו תשפ״ז" / "15 Kislev 5787" */
export function hebDateStr(hd: HDate, withYear = true) {
  const s = `${hebNum(hd.getDate())} ${hebMonthName(hd.getMonth(), hd.getFullYear())}`;
  return withYear ? `${s} ${hebYear(hd.getFullYear())}` : s;
}
/** "16 בנובמבר 2026" / "November 16, 2026" */
export function gregDateStr(d: Date, withYear = true) {
  if (!isHe()) return `${GREG_MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? ', ' + d.getFullYear() : ''}`;
  return `${d.getDate()} ב${GREG_MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
}

/** Hebrew months in calendar order (Tishrei first) for a given year */
export function hebMonthsOfYear(year: number) {
  const leap = HDate.isLeapYear(year);
  const order = [7, 8, 9, 10, 11, 12, ...(leap ? [13] : []), 1, 2, 3, 4, 5, 6];
  return order.map((m) => ({ month: m, name: hebMonthName(m, year) }));
}

/* ---------- location ---------- */

export function makeLocation(city: City) {
  return new Location(city.lat, city.lon, city.il, city.tz, city.name, city.il ? 'IL' : undefined, undefined, city.elev);
}

export function timeFmt(tz: string) {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
}

/* ---------- events ---------- */

export type Kind =
  | 'yomtov'
  | 'cholhamoed'
  | 'erev'
  | 'fast'
  | 'minor'
  | 'roshchodesh'
  | 'modern'
  | 'special-shabbat'
  | 'parasha'
  | 'mevarchim'
  | 'candles'
  | 'havdalah'
  | 'fast-start'
  | 'fast-end'
  | 'omer'
  | 'learning'
  | 'other';

export interface DayItem {
  kind: Kind;
  /** Hebrew title: also what the app's own logic matches on */
  title: string;
  /** English title, for the English interface */
  en?: string;
  time?: Date;
  label?: string; // for learning: the program name
}

const LEARNING_LABELS_EN: Record<string, string> = {
  dafyomi: 'Daf Yomi',
  mishnayomi: 'Mishna Yomi',
  nachyomi: 'Nach Yomi',
  dailyRambam1: 'Daily Rambam',
  dailyPsalms: 'Tehillim',
  chofetzChaim: 'Chofetz Chaim',
  yerushalmi: 'Yerushalmi Yomi',
};
const LEARNING_LABELS: Record<string, string> = {
  dafyomi: 'דף יומי',
  mishnayomi: 'משנה יומית',
  nachyomi: 'נ״ך יומי',
  dailyRambam1: 'רמב״ם יומי',
  dailyPsalms: 'תהילים חודשי',
  chofetzChaim: 'חפץ חיים',
  yerushalmi: 'ירושלמי יומי',
};

function classify(ev: Event): DayItem | null {
  const it = classifyHe(ev);
  if (!it) return null;
  const f = ev.getFlags();
  let en = ev.render('en');
  if (it.kind === 'fast-start') en = 'Fast begins';
  else if (it.kind === 'fast-end') en = 'Fast ends';
  else if (it.kind === 'candles') en = 'Candle lighting';
  else if (it.kind === 'havdalah') en = 'Havdalah';
  else if (it.kind === 'learning') en = en.replace(/^(Daf Yomi|Yerushalmi)\s*:?\s*/, '');
  else if (f & flags.OMER_COUNT) en = en.replace(/^(\d+)\w*\s+day of the Omer$/i, 'Omer: day $1');
  // Hebcal can leave the Hebrew month name in English text ("Shabbat Mevarchim Chodesh טֵבֵת")
  en = en
    .replace(/[\u0590-\u05FF]+(\s+[\u0590-\u05FF]+)*/g, (h) => {
      const m = Object.entries(HEB_MONTHS).find(([, n]) => n === stripNiqqud(h).replace(/[׳']/g, ''));
      return m ? HEB_MONTHS_EN[+m[0]] : stripNiqqud(h);
    })
    .replace(/\s*\(CH[’']{2}M\)/, ' (Chol HaMoed)');
  return { ...it, en };
}

/** The item in the interface language */
export function itemTitle(it: Pick<DayItem, 'title' | 'en'>) {
  return isHe() ? it.title : (it.en ?? it.title);
}
/** A learning item's program name ("דף יומי" / "Daf Yomi") */
export function learningLabel(it: DayItem) {
  if (isHe()) return it.label ?? '';
  const k = Object.keys(LEARNING_LABELS).find((x) => LEARNING_LABELS[x] === it.label);
  return (k && LEARNING_LABELS_EN[k]) || it.label || '';
}
/** The short label for a calendar cell, in the interface language */
export function shortItem(it: Pick<DayItem, 'title' | 'en'>) {
  if (isHe()) return shortTitle(it.title);
  return (it.en ?? it.title)
    .replace(/^Parashat\s+/, '')
    .replace(/^Chanukah:\s*(\d+)\s+Candles?$/, 'Chanukah $1')
    .replace(/^Chanukah:\s*8th Day$/, 'Chanukah 8')
    .replace(/\s*\(Chol HaMoed\)/, '')
    .replace(/^Shabbat Mevarchim Chodesh\s+/, 'Mevarchim ')
    .replace(/^Rosh Chodesh\s+.*$/, 'Rosh Chodesh')
    .replace(/^Asara B'Tevet$/, '10 Tevet');
}

function classifyHe(ev: Event): DayItem | null {
  const f = ev.getFlags();
  const desc = ev.getDesc();
  const cats = ev.getCategories();
  const raw = stripNiqqud(ev.render('he'));
  const time = (ev as unknown as { eventTime?: Date }).eventTime;

  if (desc === 'Fast begins') return { kind: 'fast-start', title: 'תחילת הצום', time };
  if (desc === 'Fast ends') return { kind: 'fast-end', title: 'סיום הצום', time };
  if (f & flags.LIGHT_CANDLES && cats[0] === 'candles') return { kind: 'candles', title: 'הדלקת נרות', time };
  if (cats[0] === 'havdalah') return { kind: 'havdalah', title: 'הבדלה', time };
  if (f & flags.PARSHA_HASHAVUA) return { kind: 'parasha', title: raw };
  if (f & flags.SHABBAT_MEVARCHIM) return { kind: 'mevarchim', title: raw };
  if (f & flags.OMER_COUNT) return { kind: 'omer', title: raw };
  if (f & (flags.DAF_YOMI | flags.MISHNA_YOMI | flags.NACH_YOMI | flags.YERUSHALMI_YOMI | flags.DAILY_LEARNING)) {
    const label = LEARNING_LABELS[cats[0]] ?? '';
    const title = raw.replace(/^(דף יומי|ירושלמי)\s*:?\s*/, '');
    return { kind: 'learning', title, label };
  }
  if (f & flags.ROSH_CHODESH) return { kind: 'roshchodesh', title: raw };
  if (f & flags.MODERN_HOLIDAY) return { kind: 'modern', title: raw };
  if (f & (flags.MINOR_FAST | flags.MAJOR_FAST) && !(f & (flags.EREV | flags.CHAG))) return { kind: 'fast', title: raw };
  if (f & flags.CHOL_HAMOED) return { kind: 'cholhamoed', title: raw };
  if (f & flags.CHAG) {
    // "ראש השנה 5788" → "ראש השנה תשפ״ח"
    return { kind: 'yomtov', title: raw.replace(/\d{4}/, (y) => gematriya(+y)) };
  }
  if (f & flags.CHANUKAH_CANDLES) return { kind: 'minor', title: raw };
  if (f & flags.EREV) return { kind: 'erev', title: raw };
  if (f & flags.SPECIAL_SHABBAT) return { kind: 'special-shabbat', title: raw };
  if (f & (flags.MINOR_HOLIDAY | flags.CHANUKAH_CANDLES)) return { kind: 'minor', title: raw };
  if (cats.includes('holiday')) return { kind: 'minor', title: raw };
  return null;
}

function baseOptions(city: City, s: Settings): CalOptions {
  const o: CalOptions = {
    location: makeLocation(city),
    il: city.il,
    candlelighting: true,
    candleLightingMins: s.candleMins ?? city.candle,
    sedrot: true,
    omer: true,
    shabbatMevarchim: true,
    locale: 'he',
    useElevation: s.useElevation,
    noModern: !s.showModern,
  };
  if (s.havdalah === 'deg8.5') o.havdalahDeg = 8.5;
  else o.havdalahMins = { min42: 42, min50: 50, min72: 72 }[s.havdalah];
  return o;
}

const LEARNING = { dafYomi: true, mishnaYomi: true, nachYomi: true, rambam1: true, chofetzChaim: true, psalms: true };

/** All items for a date range, keyed by yyyy-mm-dd */
export function rangeItems(start: Date, end: Date, city: City, s: Settings, learning = false) {
  const opts = baseOptions(city, s);
  opts.start = start;
  opts.end = end;
  if (learning) opts.dailyLearning = LEARNING;
  const map = new Map<string, DayItem[]>();
  for (const ev of HebrewCalendar.calendar(opts)) {
    const item = classify(ev);
    if (!item) continue;
    const k = dateKey(ev.getDate().greg());
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function dayItems(d: Date, city: City, s: Settings) {
  return rangeItems(d, d, city, s, s.showLearning).get(dateKey(d)) ?? [];
}

const KIND_RANK: Partial<Record<Kind, number>> = {
  yomtov: 0, fast: 1, cholhamoed: 2, erev: 3, minor: 4, 'special-shabbat': 5, roshchodesh: 6, modern: 7, parasha: 8,
};

/** One short label for a calendar cell */
export function cellLabel(items: DayItem[]): DayItem | undefined {
  let best: DayItem | undefined;
  let rank = 99;
  for (const it of items) {
    const r = KIND_RANK[it.kind];
    if (r !== undefined && r < rank) {
      rank = r;
      best = it;
    }
  }
  return best;
}

export function shortTitle(t: string) {
  return t
    .replace(/^פרשת\s+/, '')
    .replace(/^ראש חודש\s+/, 'ר״ח ')
    .replace(/\s*\(חוה״מ\)/, ' חוה״מ')
    // "חנוכה: ב׳ נרות" → "חנוכה נר ב׳"
    .replace(/^חנוכה:\s*(\S+)\s+נרו?ת?$/, 'חנוכה נר $1')
    .replace(/^חנוכה:\s*/, 'חנוכה ')
    .replace(/^יום הזכרון לחללי מלחמת חרבות ברזל$/, 'יום זיכרון חרבות ברזל');
}

/* ---------- zmanim ---------- */

export type Rounding = 'floor' | 'ceil' | 'round';

export interface ZmanRow {
  id: string;
  name: string;
  hint?: string;
  time: Date;
  round: Rounding;
  major?: boolean;
}

export function roundTo(d: Date, how: Rounding) {
  const ms = 60000;
  const t = d.getTime();
  const v = how === 'floor' ? Math.floor(t / ms) * ms : how === 'ceil' ? Math.ceil(t / ms) * ms : Math.round(t / ms) * ms;
  return new Date(v);
}

/**
 * Daily zmanim from KosherJava (kosher-zmanim), the reference engine used by most zmanim apps.
 * Every value is cross-checked against Hebcal by `npm run verify`.
 */
export function zmanim(d: Date, city: City, s: Settings) {
  const elev = s.useElevation ? Math.max(0, city.elev) : 0;
  const c = new KZ.ComplexZmanimCalendar(new KZ.GeoLocation(city.name, city.lat, city.lon, elev, city.tz));
  c.setUseElevation(s.useElevation);
  c.setDate(d);
  const t = (x: { toJSDate(): Date } | null) => (x ? x.toJSDate() : null);
  // the GRA (sunrise→sunset) overloads exist at runtime but are missing from the library's typings
  type DT = { toJSDate(): Date } | null;
  const gra = c as unknown as { getMinchaGedola(): DT; getMinchaKetana(): DT; getPlagHamincha(): DT };
  const hd = new HDate(d);
  const sunrise = t(c.getSunrise());
  const sunset = t(c.getSunset());
  const chatzot = t(c.getChatzos()); // astronomical: the sun crosses the meridian
  const list: (Omit<ZmanRow, 'time'> & { time: Date | null })[] = [
    { id: 'alot', name: tr('עלות השחר', 'Alot HaShachar (dawn)'), time: t(c.getAlos16Point1Degrees()), round: 'ceil' },
    { id: 'misheyakir', name: tr('משיכיר', 'Misheyakir'), time: t(c.getMisheyakir11Point5Degrees()), round: 'ceil' },
    { id: 'sunrise', name: tr('הנץ החמה', 'Sunrise'), time: sunrise, round: 'round', major: true },
    { id: 'shmaMGA', name: tr('סוף זמן ק״ש', 'Latest Shema'), hint: tr('מגן אברהם', 'Magen Avraham'), time: t(c.getSofZmanShmaMGA()), round: 'floor' },
    { id: 'shma', name: tr('סוף זמן ק״ש', 'Latest Shema'), hint: tr('הגר״א', 'GRA'), time: t(c.getSofZmanShmaGRA()), round: 'floor', major: true },
    { id: 'tfillaMGA', name: tr('סוף זמן תפילה', 'Latest Shacharit'), hint: tr('מגן אברהם', 'Magen Avraham'), time: t(c.getSofZmanTfilaMGA()), round: 'floor' },
    { id: 'tfilla', name: tr('סוף זמן תפילה', 'Latest Shacharit'), hint: tr('הגר״א', 'GRA'), time: t(c.getSofZmanTfilaGRA()), round: 'floor' },
    { id: 'chatzot', name: tr('חצות היום', 'Chatzot (midday)'), time: chatzot, round: 'round', major: true },
    { id: 'minchaG', name: tr('מנחה גדולה', 'Mincha Gedola'), time: t(gra.getMinchaGedola()), round: 'ceil' },
    { id: 'minchaK', name: tr('מנחה קטנה', 'Mincha Ketana'), time: t(gra.getMinchaKetana()), round: 'ceil' },
    { id: 'plag', name: tr('פלג המנחה', 'Plag HaMincha'), time: t(gra.getPlagHamincha()), round: 'ceil' },
    { id: 'sunset', name: tr('שקיעה', 'Sunset'), time: sunset, round: 'floor', major: true },
    { id: 'tzeit', name: tr('צאת הכוכבים', 'Nightfall (Tzeit)'), time: t(c.getTzaisGeonim8Point5Degrees()), round: 'ceil', major: true },
    { id: 'tzeitRT', name: tr('צאת הכוכבים', 'Nightfall (Tzeit)'), hint: tr('רבנו תם', 'Rabbeinu Tam'), time: t(c.getTzais72()), round: 'ceil' },
    { id: 'chatzotNight', name: tr('חצות הלילה', 'Chatzot (midnight)'), time: chatzot ? new Date(chatzot.getTime() + 12 * 3600000) : null, round: 'round' },
  ];
  // Erev Pesach: chametz deadlines
  if (hd.getMonth() === 1 && hd.getDate() === 14) {
    list.push(
      { id: 'chametzEat', name: tr('סוף זמן אכילת חמץ', 'Latest eating chametz'), hint: tr('הגר״א', 'GRA'), time: t(c.getSofZmanTfilaGRA()), round: 'floor', major: true },
      { id: 'chametzBurn', name: tr('סוף זמן ביעור חמץ', 'Latest burning chametz'), hint: tr('הגר״א', 'GRA'), time: t(c.getSofZmanBiurChametzGRA()), round: 'floor', major: true },
    );
  }
  const rows = list.filter((r): r is ZmanRow => !!r.time).sort((a, b) => a.time.getTime() - b.time.getTime());
  const rise = sunrise ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6);
  const set = sunset ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18);
  return {
    rows,
    sunrise: rise,
    sunset: set,
    shaahZmanit: (set.getTime() - rise.getTime()) / 12 / 60000,
    dawn: rows.find((r) => r.id === 'alot')?.time ?? rise,
    dusk: rows.find((r) => r.id === 'tzeit')?.time ?? set,
  };
}

/* ---------- prayer notes ---------- */

export function prayerNotes(d: Date, il: boolean, items: DayItem[]) {
  const hd = new HDate(d);
  const notes: string[] = [];
  const h = hallel(hd, il);
  if (h === 2) notes.push(tr('הלל שלם', 'Full Hallel'));
  else if (h === 1) notes.push(tr('חצי הלל', 'Half Hallel'));
  const t = tachanun(hd, il);
  if (d.getDay() !== 6) {
    if (!t.shacharit && !t.mincha) notes.push(tr('אין אומרים תחנון', 'No Tachanun'));
    else if (!t.mincha) notes.push(tr('אין תחנון במנחה', 'No Tachanun at Mincha'));
  }
  const m = hd.getMonth();
  const day = hd.getDate();
  if (items.some((i) => i.kind === 'roshchodesh' || i.kind === 'cholhamoed')) notes.push(tr('יעלה ויבוא', 'Ya\'aleh VeYavo'));
  if (items.some((i) => /חנוכה|פורים/.test(i.title) && !/קטן|ערב/.test(i.title))) notes.push(tr('על הניסים', 'Al HaNissim'));
  // rain/dew in the Amida
  const rainSeason = (m === 7 && day >= 22) || (m >= 8 && m <= 13) || (m === 1 && day < 15);
  if (rainSeason) {
    let tal: boolean;
    if (il) tal = (m === 8 && day >= 7) || (m >= 9 && m <= 13) || m === 1;
    else {
      // outside Israel: from Maariv of Dec 4 (Dec 5 before a Gregorian leap year)
      const gy = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
      const nextLeap = new Date(gy + 1, 1, 29).getMonth() === 1;
      const start = new Date(gy, 11, nextLeap ? 6 : 5, 12);
      tal = d.getTime() >= start.getTime();
    }
    notes.push(tal ? tr('משיב הרוח · ותן טל ומטר', 'Mashiv HaRuach · V\'ten Tal UMatar') : tr('משיב הרוח · ותן ברכה', 'Mashiv HaRuach · V\'ten Bracha'));
  } else {
    notes.push(tr('מוריד הטל · ותן ברכה', 'Morid HaTal · V\'ten Bracha'));
  }
  return notes;
}

/* ---------- my events ---------- */

export function eventOccursOn(e: MyEvent, d: Date, hd: HDate): number | null {
  const orig = fromKey(e.date);
  if (d.getTime() < orig.getTime() && !sameDay(d, orig)) return null;
  if (e.repeat === 'none') return sameDay(orig, d) ? 0 : null;
  if (e.repeat === 'greg-yearly') {
    let m = orig.getMonth();
    let day = orig.getDate();
    if (m === 1 && day === 29 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1) day = 28;
    return d.getMonth() === m && d.getDate() === day ? d.getFullYear() - orig.getFullYear() : null;
  }
  const ohd = eventHebDate(e);
  if (e.repeat === 'yahrzeit') {
    // the day of death itself, then the halachic anniversary: Adar of a leap year, 30 Cheshvan / Kislev
    // in a year where the month is short, etc. (Calendrical Calculations, via Hebcal)
    if (hd.getFullYear() === ohd.getFullYear()) return ohd.isSameDate(hd) ? 0 : null;
    const y = HebrewCalendar.getYahrzeit(hd.getFullYear(), ohd);
    return y && y.isSameDate(hd) ? hd.getFullYear() - ohd.getFullYear() : null;
  }
  const occ = HebrewCalendar.getBirthdayOrAnniversary(hd.getFullYear(), ohd);
  if (occ && occ.isSameDate(hd)) return hd.getFullYear() - ohd.getFullYear();
  return null;
}

/** The Hebrew date of an event: after sunset the Hebrew day has already moved on to the next one */
export function eventHebDate(e: Pick<MyEvent, 'date' | 'afterSunset'>) {
  const orig = fromKey(e.date);
  return new HDate(e.afterSunset ? addDays(orig, 1) : orig);
}

export function eventsOn(list: MyEvent[], d: Date) {
  const hd = new HDate(d);
  const out: { ev: MyEvent; years: number }[] = [];
  for (const e of list) {
    const y = eventOccursOn(e, d, hd);
    if (y !== null) out.push({ ev: e, years: y });
  }
  return out;
}

/* ---------- moon ---------- */

/** Approximate illuminated fraction & waxing flag from the Hebrew day of month */
export function moonPhase(hd: HDate) {
  const age = hd.getDate() - 1 + 0.5; // days since molad (approx.)
  const phase = age / 29.53;
  return { illum: (1 - Math.cos(2 * Math.PI * phase)) / 2, waxing: phase < 0.5 };
}

export { HDate };
