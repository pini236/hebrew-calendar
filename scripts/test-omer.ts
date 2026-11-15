/**
 * Tests for Sefirat HaOmer (src/lib/seasons/omer.ts), run with TZ=Asia/Jerusalem: npm test
 * The day across nightfall, with or without a blessing, the notifications (none after a count),
 * and the texts in the three nusachim.
 */
// a localStorage for the planner, which reads the marks the way the app does
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };

import { planNotifications } from '../src/lib/alerts';
import { findCity } from '../src/lib/cities';
import { setLang } from '../src/lib/i18n';
import { SEASON_STATE_KEY, activeSeasons, seasonContext } from '../src/lib/seasons';
import {
  EMPTY_STATE,
  OMER_DEFAULTS,
  countText,
  countTranslit,
  mark,
  omerCells,
  omerDayOf,
  omerNotifications,
  omerNow,
  omerStatus,
  sefiraNiqqud,
  tzeitOn,
  weeksText,
  type OmerState,
} from '../src/lib/seasons/omer';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/store';

let pass = 0;
let fail = 0;
const ok = (c: unknown, msg: string) => (c ? pass++ : (fail++, console.log('  FAIL ' + msg)));

setLang('he');
const jlm = findCity('jerusalem')!;
const ny = findCity('new-york')!;
const S: Settings = DEFAULT_SETTINGS;
const at = (iso: string) => new Date(iso);
const marks = (days: number[], how: 'night' | 'day' = 'night') => days.reduce<OmerState>((s, k) => mark(s, 5787, k, how, 0), EMPTY_STATE);
const range = (a: number, b: number, skip: number[] = []) => Array.from({ length: b - a + 1 }, (_, i) => a + i).filter((k) => !skip.includes(k));

/* ---------------- the calendar (Hebcal) ---------------- */
// Pesach 5787: 15 Nisan is Thursday 22.4.2027; day 1 is Friday 23.4; Lag BaOmer Tuesday 25.5; day 49 Thursday 10.6
ok(omerDayOf(new Date(2027, 3, 22, 12)) === 0, '15 Nisan is not yet a day of the count');
ok(omerDayOf(new Date(2027, 3, 23, 12)) === 1, '16 Nisan is day 1');
ok(omerDayOf(new Date(2027, 4, 25, 12)) === 33, 'Lag BaOmer is day 33');
ok(omerDayOf(new Date(2027, 5, 10, 12)) === 49 && omerDayOf(new Date(2027, 5, 11, 12)) === 0, 'day 49, then Shavuot');
const act = (d: Date) => activeSeasons(d, jlm, S).some((s) => s.id === 'omer');
ok(!act(new Date(2027, 3, 21, 12)) && act(new Date(2027, 3, 22, 12)) && act(new Date(2027, 5, 10, 12)) && !act(new Date(2027, 5, 11, 12)), 'the card shows from 15 Nisan to day 49');

/* ---------------- the day turns at nightfall ---------------- */
const tz32 = tzeitOn(new Date(2027, 4, 24, 12), jlm, S);
const before = omerNow(new Date(tz32.getTime() - 60000), jlm, S);
const afterTz = omerNow(new Date(tz32.getTime() + 60000), jlm, S);
ok(before.n === 32 && before.phase === 'day', `a minute before nightfall on 24.5: still day 32 (${before.n} ${before.phase})`);
ok(afterTz.n === 33 && afterTz.phase === 'night', `a minute after: day 33, at night (${afterTz.n} ${afterTz.phase})`);
ok(before.next.getTime() === tz32.getTime(), 'before nightfall: the next count is tonight');
const lateNight = omerNow(at('2027-05-25T02:30:00+03:00'), jlm, S);
ok(lateNight.n === 33 && lateNight.phase === 'night', `after midnight, before dawn: still the night of 33 (${lateNight.phase})`);
const morning = omerNow(at('2027-05-25T09:00:00+03:00'), jlm, S);
ok(morning.n === 33 && morning.phase === 'day', 'morning: the day of 33');
ok(omerNow(at('2027-04-22T12:00:00+03:00'), jlm, S).n === 0, '15 Nisan at noon: before the count');
ok(omerNow(at('2027-04-22T21:00:00+03:00'), jlm, S).n === 1, '15 Nisan after nightfall: day 1');
ok(omerNow(at('2027-06-10T22:00:00+03:00'), jlm, S).n === 50, 'Shavuot night: after the count');
// New York: its own nightfall
const nyTz = tzeitOn(new Date(2027, 4, 24, 12), ny, S);
ok(nyTz.getTime() !== tz32.getTime(), 'nightfall is the place’s own');

