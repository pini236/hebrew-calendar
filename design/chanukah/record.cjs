// Records the Chanukah videos in design/chanukah (see README.md there).
// The page runs on Playwright's fake clock at real Chanukah dates and is stepped one frame at a time
// (30 fps) with a screenshot per frame: every frame is sharp, and the motion is exactly what the app
// computes, whatever the speed of the machine that records it.
//
//   npm run dev -- --port 5191          (in another terminal)
//   node design/chanukah/record.cjs [base-url] [only: lighting|phone] [--frames <dir>]
//
// Playwright is the copy installed globally with its browser (not a project dependency).
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/opt/node-tools/node_modules'] }));
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const keep = args.includes('--frames') ? args[args.indexOf('--frames') + 1] : null;
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--frames');
const BASE = pos[0] || 'http://localhost:5191/';
const ONLY = pos[1];
const OUT = __dirname;
const FPS = 30;
const at = (s) => Math.round(s * FPS);

async function scene(browser, { theme = 'light', lang = 'he', time, dpr = 2, clip, script = {}, frames, dir, played, viewport = { width: 390, height: 844 } }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, colorScheme: theme, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', serviceWorkers: 'block' });
  await ctx.clock.install({ time: new Date(time) });
  // frozen: time moves only by runFor, one frame at a time, however long a screenshot takes
  await ctx.clock.pauseAt(new Date(Date.parse(time) + 200));
  await ctx.addInitScript(([s]) => localStorage.setItem('luach.settings.v1', s), [JSON.stringify({ theme, lang, themeV: 2 })]);
  // an evening whose lighting this device has already shown
  if (played) await ctx.addInitScript((k) => localStorage.setItem('luach.season.chanukah.v1', JSON.stringify({ lit: {}, played: k })), played);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(BASE);
  await page.clock.runFor(300);
  await page.waitForSelector('.hero');
  await page.evaluate(() => document.fonts.ready);
  // the card's pictures (they load with it)
  await page.waitForFunction(() => !document.querySelector('.ch-card') || window.__chanukiah?.ready, null, { timeout: 15000, polling: 100 });
  await page.clock.runFor(400);
  const act = {
    page,
    // a smooth scroll that eases in and out, as a finger would
    scrollTo: (sel, block = 'start', offset = 0) =>
      page.evaluate(
        ([sel, block, offset]) => {
          const el = typeof sel === 'number' ? null : document.querySelector(sel);
          const r = el?.getBoundingClientRect();
          const target = el ? window.scrollY + r.top - (block === 'center' ? (innerHeight - r.height) / 2 : 0) + offset : sel;
          const y0 = window.scrollY;
          const t0 = performance.now();
          const step = (t) => {
            const p = Math.min(1, (t - t0) / 900);
            const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
            window.scrollTo(0, y0 + (target - y0) * e);
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        },
        [sel, block, offset],
      ),
    click: (sel) => page.locator(sel).first().click(),
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

function encode(dir, file, crf = 24) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', path.join(OUT, file)]);
  console.log(file, (fs.statSync(path.join(OUT, file)).size / 1e6).toFixed(2), 'MB');
}
const frameDir = (name) => {
  const d = keep ? path.join(keep, name) : fs.mkdtempSync(path.join(os.tmpdir(), 'chanukah-'));
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f));
  return d;
};
const done = (d) => {
  if (!keep) fs.rmSync(d, { recursive: true });
};

// the card, wherever it is on the page
const cardClip = async (page) => {
  const b = await page.locator('.ch-card').boundingBox();
  return { x: Math.max(0, Math.round(b.x - 16)), y: Math.max(0, Math.round(b.y - 16)), width: Math.min(390, Math.round(b.width + 32)), height: Math.round(b.height + 32) };
};

(async () => {
  const browser = await chromium.launch();

  // 1. the lighting, close up: the fifth night, "הדלקתי" a few minutes before nightfall
  if (!ONLY || ONLY === 'lighting') {
    const dir = frameDir('lighting');
    await scene(browser, {
      time: '2026-12-08T17:11:20+02:00', dir, dpr: 3, frames: at(18), clip: cardClip,
      script: {
        [at(0)]: (a) => a.scrollTo('.ch-card', 'center'),
        [at(2.2)]: (a) => a.click('.ch-lit'),
      },
    });
    encode(dir, 'v2-lighting.mp4', 22);
    done(dir);
  }

  // 2. the phone: Friday 4.12 at 19:00 (the first night, with Shabbat) and Tuesday 8.12 at 18:30 (the fifth),
  //    each in the light and the dark theme. The first view of each evening plays its lighting; the second
  //    is a device that has already seen it, so the lights simply burn
  if (!ONLY || ONLY === 'phone') {
    const dir = frameDir('phone');
    await scene(browser, { time: '2026-12-04T19:00:00+02:00', dir, frames: at(9), script: { [at(1.4)]: (a) => a.scrollTo('.week', 'start', -8) } });
    await scene(browser, { time: '2026-12-04T19:00:00+02:00', dir, frames: at(5), theme: 'dark', played: '2026-12-04', script: { [at(0.6)]: (a) => a.scrollTo('.week', 'start', -8) } });
    await scene(browser, { time: '2026-12-08T18:30:00+02:00', dir, frames: at(14), theme: 'dark', script: { [at(1.4)]: (a) => a.scrollTo('.week', 'start', -8) } });
    await scene(browser, { time: '2026-12-08T18:30:00+02:00', dir, frames: at(6), played: '2026-12-08', script: { [at(0.6)]: (a) => a.scrollTo('.week', 'start', -8) } });
    encode(dir, 'v2-phone.mp4', 27);
    done(dir);
  }

  await browser.close();
})();
