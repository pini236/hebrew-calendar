/**
 * Sefirat HaOmer: the 49 days from the second night of Pesach to Shavuot.
 *
 * Pure logic (no React, no Capacitor), tested by scripts/test-omer.ts:
 *   - the calendar: which Omer day a date is, from Hebcal's own OMER_COUNT events (never computed here)
 *   - the moment: which count is due now. The count of a day begins at nightfall (tzeit, from the app's
 *     KosherJava zmanim) and its night lasts until dawn (alot); after that, a count that was missed at
 *     night can still be made by day, without a blessing
 *   - what the user marked ("counted", at night or by day), kept in localStorage per Hebrew year
 *   - from that, tonight: with a blessing, or continuing without one (a whole day missed, night and day)
 *   - the texts in three nusachim (Hebcal's count, with לָעֹמֶר / בָּעֹמֶר), the blessing and the sefira
 *   - the notifications: tonight's count at nightfall, a bedtime and a morning follow-up, and an
 *     announcement before Pesach that opens the introduction screen
 * The card is src/components/seasons/OmerCard.tsx; the widget's data is in src/lib/widget.ts.
 */
import { HDate, HebrewCalendar, OmerEvent, flags, gematriya, months } from '@hebcal/core';
import { addDays, dateKey, noon, roundTo, stripNiqqud, zmanim } from '../cal';
import type { City } from '../cities';
import type { Settings } from '../store';
import { isHe, tr } from '../i18n';
import { loadSeasonState, registerSeason, saveSeasonState, type SeasonContext } from '../seasons';
import type { PlannedNotification } from '../alerts';

/* ---------------- preferences ---------------- */

export type Nusach = 'ashkenaz' | 'sefard' | 'edot';

export interface OmerPrefs {
  nusach: Nusach;
  /** tonight's reminder, at nightfall + offset (minutes) */
  remind: boolean;
  offset: number;
  /** a second reminder at bedtime, only if tonight was not marked as counted */
  bedtime: boolean;
  bedtimeAt: string;
  /** a morning reminder when the night was missed (count by day, without a blessing) */
  morning: boolean;
  morningAt: string;
  /** a notification two days before Pesach */
  announce: boolean;
}

export const OMER_DEFAULTS: OmerPrefs = {
  nusach: 'sefard',
  remind: true,
  offset: 0,
  bedtime: true,
  bedtimeAt: '22:30',
  morning: true,
  morningAt: '08:00',
  announce: true,
};
export const OMER_OFFSETS = [0, 10, 20, 30, 45, 60];

export function omerPrefs(raw: Record<string, unknown> | undefined): OmerPrefs {
  const p = { ...OMER_DEFAULTS, ...(raw ?? {}) } as OmerPrefs;
  if (!['ashkenaz', 'sefard', 'edot'].includes(p.nusach)) p.nusach = OMER_DEFAULTS.nusach;
  return p;
}

/* ---------------- the calendar (Hebcal) ---------------- */

interface OmerYear {
  year: number;
  /** the daytime of each Omer day, noon-pinned: days[0] is 16 Nisan */
  days: Date[];
  byKey: Map<string, number>;
}
const years = new Map<number, OmerYear>();

/** The 49 days of a Hebrew year's Omer, from Hebcal's OMER_COUNT events */
export function omerYear(year: number): OmerYear {
  let y = years.get(year);
  if (y) return y;
  const evs = HebrewCalendar.calendar({
    start: new HDate(16, months.NISAN, year),
    end: new HDate(5, months.SIVAN, year),
    omer: true,
    noHolidays: true,
  });
  const days: Date[] = [];
  const byKey = new Map<string, number>();
  for (const ev of evs) {
    if (!(ev.getFlags() & flags.OMER_COUNT)) continue;
    const n = (ev as OmerEvent).omer;
    const d = noon(ev.getDate().greg());
    days[n - 1] = d;
    byKey.set(dateKey(d), n);
  }
  y = { year, days, byKey };
  years.set(year, y);
  return y;
}

/** The Omer day whose daytime is this date (1–49), or 0 */
export function omerDayOf(d: Date): number {
  return omerYear(new HDate(d).getFullYear()).byKey.get(dateKey(d)) ?? 0;
}

/** The date whose evening begins the count (15 Nisan: the second night of Pesach) */
export function firstEve(year: number) {
  return addDays(omerYear(year).days[0], -1);
}

/** Hebcal's Omer event for day n of a year (its sefira, its count) */
export function omerEvent(year: number, n: number) {
  return new OmerEvent(new HDate(omerYear(year).days[n - 1]), n);
}