/* ---------------- with a blessing, or without ---------------- */
const night33 = omerNow(at('2027-05-24T21:00:00+03:00'), jlm, S);
const day33 = omerNow(at('2027-05-25T09:00:00+03:00'), jlm, S);
let s = omerStatus(marks(range(1, 32, [2, 9, 16, 23, 30])), night33, true);
ok(s.kind === 'due' && s.bless && !s.byDay, 'all marked (Shabbat days unknown): count tonight with a blessing');
s = omerStatus(EMPTY_STATE, night33, true);
ok(s.kind === 'due' && s.bless, 'nothing marked at all: the app assumes the count and says the blessing');
s = omerStatus(marks(range(1, 32, [20])), night33, true);
ok(s.kind === 'due' && !s.bless, 'a whole day missed (20, a weekday): continue without a blessing');
const byDay20 = mark(marks(range(1, 32, [20])), 5787, 20, 'day', 0);
s = omerStatus(byDay20, night33, true);
ok(s.kind === 'due' && s.bless, 'night 20 missed but counted by day: tonight with a blessing');
s = omerStatus(marks(range(10, 32)), night33, true);
ok(s.kind === 'due' && s.bless, 'began marking on day 10: the days before are not "missed"');
s = omerStatus(marks(range(1, 32)), day33, true);
ok(s.kind === 'due' && s.byDay && !s.bless, 'the night of 33 missed, it is morning: count by day, without a blessing');
s = omerStatus(mark(marks(range(1, 32)), 5787, 33, 'day', 0), omerNow(at('2027-05-25T21:00:00+03:00'), jlm, S), true);
ok(s.kind === 'due' && s.n === 34 && s.bless, '33 counted by day: 34 tonight with a blessing');
s = omerStatus(marks(range(1, 32)), omerNow(at('2027-05-25T21:00:00+03:00'), jlm, S), true);
ok(s.kind === 'due' && s.n === 34 && !s.bless, '33 missed night and day: 34 without a blessing');
s = omerStatus(marks(range(1, 33)), night33, true);
ok(s.kind === 'done' && s.how === 'night' && s.blessNext, 'counted tonight: done');
const cells = omerCells(marks(range(1, 32, [2, 20])), 5787, 33, true);
ok(cells[1] === 'assumed' && cells[19] === 'missed' && cells[32] === 'due' && cells[33] === 'future' && cells[0] === 'counted', `the field: ${cells.slice(0, 3).join(',')}…${cells[19]}…${cells[32]}`);
// Shabbat and Yom Tov can't be marked in the app: never "missed"
ok(omerCells(marks(range(1, 32, [2, 9, 16, 23, 30])), 5787, 33, true).every((c) => c !== 'missed'), 'Shabbat days are never missed');
ok(omerCells(marks([1]), 5787, 8, false)[0] === 'counted' && omerCells(marks([3]), 5787, 8, false)[5] === 'assumed', 'outside Israel the 7th day of Pesach (day 6) is Yom Tov');

