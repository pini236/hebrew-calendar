// Preview screenshots of the Omer season (design/omer, see README.md there): the card on היום at
// real moments of Pesach 5787 (April 2027) in Jerusalem, the introduction screen, the count sheet,
// and the Android widget (drawn by OmerWidgetMock, the HTML twin of the native widget).
//
//   npx vite --port 5288            (in another terminal)
//   node design/omer/shoot.cjs [base-url] [only]
//
// Playwright is the copy installed globally with its browser (not a project dependency).
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.argv[2] || 'http://localhost:5288/';
const ONLY = process.argv[3];
const OUT = __dirname;

const SETTINGS = (theme, lang = 'he', extra = {}) => ({ cityId: 'jerusalem', theme, themeV: 2, lang, ...extra });
// marks: Hebrew year 5787, day → 'night' | 'day'
const marks = (days) => ({ v: 1, days: Object.fromEntries(Object.entries(days).map(([n, how]) => [`5787:${n}`, { how, at: 0 }])) });
const upTo = (n, skip = [], how = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) => i + 1).filter((k) => !skip.includes(k)).map((k) => [k, how[k] || 'night']));

const SHOTS = [
  // 15 Nisan (Thursday 22.4.2027), afternoon: the count begins tonight
  { name: 'card-1-before', time: '2027-04-22T17:30:00+03:00', state: marks({}) },
  // day 33 (Lag BaOmer is Tuesday 25.5.2027): the evening of day 32, after nightfall, not counted yet
  { name: 'card-2-tonight', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])) },
  // the same evening, counted (the moment after the tap)
  { name: 'card-3-counted', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), tap: true },
  // Lag BaOmer afternoon: the day that is ending, and when the next count begins
  { name: 'card-4-before-nightfall', time: '2027-05-25T17:46:00+03:00', state: marks(upTo(33, [2, 9, 16, 23, 30])) },
  // a whole day missed (day 20): tonight continues without a blessing
  { name: 'card-5-missed', time: '2027-05-24T21:10:00+03:00', state: marks(upTo(32, [2, 9, 16, 20, 23, 30])) },
  // the night was missed, it is morning: count by day, without a blessing
  { name: 'card-6-by-day', time: '2027-05-25T09:15:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])) },
  { name: 'card-2-tonight-dark', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), theme: 'dark' },
  { name: 'card-4-before-nightfall-dark', time: '2027-05-25T17:46:00+03:00', state: marks(upTo(33, [2, 9, 16, 23, 30])), theme: 'dark' },
  { name: 'card-2-tonight-en', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), lang: 'en' },
  { name: 'card-2-tonight-xl', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), text: 'xlarge', w: 360 },
  // the count, opened from the card
  { name: 'sheet-count', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), sheet: true, full: true },
  { name: 'sheet-count-en', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), sheet: true, full: true, lang: 'en' },
  { name: 'sheet-count-dark', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), sheet: true, full: true, theme: 'dark' },
  // the introduction, as the notification two days before Pesach opens it (Tuesday 20.4.2027, 20:00)
  { name: 'intro', time: '2027-04-20T20:00:00+03:00', state: marks({}), intro: true, full: true, platform: 'android' },
  { name: 'intro-dark', time: '2027-04-20T20:00:00+03:00', state: marks({}), intro: true, full: true, platform: 'android', theme: 'dark' },
  // the whole Today screen, for context
  { name: 'today', time: '2027-05-24T20:40:00+03:00', state: marks(upTo(32, [2, 9, 16, 23, 30])), full: true },
];

async function shot(browser, s) {
  const theme = s.theme || 'light';
  const ctx = await browser.newContext({
    viewport: { width: s.w || 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    timezoneId: 'Asia/Jerusalem',
    locale: s.lang === 'en' ? 'en-US' : 'he-IL',
    serviceWorkers: 'block',
    reducedMotion: 'no-preference',
  });
  await ctx.clock.install({ time: new Date(s.time) });
  await ctx.addInitScript(
    ([settings, state]) => {
      localStorage.setItem('luach.settings.v1', JSON.stringify(settings));
      localStorage.setItem('luach.season.omer.v1', JSON.stringify(state));
    },
    [SETTINGS(theme, s.lang, s.text ? { textSize: s.text } : {}), s.state],
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + (s.platform ? `?platform=${s.platform}` : ''));
  await page.clock.resume();
  await page.waitForSelector('.omer, .tab', { timeout: 15000 });
  await page.waitForTimeout(1200);
  if (s.tap) {
    await page.click('.om-go');
    await page.waitForTimeout(1400);
  }
  if (s.sheet) {
    await page.click('.om-day');
    await page.waitForTimeout(700);
  }
  if (s.intro) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('luachi:open', { detail: 'omer-intro' })));
    await page.waitForSelector('.oi', { timeout: 10000 });
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, `${s.name}.png`);
  if (s.full) {
    if (s.intro) {
      const h = await page.evaluate(() => document.querySelector('.screen').scrollHeight);
      await page.setViewportSize({ width: s.w || 390, height: Math.max(844, h) });
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: file });
  } else {
    await page.setViewportSize({ width: s.w || 390, height: 1500 });
    await page.waitForTimeout(500);
    const card = await page.$('.omer');
    if (!card) throw new Error(`${s.name}: no card`);
    const b = await card.boundingBox();
    await page.screenshot({ path: file, clip: { x: 0, y: Math.max(0, b.y - 16), width: s.w || 390, height: b.height + 32 } });
  }
  if (errors.length) console.log(`  ${s.name}: ${errors.join(' | ')}`);
  console.log(`${s.name}.png`);
  await ctx.close();
}

// the widget's HTML twin (/omer-demo.html) on a home screen, and the launcher's preview image
const WIDGETS = [
  { name: 'widget-tonight', q: 'at=2027-05-24T20:40:00%2B03:00&marks=1-32&skip=2,9,16,23,30' },
  { name: 'widget-counted', q: 'at=2027-05-24T21:00:00%2B03:00&marks=1-33&skip=2,9,16,23,30' },
  { name: 'widget-before', q: 'at=2027-04-10T12:00:00%2B03:00' },
  { name: 'widget-after', q: 'at=2027-06-13T12:00:00%2B03:00&marks=1-49&skip=2,9,16,23,30,37' },
  { name: 'widget-no-marks', q: 'at=2027-05-03T10:00:00%2B03:00' },
];
async function widget(browser, w, theme, file, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 600 }, deviceScaleFactor: 3, colorScheme: theme, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}omer-demo.html?${w.q}&theme=${theme}${extra}`);
  await page.waitForSelector('#shot .ow');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const el = await page.$(extra ? '#shot .ow' : '#shot');
  await el.screenshot({ path: file, omitBackground: !!extra });
  console.log(path.basename(file));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const s of SHOTS) if (!ONLY || s.name.startsWith(ONLY)) await shot(browser, s);
  for (const w of WIDGETS)
    for (const theme of ['light', 'dark']) if (!ONLY || w.name.startsWith(ONLY)) await widget(browser, w, theme, path.join(OUT, `${w.name}-${theme}.png`));
  if (!ONLY || ONLY === 'preview')
    await widget(browser, WIDGETS[0], 'light', path.resolve(OUT, '../../android/app/src/main/res/drawable-nodpi/omer_widget_preview.png'), '&preview');
  await browser.close();
})();