/** Nightfall, as the app shows it (KosherJava, rounded up to the minute) */
export function tzeitOn(d: Date, city: City, s: Settings): Date {
  const z = zmanim(d, city, s);
  const row = z.rows.find((r) => r.id === 'tzeit');
  return row ? roundTo(row.time, row.round) : roundTo(z.dusk, 'ceil');
}

/** Shabbat or Yom Tov at this moment (the Hebrew day turns at sunset): the phone is put away */
export function holyAt(at: Date, city: City, s: Settings): boolean {
  const d = noon(at);
  const z = zmanim(d, city, s);
  const hd = new HDate(at.getTime() >= z.sunset.getTime() ? addDays(d, 1) : d);
  return holyDay(hd, city.il);
}
function holyDay(hd: HDate, il: boolean) {
  if (hd.getDay() === 6) return true;
  return (HebrewCalendar.getHolidaysOnDate(hd, il) ?? []).some((e) => e.getFlags() & flags.CHAG && !(e.getFlags() & flags.CHOL_HAMOED));
}
/** The whole window of day n (its night and its day) falls on Shabbat or Yom Tov: the app can't be told */
export function offlineDay(year: number, n: number, il: boolean) {
  return holyDay(new HDate(omerYear(year).days[n - 1]), il);
}

/* ---------------- the moment ---------------- */

export interface OmerNow {
  year: number;
  /** the count due now (or the last one due): 0 before the first night, 50 after the 49th day */
  n: number;
  /** night: nightfall to dawn, the time to count with a blessing; day: dawn to nightfall */
  phase: 'night' | 'day';
  /** the next nightfall, when the next count begins */
  next: Date;
}

export function omerNow(at: Date, city: City, s: Settings): OmerNow {
  const d = noon(at);
  const year = new HDate(d).getFullYear();
  const tz = tzeitOn(d, city, s);
  const t = at.getTime();
  const range = (k: number, day: Date) => (k > 0 ? k : day.getTime() < omerYear(year).days[0].getTime() ? 0 : 50);
  if (t >= tz.getTime()) {
    const tomorrow = addDays(d, 1);
    return { year, n: range(omerDayOf(tomorrow), tomorrow), phase: 'night', next: tzeitOn(tomorrow, city, s) };
  }
  const dawn = zmanim(d, city, s).dawn;
  return { year, n: range(omerDayOf(d), d), phase: t < dawn.getTime() ? 'night' : 'day', next: tz };
}

/* ---------------- what the user marked ---------------- */

export type How = 'night' | 'day';
export interface OmerState {
  v: 1;
  /** `${year}:${n}` → when it was counted */
  days: Record<string, { how: How; at: number }>;
}
export const EMPTY_STATE: OmerState = { v: 1, days: {} };

export const loadOmer = () => loadSeasonState<OmerState>('omer', EMPTY_STATE);
export const saveOmer = (s: OmerState) => saveSeasonState('omer', s);

const key = (year: number, n: number) => `${year}:${n}`;
export function countedHow(s: OmerState, year: number, n: number): How | null {
  return s.days[key(year, n)]?.how ?? null;
}
export function mark(s: OmerState, year: number, n: number, how: How, at: number): OmerState {
  return { ...s, days: { ...s.days, [key(year, n)]: { how, at } } };
}
export function unmark(s: OmerState, year: number, n: number): OmerState {
  const days = { ...s.days };
  delete days[key(year, n)];
  return { ...s, days };
}
/** The user has marked at least one day this year: the app's picture of the count means something */
export function tracking(s: OmerState, year: number) {
  return Object.keys(s.days).some((k) => k.startsWith(`${year}:`));
}

/**
 * Each of the 49 days, as the field shows it:
 *  counted / byDay (counted, by day without a blessing) / missed (a whole day, after the user began marking) /
 *  assumed (Shabbat or Yom Tov after the user began marking: the phone was away, so taken as counted) /
 *  passed (before the user began marking: not known) / due (the count of now) / future
 */
export type Cell = 'counted' | 'byDay' | 'missed' | 'assumed' | 'passed' | 'due' | 'future';

