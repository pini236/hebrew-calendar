// Store screenshots: photographs the built app (npm run build) with Playwright and frames each
// screen under a short Hebrew heading. Output: store/screenshots/{android,ios}-*.png and the
// Play feature graphic. Run: npm run build && npm run screenshots
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

// Playwright is the copy installed globally with its browser (not a project dependency)
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = 'store/screenshots';
const GREEN = '#1E5A45';
const CREAM = '#F6F0E2';

const font = (p) => `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${p}`).toString('base64')}`;
const FONTS = `
@font-face{font-family:F;font-weight:500;src:url(${font('frank-ruhl-libre/files/frank-ruhl-libre-hebrew-500-normal.woff2')})}
@font-face{font-family:A;font-weight:400;src:url(${font('assistant/files/assistant-hebrew-400-normal.woff2')})}
@font-face{font-family:A;font-weight:600;src:url(${font('assistant/files/assistant-hebrew-600-normal.woff2')})}`;
const ICON = `data:image/png;base64,${readFileSync('assets/icon-only.png').toString('base64')}`;

// sample events for the "שלי" tab (the picture is taken on Friday 20.11.2026)
const EVENTS = [
  { id: 'e1', title: 'סעודת שבת אצל סבתא', date: '2026-11-20', repeat: 'none', color: '#3f8f6b', time: '18:30' },
  { id: 'e2', title: 'רופא שיניים', date: '2026-11-23', repeat: 'none', color: '#c49a2c', time: '09:30' },
  { id: 'e3', title: 'יום נישואין', date: '2015-11-24', repeat: 'greg-yearly', color: '#b5487a', remind: 'day' },
  { id: 'e4', title: 'יום הולדת לאבא', date: '1961-12-04', repeat: 'heb-yearly', color: '#e0793c', remind: 'eve' },
  { id: 'e5', title: 'יארצייט סבא משה', date: '2008-01-12', repeat: 'heb-yearly', color: '#4a6fd1', remind: 'eve' },
  { id: 'e6', title: 'יום הולדת לנועה', date: '2017-03-24', repeat: 'heb-yearly', color: '#8a6ad6' },
];

const FRIDAY = '2026-11-20T10:15:00+02:00';
const SHOTS = [
  { name: '1-today', time: FRIDAY, h: 'היום, במבט אחד', sub: 'התאריך העברי, הזמן הבא ומתי נכנסת השבת' },
  { name: '2-zmanim', time: FRIDAY, tab: 'זמנים', h: 'זמני היום המדויקים', sub: 'לפי הגר״א ומגן אברהם, לכל מקום בעולם' },
  { name: '3-month', time: FRIDAY, tab: 'לוח', monthMode: 'heb', h: 'לוח עברי ולועזי', sub: 'חודש שלם, עם החגים, המועדים והאירועים שלך' },
  { name: '4-friday', time: FRIDAY, notify: true, h: 'התראה בכל יום שישי', sub: 'עם שעת הדלקת הנרות ושעת צאת השבת' },
  { name: '5-mine', time: FRIDAY, tab: 'שלי', h: 'ימי הולדת ואזכרות', sub: 'לפי התאריך העברי, עם תזכורת מראש' },
  { name: '6-night', time: '2026-12-04T19:40:00+02:00', theme: 'dark', h: 'נוח לעיניים גם בלילה', sub: 'מצב כהה, ושבת וחנוכה באותו מסך' },
];

const DEVICES = [
  // Play: 1080×1920. App Store: iPhone 6.9" 1320×2868
  { id: 'android', W: 1080, H: 1920, top: 330, side: 90, bottom: 90, brand: '', radius: 40, hSize: 76, sSize: 38 },
  { id: 'ios', W: 1320, H: 2868, top: 470, side: 110, bottom: 110, brand: 'ios', radius: 56, hSize: 96, sSize: 46 },
];

function frame(dev, shot, png) {
  const w = dev.W - dev.side * 2;
  const h = dev.H - dev.top - dev.bottom;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>${FONTS}
  *{margin:0;box-sizing:border-box}
  body{width:${dev.W}px;height:${dev.H}px;background:${GREEN};color:${CREAM};overflow:hidden;position:relative}
  header{position:absolute;top:0;left:0;right:0;height:${dev.top}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:${Math.round(dev.sSize * 0.45)}px;padding-top:${Math.round(dev.top * 0.06)}px}
  h1{font:500 ${dev.hSize}px/1.1 F;letter-spacing:0}
  p{font:400 ${dev.sSize}px/1.3 A;opacity:.82}
  .shot{position:absolute;left:${dev.side}px;top:${dev.top}px;width:${w}px;height:${h}px;border-radius:${dev.radius}px;overflow:hidden;box-shadow:0 0 0 2px rgba(0,0,0,.18)}
  .shot img{width:100%;height:100%;display:block}
  </style></head><body><header><h1>${shot.h}</h1><p>${shot.sub}</p></header>
  <div class="shot"><img src="data:image/png;base64,${png.toString('base64')}"></div></body></html>`;
}

