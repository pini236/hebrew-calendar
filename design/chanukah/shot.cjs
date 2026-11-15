// A still of the app at a moment (for checking the Chanukah season by eye).
//   npm run dev -- --port 5191      (in another terminal)
//   node design/chanukah/shot.cjs <iso time> <out.png> [light|dark] [he|en] [scroll-to selector] [full]
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));

(async () => {
  const [time, out, theme = 'light', lang = 'he', target = '', full = ''] = process.argv.slice(2);
  const base = process.env.BASE || 'http://localhost:5191/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: +(process.env.DPR || 2),
    colorScheme: theme,
    timezoneId: 'Asia/Jerusalem',
    locale: 'he-IL',
    reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  await ctx.clock.install({ time: new Date(time) });
  const extra = process.env.SETTINGS ? JSON.parse(process.env.SETTINGS) : {};
  await ctx.addInitScript(([s]) => localStorage.setItem('luach.settings.v1', s), [JSON.stringify({ theme, lang, themeV: 2, ...extra })]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console:', m.text());
  });
  await page.goto(base);
  await page.waitForSelector('.hero');
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(1500);
  if (target) await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), target);
  await page.clock.runFor(+(process.env.WAIT || 2500));
  for (const sel of (process.env.CLICK || '').split('|').filter(Boolean)) {
    await page.locator(sel).first().click();
    await page.clock.runFor(600);
    await page.waitForTimeout(600); // CSS animations run on real time
  }
  const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined;
  await page.screenshot({ path: out, fullPage: !!full, clip });
  await browser.close();
})();