export function omerCells(s: OmerState, year: number, n: number, il: boolean): Cell[] {
  let first = 0;
  for (let k = 1; k <= 49; k++) if (countedHow(s, year, k)) {
    first = k;
    break;
  }
  return Array.from({ length: 49 }, (_, i) => {
    const k = i + 1;
    const how = countedHow(s, year, k);
    if (how) return how === 'day' ? 'byDay' : 'counted';
    if (k === n) return 'due';
    if (k > n) return 'future';
    if (!first || k < first) return 'passed';
    return offlineDay(year, k, il) ? 'assumed' : 'missed';
  });
}

export type OmerStatus =
  | { kind: 'before'; at: Date }
  | { kind: 'due'; n: number; bless: boolean; byDay: boolean }
  | { kind: 'done'; n: number; how: How; next: Date | null; blessNext: boolean }
  | { kind: 'after'; counted: number; tracked: boolean };

/**
 * What to do now. A night missed but the day not yet over: count by day without a blessing, and tonight
 * continue with one. A whole day missed (night and day): continue without a blessing (the common practice).
 */
export function omerStatus(s: OmerState, now: OmerNow, il: boolean): OmerStatus {
  const { year, n } = now;
  if (n === 0) return { kind: 'before', at: now.next };
  if (n === 50) {
    const counted = Array.from({ length: 49 }, (_, i) => countedHow(s, year, i + 1)).filter(Boolean).length;
    return { kind: 'after', counted, tracked: tracking(s, year) };
  }
  const cells = omerCells(s, year, n, il);
  const gap = cells.slice(0, n - 1).includes('missed');
  const how = countedHow(s, year, n);
  if (how) return { kind: 'done', n, how, next: n < 49 ? now.next : null, blessNext: !gap };
  const byDay = now.phase === 'day';
  return { kind: 'due', n, bless: !gap && !byDay, byDay };
}

/* ---------------- the texts ---------------- */

export const NUSACH_NAMES: Record<Nusach, () => string> = {
  ashkenaz: () => tr('אשכנז', 'Ashkenaz'),
  sefard: () => tr('ספרד', 'Sefard'),
  edot: () => tr('עדות המזרח', 'Edot HaMizrach'),
};

export const BLESSING = 'בָּרוּךְ אַתָּה ה׳ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ עַל סְפִירַת הָעֹמֶר.';
export const BLESSING_TRANSLIT = "Barukh atah Adonai, Eloheinu melekh ha'olam, asher kid'shanu b'mitzvotav v'tzivanu al s'firat ha'omer.";
export const BLESSING_EN = 'Blessed are You, Lord our God, King of the universe, who has sanctified us with His commandments and commanded us concerning the counting of the Omer.';

/** Hebcal's text with a quieter niqqud: no meteg, and no dagesh left over from a prefix it dropped */
function clean(s: string) {
  return s
    .normalize()
    .replace(/ֽ/g, '')
    .replace(/(^|\s)([ני])([ְ-ֻ]*)ּ/g, '$1$2$3');
}

/**
 * "הַיּוֹם … לָעֹמֶר" from Hebcal (OmerEvent.getTodayIs): Ashkenaz ends לָעֹמֶר, Sefard and Edot HaMizrach בָּעֹמֶר.
 */
export function countText(n: number, nusach: Nusach): string {
  const base = clean(new OmerEvent(new HDate(), n).getTodayIs('he')).replace(/\s*לָעוֹמֶר$/, '');
  return `${base} ${nusach === 'ashkenaz' ? 'לָעֹמֶר' : 'בָּעֹמֶר'}.`;
}

/** The count in English (Hebcal): "Today is 10 days, which are 1 week and 3 days of the Omer" */
export const countEnglish = (n: number) => new OmerEvent(new HDate(), n).getTodayIs('en') + '.';

/** The same count, transliterated (Sephardic pronunciation, as in Hebcal's sefira transliteration) */
export function countTranslit(n: number, nusach: Nusach): string {
  const ones = ['', 'echad', "sh'nayim", "sh'loshah", "arba'ah", 'chamishah', 'shishah', "shiv'ah", "sh'monah", "tish'ah"];
  const tens = ['', 'asarah', 'esrim', "sh'loshim", "arba'im"];
  const and = (w: string) => (/^(sh'n|sh'l)/.test(w) ? `u'${w}` : w.startsWith('ch') ? `va'${w}` : `v'${w}`);
  const t = Math.floor(n / 10);
  const o = n % 10;
  let s: string;
  if (n === 1) s = 'yom echad';
  else if (n === 2) s = "sh'nei yamim";
  else if (n < 10) s = `${ones[n]} yamim`;
  else if (n === 10) s = 'asarah yamim';
  else if (n === 11) s = 'achad asar yom';
  else if (n === 12) s = "sh'neim asar yom";
  else if (n < 20) s = `${ones[o]} asar yom`;
  else s = `${o ? `${ones[o]} ${t === 3 ? `u'${tens[t]}` : `v'${tens[t]}`}` : tens[t]} yom`;
  if (n >= 7) {
    const w = Math.floor(n / 7);
    const d = n % 7;
    const weeks = w === 1 ? "shavu'a echad" : w === 2 ? "sh'nei shavu'ot" : `${ones[w]} shavu'ot`;
    const days = d === 0 ? '' : d === 1 ? " v'yom echad" : d === 2 ? " u'sh'nei yamim" : ` ${and(ones[d])} yamim`;
    s += `, shehem ${weeks}${days}`;
  }
  return `Hayom ${s} ${nusach === 'ashkenaz' ? "la'omer" : "ba'omer"}.`;
}

