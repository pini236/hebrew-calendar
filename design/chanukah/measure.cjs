// Measures what the Chanukah card costs (see README.md): main-thread busy time from Chrome's own
// counters (CDP Performance.getMetrics: TaskDuration), the CPU time of all of Chrome's processes (CDP
// SystemInfo.getProcessInfo: the compositor and the GPU process too), and the painter's own time per frame, over
// 10 s of real time at a real Chanukah moment, 390×844 at 2x, software rendering (no GPU).
//
//   npm run build && npx vite preview --port 5192      (in another terminal; a production build)
//   node design/chanukah/measure.cjs [base-url]
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));

const BASE = process.argv[2] || 'http://localhost:5192/';
const SECS = 10;

async function run(browser, label, { time, prep, played }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  // the clock starts at the moment and then runs in real time
  await ctx.clock.install({ time: new Date(time) });
  await ctx.addInitScript(() => localStorage.setItem('luach.settings.v1', JSON.stringify({ theme: 'light', lang: 'he', themeV: 2 })));
  // an evening whose lighting this device has already shown: the candles simply burn
  if (played) await ctx.addInitScript((k) => localStorage.setItem('luach.season.chanukah.v1', JSON.stringify({ lit: {}, played: k })), played);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.ch-card canvas');
  await page.waitForTimeout(1500);
  if (prep) await prep(page);
  await page.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const s0 = await page.evaluate(() => ({ ...window.__chanukiah.stats }));
  // all of Chrome's processes (the renderer's other threads, the compositor, the GPU process): CPU seconds
  const bcdp = await browser.newBrowserCDPSession();
  const cpu = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((a, p) => a + p.cpuTime, 0);
  const c0 = await cpu();
  const m0 = await get();
  const w0 = Date.now();
  await page.waitForTimeout(SECS * 1000);
  const m1 = await get();
  const c1 = await cpu();
  const s1 = await page.evaluate(() => ({ ...window.__chanukiah.stats }));
  const wall = (Date.now() - w0) / 1000;
  const frames = s1.frames - s0.frames;
  const busy = ((m1.TaskDuration - m0.TaskDuration) / wall) * 100;
  const all = ((c1 - c0) / wall) * 100;
  const script = ((m1.ScriptDuration - m0.ScriptDuration) / wall) * 100;
  const ms = frames ? (s1.frameMs - s0.frameMs) / frames : 0;
  console.log(
    `${label.padEnd(44)} card ${(frames / wall).toFixed(1).padStart(4)} fps · ${ms.toFixed(2)} ms/frame (max ${s1.maxFrameMs.toFixed(1)}) · main thread ${busy.toFixed(1)}% (script ${script.toFixed(1)}%) · all processes ${all.toFixed(1)}%`,
  );
  await ctx.close();
}

const scrollCard = (block) => (page) => page.evaluate((b) => document.querySelector('.ch-card').scrollIntoView({ block: b }), block);

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'before lighting (Fri 15:30), card + sky', { time: '2026-12-04T15:30:00+02:00' });
  await run(browser, 'lighting: 8 candles, the shamash moving', {
    time: '2026-12-11T18:00:00+02:00',
    // a fresh device: the lighting plays as the page opens (about 13 s for eight), measured from 2.7 s in
  });
  await run(browser, 'burning: 5 candles (Tue 18:30), card only', { time: '2026-12-08T18:30:00+02:00', played: '2026-12-08', prep: scrollCard('end') });
  await run(browser, 'burning: 8 + Shabbat (Fri 18:00), card + sky', { time: '2026-12-11T18:00:00+02:00', played: '2026-12-11' });
  await run(browser, 'card scrolled off screen (Tue 18:30)', { time: '2026-12-08T18:30:00+02:00', played: '2026-12-08', prep: (p) => p.evaluate(() => window.scrollTo(0, 99999)) });
  await browser.close();
})();
