// Records the silk ribbon videos in design/ribbon (see README.md there).
// The page runs on Playwright's fake clock and is stepped one frame at a time (30 fps), with a
// screenshot per frame: every frame is sharp and the motion is exactly what the app computes,
// whatever the speed of the machine that records it.
//
//   npm run dev -- --port 5181          (in another terminal)
//   node design/ribbon/record.cjs [base-url]
//
// Playwright is the copy installed globally with its browser (not a project dependency).
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.argv[2] || 'http://localhost:5181/';
const ONLY = process.argv[3]; // 'phone' or 'closeup'
const OUT = __dirname;
const FPS = 30;

// a fling: the page scrolls with a flick's speed and slows down as a phone's momentum scroll does
const FLING = `window.__fling = (v0) => {
  let v = v0, last = performance.now();
  const step = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    window.scrollBy(0, v * dt);
    v *= Math.exp(-dt / 0.28);
    if (Math.abs(v) > 20) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};`;

async function scene(browser, { theme, lang, time, dpr, clip, script, frames, dir }) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: dpr,
    colorScheme: theme,
    timezoneId: 'Asia/Jerusalem',
    locale: 'he-IL',
    serviceWorkers: 'block',
  });
  await ctx.clock.install({ time: new Date(time) });
  await ctx.addInitScript(([s]) => localStorage.setItem('luach.settings.v1', s), [JSON.stringify({ theme, lang, themeV: 2 })]);
  await ctx.addInitScript(FLING);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await page.evaluate(() => document.fonts.ready);
  const tabs = page.locator('.tabbar .tabbtn');
  const act = {
    gust: (s = 1) => page.evaluate((s) => { for (const r of window.__silk) r.gust(s); }, s),
    fling: (v) => page.evaluate((v) => window.__fling(v), v),
    tab: (i) => tabs.nth(i).click(),
    theme: (t) => page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), t),
    scrollTo: (y) => page.evaluate((y) => window.scrollTo(0, y), y),
  };
  let n = fs.readdirSync(dir).length;
  for (let f = 0; f < frames; f++) {
    if (script[f]) await script[f](act);
    await page.clock.runFor(1000 / FPS);
    const c = typeof clip === 'function' ? await clip(page) : clip;
    await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, '0')}.png`), clip: c });
  }
  await ctx.close();
}

const at = (s) => Math.round(s * FPS);
function encode(dir, file, scale) {
  // the close-up is doubled pixel for pixel, so its 4x detail shows at a viewable size
  const vf = scale ? `scale=${scale}:flags=neighbor,format=yuv420p` : 'format=yuv420p';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', path.join(OUT, file)]);
  console.log(file, (fs.statSync(path.join(OUT, file)).size / 1e6).toFixed(2), 'MB');
}

(async () => {
  const browser = await chromium.launch();

  // 1. the phone at 2x: Hebrew light, a fling, the tabs, dark; then English
  if (ONLY !== 'closeup') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ribbon-'));
    await scene(browser, {
      theme: 'light', lang: 'he', time: '2026-11-17T10:15:00+02:00', dpr: 2, dir, frames: at(33),
      script: {
        [at(5)]: (a) => a.gust(1),
        [at(11)]: (a) => a.fling(1500),
        [at(13.5)]: (a) => a.fling(-1500),
        [at(17)]: (a) => a.tab(1),
        [at(19)]: (a) => a.tab(2),
        [at(21)]: (a) => a.tab(0),
        [at(24.5)]: (a) => a.theme('dark'),
        [at(26)]: (a) => a.gust(1),
      },
    });
    await scene(browser, {
      theme: 'light', lang: 'en', time: '2026-11-20T10:15:00+02:00', dpr: 2, dir, frames: at(12),
      script: {
        [at(3.5)]: (a) => a.gust(0.9),
        [at(8)]: (a) => a.tab(1),
        [at(10)]: (a) => a.tab(0),
      },
    });
    encode(dir, 'ribbon-phone.mp4');
    fs.rmSync(dir, { recursive: true });
  }

  // 2. close up at 4x: the hero ribbon, following the card as the page scrolls
  if (ONLY !== 'phone') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ribbon-'));
    const clip = async (page) => {
      const b = await page.locator('.hero').boundingBox();
      // the card's inline-end corner (left in Hebrew)
      return { x: b.x, y: Math.max(0, b.y - 12), width: 100, height: 84 };
    };
    await scene(browser, {
      theme: 'light', lang: 'he', time: '2026-11-17T10:15:00+02:00', dpr: 4, dir, frames: at(30), clip,
      script: {
        [at(0)]: (a) => a.scrollTo(120),
        [at(4)]: (a) => a.gust(1),
        [at(12)]: (a) => a.fling(700),
        [at(15)]: (a) => a.fling(-700),
        [at(20)]: (a) => a.theme('dark'),
        [at(21)]: (a) => a.gust(1),
      },
    });
    encode(dir, 'ribbon-closeup-4x.mp4', 'iw*2:ih*2');
    fs.rmSync(dir, { recursive: true });
  }

  await browser.close();
})();