const SEFIROT_HE = ['חסד', 'גבורה', 'תפארת', 'נצח', 'הוד', 'יסוד', 'מלכות'];
const SEFIROT_IN_HE = ['שבחסד', 'שבגבורה', 'שבתפארת', 'שבנצח', 'שבהוד', 'שביסוד', 'שבמלכות'];
const SEFIROT_EN = ['Chesed', 'Gevurah', 'Tiferet', 'Netzach', 'Hod', 'Yesod', 'Malkhut'];

/** The sefira of the day: "הוֹד שֶׁבְּהוֹד" (Hebcal, with niqqud) */
export const sefiraNiqqud = (n: number) => clean(new OmerEvent(new HDate(), n).sefira('he'));
/** "הוד שבהוד" / "Hod sheb'Hod" in the interface language */
export const sefira = (n: number) => (isHe() ? stripNiqqud(sefiraNiqqud(n)) : new OmerEvent(new HDate(), n).sefira('translit'));
/** "Splendor within Splendor" */
export const sefiraMeaning = (n: number) => new OmerEvent(new HDate(), n).sefira('en');
/** The sefira of a week (1–7), plain: "הוד" / "Hod" */
export const weekSefira = (w: number) => (isHe() ? SEFIROT_HE[w - 1] : SEFIROT_EN[w - 1]);
/** The seven words, and the seven "within" forms, for the widget (Hebrew, no niqqud) */
export const SEFIRA_WORDS = { he: SEFIROT_HE, in: SEFIROT_IN_HE };

/** "4 שבועות ו־5 ימים" / "4 weeks, 5 days" */
export function weeksText(n: number): string {
  const w = Math.floor(n / 7);
  const d = n % 7;
  if (isHe()) {
    const days = (k: number) => (k === 1 ? 'יום אחד' : `${k} ימים`);
    if (!w) return days(d);
    const weeks = w === 1 ? 'שבוע אחד' : `${w} שבועות`;
    return d ? `${weeks} ו${d === 1 ? 'יום אחד' : `־${d} ימים`}` : weeks;
  }
  const days = (k: number) => `${k} ${k === 1 ? 'day' : 'days'}`;
  if (!w) return days(d);
  const weeks = `${w} ${w === 1 ? 'week' : 'weeks'}`;
  return d ? `${weeks}, ${days(d)}` : weeks;
}

/** The day's number: "ל״ג" in Hebrew, "33" in English */
export const dayNumber = (n: number) => (isHe() ? gematriya(n) : String(n));

/* ---------------- notifications ---------------- */

type Note = Omit<PlannedNotification, 'group' | 'channel'>;
/** slots within a day (the planner places them in the season range) */
export const SLOT = { tonight: 0, bedtime: 1, morning: 2, announce: 3 } as const;
/** how far ahead each kind is planned (the app re-plans on every open, and after every count) */
const AHEAD = { tonight: 10, followUp: 3, announce: 45 } as const;

const at = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
};
/** The count without niqqud, in full spelling (a notification has no room for vowels) */
const plain = (n: number, nusach: Nusach) =>
  stripNiqqud(countText(n, nusach))
    .replace(/\.$/, '')
    .replace(/([לב])עמר$/, '$1עומר')
    .replace(/חמשה/g, 'חמישה')
    .replace(/ששה/g, 'שישה');