/* ---------------- notifications ---------------- */
const ctx = seasonContext('omer', jlm, S);
const notes = (now: Date, st: OmerState, prefs = {}) => omerNotifications(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), 14, now, { ...ctx, prefs: { ...OMER_DEFAULTS, ...prefs } }, st);
const noon24 = at('2027-05-24T12:00:00+03:00');
let n = notes(noon24, marks(range(1, 32)));
const tonight = n.find((x) => x.id === 0 && x.at.getDate() === 24);
ok(tonight && tonight.at.getTime() === tz32.getTime(), `tonight's reminder at nightfall (${tonight?.at})`);
ok(tonight?.title === 'ספירת העומר · ל״ג בעומר' && tonight.body === 'היום שלושה ושלושים יום, שהם ארבעה שבועות וחמישה ימים בעומר', `the reminder carries the count: ${tonight?.body}`);
ok(tonight?.extra?.screen === 'omer', 'tapping it opens Today');
ok(n.some((x) => x.id === 1 && x.at.getDate() === 24 && x.at.getHours() === 22 && x.at.getMinutes() === 30), 'a bedtime reminder at 22:30');
ok(!n.some((x) => x.id === 2 && x.at.getDate() === 24), 'no morning reminder: last night was counted');
// counted tonight: tonight's reminders are gone, tomorrow's stay
n = notes(at('2027-05-24T20:30:00+03:00'), marks(range(1, 33)));
ok(!n.some((x) => x.at.getDate() === 24) && n.some((x) => x.id === 0 && x.at.getDate() === 25), 'after counting: nothing more tonight, tomorrow as usual');
ok(!n.some((x) => x.id === 2 && x.at.getDate() === 25), 'after counting: no morning reminder');
// not counted: the morning after
n = notes(at('2027-05-25T06:00:00+03:00'), marks(range(1, 32)));
const mrn = n.find((x) => x.id === 2 && x.at.getDate() === 25);
ok(mrn && mrn.at.getHours() === 8 && /בלי ברכה/.test(mrn.body), 'the night missed: a morning reminder at 08:00, count without a blessing');
// someone who doesn't mark in the app: only the evening reminder
n = notes(noon24, EMPTY_STATE);
ok(n.some((x) => x.id === 0) && !n.some((x) => x.id === 1 || x.id === 2), 'not marking here: only the evening reminder');
// a known gap: tonight's reminder says so
n = notes(noon24, marks(range(1, 31, [20])));
ok(n.find((x) => x.id === 0)?.body.startsWith('ממשיכים לספור בלי ברכה'), 'a whole day missed: the reminder says without a blessing');
// not on Shabbat or Yom Tov
n = notes(at('2027-05-26T12:00:00+03:00'), marks(range(1, 34)));
ok(!n.some((x) => x.at.getDay() === 5 && x.at.getHours() >= 19) && !n.some((x) => x.at.getDay() === 6 && x.at.getHours() < 19), 'no reminders on Shabbat');
// switches
ok(!notes(noon24, marks(range(1, 32)), { remind: false }).some((x) => x.id === 0), 'evening reminder off');
ok(!notes(noon24, marks(range(1, 32)), { bedtime: false }).some((x) => x.id === 1), 'bedtime off');
const late = notes(noon24, marks(range(1, 32)), { offset: 30 }).find((x) => x.id === 0 && x.at.getDate() === 24);
ok(late && late.at.getTime() === tz32.getTime() + 30 * 60000, 'reminder 30 minutes after nightfall');
const bed = notes(noon24, marks(range(1, 32)), { bedtimeAt: '00:15' }).find((x) => x.id === 1);
ok(bed && bed.at.getDate() === 25 && bed.at.getHours() === 0, 'a bedtime after midnight is that night');
// before Pesach: the announcement two days before, opening the introduction
n = notes(at('2027-04-01T10:00:00+03:00'), EMPTY_STATE);
const ann = n.find((x) => x.id === 3);
ok(ann && ann.at.getDate() === 20 && ann.at.getMonth() === 3 && ann.at.getHours() === 20, `announcement on Tuesday 20.4 at 20:00 (${ann?.at})`);
ok(ann?.title === 'ספירת העומר מתחילה בליל שני של פסח' && ann.extra?.screen === 'omer-intro', 'the announcement opens the introduction');
n = notes(at('2027-04-20T21:00:00+03:00'), EMPTY_STATE);
const ann2 = n.find((x) => x.id === 3);
ok(ann2 && ann2.at.getDate() === 21 && ann2.at.getHours() === 10, 'missed the evening: Erev Pesach morning instead');
ok(!notes(at('2027-04-01T10:00:00+03:00'), EMPTY_STATE, { announce: false }).some((x) => x.id === 3), 'announcement off');
// Pesach 5785: Erev Pesach was Shabbat (12.4.2025); two days before is Thursday night, not Friday night
const ann85 = omerNotifications(new Date(2025, 3, 1, 12), 14, new Date(2025, 3, 1, 10), { ...ctx, prefs: { ...OMER_DEFAULTS } }, EMPTY_STATE).find((x) => x.id === 3);
ok(ann85 && ann85.at.getDay() === 4, `5785: the announcement avoids Shabbat (${ann85?.at})`);

