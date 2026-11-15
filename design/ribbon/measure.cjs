// Measures what the silk ribbons cost (design/ribbon/README.md): the time spent in their frames
// (physics + paint, timed inside the page) and the main thread's busy time, in real time, at rest,
// in a gust and in a scroll fling. With CPU throttling 4x as a stand-in for a mid-range phone.
//
//   npm run dev -- --port 5181          (in another terminal)
//   node design/ribbon/measure.cjs [base-url]
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));

const BASE = process.argv[2] || 'http://localhost:5181/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('luach.settings.v1', JSON.stringify({ theme: 'light', lang: 'he', themeV: 2 })));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE || 4) });

  // time every ribbon frame from inside the page
  await page.evaluate(() => {
    const w = window;
    w.__cost = { ms: 0, frames: 0 };
    for (const r of w.__silk) {
      const f = r.frame.bind(r);
      r.frame = (t) => {
        const a = performance.now();
        const out = f(t);
        w.__cost.ms += performance.now() - a;
        w.__cost.frames++;
        return out;
      };
    }
  });
  const metric = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return m.TaskDuration;
  };
  async function window_(name, secs, action) {
    await page.evaluate(() => Object.assign(window.__cost, { ms: 0, frames: 0 }));
    const t0 = await metric();
    if (action) await action();
    await page.waitForTimeout(secs * 1000);
    const busy = (await metric()) - t0;
    const c = await page.evaluate(() => window.__cost);
    console.log(
      `${name.padEnd(28)} ribbon frames ${String(c.frames).padStart(4)}  ribbon ${(c.ms / secs).toFixed(2).padStart(6)} ms/s` +
        `  (${c.frames ? (c.ms / c.frames).toFixed(3) : '0.000'} ms/frame)  main thread busy ${((busy * 1000) / secs).toFixed(1).padStart(6)} ms/s`,
    );
  }
  await page.waitForTimeout(4000); // the drop settles
  await window_('at rest (Today, sky running)', 6);
  await window_('a gust (hero)', 6, () => page.evaluate(() => { for (const r of window.__silk) r.gust(1); }));
  await window_('a scroll fling and back', 6, () =>
    page.evaluate(async () => {
      window.scrollTo({ top: 400, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 900));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }),
  );
  // other tabs: no sky, only the tab ribbon, which is still
  await page.locator('.tabbar .tabbtn').nth(3).click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const w = window;
    for (const r of w.__silk) {
      if (r.__timed) continue;
      const f = r.frame.bind(r);
      r.__timed = true;
      r.frame = (t) => {
        const a = performance.now();
        const out = f(t);
        w.__cost.ms += performance.now() - a;
        w.__cost.frames++;
        return out;
      };
    }
  });
  await window_('at rest (another tab)', 6);
  await browser.close();
})();