export function omerNotifications(from: Date, days: number, now: Date, ctx: SeasonContext, state: OmerState): Note[] {
  const p = omerPrefs(ctx.prefs);
  const { city, settings: s } = ctx;
  const out: Note[] = [];
  const push = (slot: number, when: Date, title: string, body: string, extra?: Record<string, string>) => {
    if (when.getTime() <= now.getTime() + 30000 || holyAt(when, city, s)) return;
    out.push({ id: slot, at: when, title, body, ...(extra ? { extra } : {}) });
  };
  const he = (n: number) => (isHe() ? plain(n, p.nusach) : countEnglish(n).replace(/\.$/, ''));
  // a gap already known now (a day that is over and was not marked): later nights can't know of more
  const cur = omerNow(now, city, s);
  const knownGap = cur.n > 1 && cur.n < 50 && omerCells(state, cur.year, cur.n, city.il).slice(0, cur.n - 1).includes('missed');

  for (let i = -1; i < Math.min(days, AHEAD.tonight); i++) {
    const d = addDays(from, i);
    // tonight: the count that begins at this evening's nightfall
    const n = omerDayOf(addDays(d, 1));
    if (n) {
      const year = new HDate(d).getFullYear();
      if (!countedHow(state, year, n)) {
        const tz = tzeitOn(d, city, s);
        const gap = year === cur.year && knownGap;
        const title = tr(`ספירת העומר · ${gematriya(n)} בעומר`, `Sefirat HaOmer · day ${n}`);
        const lead = gap ? tr('ממשיכים לספור בלי ברכה. ', 'Continue counting without a blessing. ') : '';
        const first = new Date(tz.getTime() + p.offset * 60000);
        if (p.remind) push(SLOT.tonight, first, title, lead + he(n), { screen: 'omer' });
        // bedtime: only for someone who marks the count here (otherwise "not counted" means nothing)
        if (p.bedtime && i < AHEAD.followUp && tracking(state, year)) {
          let bed = at(d, p.bedtimeAt);
          if (bed.getHours() < 12) bed = at(addDays(d, 1), p.bedtimeAt);
          if (bed.getTime() > first.getTime() + 15 * 60000)
            push(SLOT.bedtime, bed, tr('עוד לא ספרתם הלילה', "You haven't counted tonight"), lead + he(n), { screen: 'omer' });
        }
      }
    }
    // the morning after a night that was not marked: count by day, without a blessing
    const m = omerDayOf(d);
    if (m && i >= 0 && p.morning && i < AHEAD.followUp) {
      const year = new HDate(d).getFullYear();
      if (tracking(state, year) && !countedHow(state, year, m)) {
        const when = at(d, p.morningAt);
        if (when.getTime() > zmanim(d, city, s).dawn.getTime())
          push(
            SLOT.morning,
            when,
            tr('שכחתם לספור אמש?', 'Forgot to count last night?'),
            tr('אפשר לספור היום בלי ברכה, ולהמשיך הלילה בברכה', 'Count today without a blessing, and continue tonight with one'),
            { screen: 'omer' },
          );
      }
    }
  }

  // before Pesach: "the count begins on the second night", opening the introduction
  if (p.announce) {
    const hd = new HDate(from);
    const year = hd.getFullYear();
    const pesach = noon(new HDate(15, months.NISAN, year).greg());
    const away = (pesach.getTime() - from.getTime()) / 86400000;
    if (away > 0 && away <= AHEAD.announce) {
      const day = (k: number) => addDays(pesach, -k);
      const choices = [at(day(2), '20:00'), at(day(3), '20:00'), at(day(1), '10:00')].filter(
        (w) => w.getTime() > now.getTime() + 30000 && !holyAt(w, city, s),
      );
      // the evening two days before; if that is Shabbat, the evening before it; if it already passed, Erev Pesach morning
      const pick = choices[0] ?? null;
      if (pick)
        out.push({
          id: SLOT.announce,
          at: pick,
          title: tr('ספירת העומר מתחילה בליל שני של פסח', 'Sefirat HaOmer begins on the second night of Pesach'),
          body: tr('49 ימים עד שבועות, ספירה אחת בכל ערב', '49 days to Shavuot, one count each evening'),
          extra: { screen: 'omer-intro' },
        });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ---------------- the season ---------------- */

registerSeason({
  id: 'omer',
  name: () => tr('ספירת העומר', 'Sefirat HaOmer'),
  defaults: OMER_DEFAULTS as unknown as Record<string, unknown>,
  activeOn(day) {
    if (omerDayOf(day)) return true;
    // 15 Nisan: the count begins tonight
    const hd = new HDate(day);
    return hd.getMonth() === months.NISAN && hd.getDate() === 15;
  },
  notifications(from, days, now, ctx) {
    return omerNotifications(from, days, now, ctx, loadOmer());
  },
});