// the whole plan, as the app makes it: counting removes tonight's reminders
store.set(SEASON_STATE_KEY('omer'), JSON.stringify(marks(range(1, 32))));
const plan1 = planNotifications({ now: at('2027-05-24T19:00:00+03:00'), city: jlm, settings: S, events: [] }).list.filter((x) => x.group === 'season');
store.set(SEASON_STATE_KEY('omer'), JSON.stringify(marks(range(1, 33))));
const plan2 = planNotifications({ now: at('2027-05-24T20:30:00+03:00'), city: jlm, settings: S, events: [] }).list.filter((x) => x.group === 'season');
ok(plan1.some((x) => x.at.getDate() === 24 && x.at.getHours() === 22), 'plan before counting: the bedtime reminder tonight');
ok(!plan2.some((x) => x.at.getDate() === 24), 'plan after counting: nothing left tonight');
ok(plan2.every((x) => x.channel === 'seasons' && x.id >= 400_000_000 && x.id < 500_000_000), 'season ids and channel');
ok(new Set(plan1.map((x) => x.id)).size === plan1.length, 'season ids are unique');
ok(plan1.length <= 20, `the Omer takes a modest share of the 64 (${plan1.length})`);

/* ---------------- the texts ---------------- */
const T: Record<number, string> = {
  1: 'הַיּוֹם יוֹם אֶחָד',
  7: 'הַיּוֹם שִׁבְעָה יָמִים, שֶׁהֵם שָׁבוּעַ אֶחָד',
  8: 'הַיּוֹם שְׁמוֹנָה יָמִים, שֶׁהֵם שָׁבוּעַ אֶחָד וְיוֹם אֶחָד',
  33: 'הַיּוֹם שְׁלוֹשָׁה וּשְׁלוֹשִׁים יוֹם, שֶׁהֵם אַרְבָּעָה שָׁבוּעוֹת וַחֲמִשָּׁה יָמִים',
  49: 'הַיּוֹם תִּשְׁעָה וְאַרְבָּעִים יוֹם, שֶׁהֵם שִׁבְעָה שָׁבוּעוֹת',
};
for (const [d, base] of Object.entries(T)) {
  ok(countText(+d, 'ashkenaz') === `${base} לָעֹמֶר.`, `Ashkenaz ${d}: ${countText(+d, 'ashkenaz')}`);
  ok(countText(+d, 'sefard') === `${base} בָּעֹמֶר.`, `Sefard ${d}: ${countText(+d, 'sefard')}`);
  ok(countText(+d, 'edot') === `${base} בָּעֹמֶר.`, `Edot HaMizrach ${d}: ${countText(+d, 'edot')}`);
}
ok(sefiraNiqqud(1) === 'חֶסֶד שֶׁבְּחֶסֶד' && sefiraNiqqud(33) === 'הוֹד שֶׁבְּהוֹד' && sefiraNiqqud(49) === 'מַלְכוּת שֶׁבְּמַלְכוּת', 'sefirot');
ok(sefiraNiqqud(4) === 'נֶצַח שֶׁבְּחֶסֶד' && sefiraNiqqud(6) === 'יְסוֹד שֶׁבְּחֶסֶד', `no stray dagesh: ${sefiraNiqqud(4)} ${sefiraNiqqud(6)}`);
ok(countTranslit(33, 'sefard') === "Hayom sh'loshah u'sh'loshim yom, shehem arba'ah shavu'ot va'chamishah yamim ba'omer.", countTranslit(33, 'sefard'));
ok(countTranslit(1, 'ashkenaz') === "Hayom yom echad la'omer." && countTranslit(8, 'sefard') === "Hayom sh'monah yamim, shehem shavu'a echad v'yom echad ba'omer.", 'transliteration 1, 8');
ok(weeksText(33) === '4 שבועות ו־5 ימים' && weeksText(14) === '2 שבועות' && weeksText(8) === 'שבוע אחד ויום אחד' && weeksText(1) === 'יום אחד', 'weeks');
setLang('en');
ok(weeksText(33) === '4 weeks, 5 days', 'weeks in English');
setLang('he');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