function notification(dev, brandName) {
  // the Friday notification, with the same wording the app sends (src/lib/ics.ts nativeAlerts)
  const ios = dev.id === 'ios';
  return `
  const d = document.createElement('div');
  d.innerHTML = \`<div style="position:fixed;inset:0;background:rgba(10,12,10,.38);z-index:9998"></div>
  <div dir="rtl" style="position:fixed;top:14px;left:10px;right:10px;z-index:9999;background:${ios ? 'rgba(250,249,246,.96)' : '#fbfaf7'};border-radius:${ios ? 22 : 26}px;padding:14px 16px 15px;box-shadow:0 8px 30px rgba(0,0,0,.25);font-family:Assistant,system-ui;color:#1b1b18">
    <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#5d5d57">
      <img src="${ICON}" style="width:20px;height:20px;border-radius:5px"><span>${brandName}</span><span>·</span><span>08:00</span>
    </div>
    <div style="font-weight:600;font-size:16px;margin-top:8px">שבת פרשת ויצא</div>
    <div style="font-size:15px;margin-top:3px;color:#2c2c28">כניסה 15:57 · יציאה 17:16 · ירושלים</div>
  </div>\`;
  document.body.appendChild(d);`;
}

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];

for (const dev of DEVICES) {
  const vw = 390;
  const vh = Math.round((vw * (dev.H - dev.top - dev.bottom)) / (dev.W - dev.side * 2));
  const brandName = dev.id === 'ios' ? 'לוח עברי' : 'לוח יהודי';
  for (const shot of SHOTS) {
    const theme = shot.theme ?? 'light';
    const ctx = await browser.newContext({
      viewport: { width: vw, height: vh },
      deviceScaleFactor: 3,
      colorScheme: theme,
      timezoneId: 'Asia/Jerusalem',
      locale: 'he-IL',
      serviceWorkers: 'block',
    });
    await ctx.clock.install({ time: new Date(shot.time) });
    await ctx.addInitScript(
      ([settings, events]) => {
        localStorage.setItem('luach.settings.v1', settings);
        localStorage.setItem('luach.events.v1', events);
      },
      [JSON.stringify({ theme, monthMode: shot.monthMode ?? 'greg' }), JSON.stringify(EVENTS)],
    );
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${dev.id}/${shot.name}: ${e.message}`));
    await page.goto(base + (dev.brand ? `?brand=${dev.brand}` : ''));
    await page.waitForSelector('.tabbar');
    await page.evaluate(() => document.fonts.ready);
    if (shot.tab) await page.locator('.tabbar').getByRole('button', { name: shot.tab, exact: true }).click();
    await page.waitForTimeout(700);
    if (shot.notify) await page.evaluate(notification(dev, brandName));
    await page.waitForTimeout(150);
    const png = await page.screenshot();
    await ctx.close();

    const fctx = await browser.newContext({ viewport: { width: dev.W, height: dev.H }, deviceScaleFactor: 1 });
    const fp = await fctx.newPage();
    await fp.setContent(frame(dev, shot, png));
    await fp.evaluate(() => document.fonts.ready);
    await fp.screenshot({ path: `${OUT}/${dev.id}-${shot.name}.png` });
    await fctx.close();
    console.log(`${dev.id}-${shot.name}.png`);
  }
}

// Google Play feature graphic, 1024×500
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>${FONTS}
  *{margin:0}body{width:1024px;height:500px;background:${GREEN};color:${CREAM};display:flex;align-items:center;justify-content:center;gap:88px;overflow:hidden}
  h1{font:500 112px/1 F}p{font:400 36px/1.35 A;opacity:.85;margin-top:22px}
  img{width:260px;height:260px;border-radius:58px;box-shadow:0 14px 40px rgba(0,0,0,.28)}
  </style></head><body><div><h1>לוח יהודי</h1><p>זמני היום, שבת וחגים<br>בלי פרסומות</p></div><img src="${ICON}"></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/play-feature-graphic.png` });
  await ctx.close();
  console.log('play-feature-graphic.png');
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
