/**
 * Previews of the Android home-screen widget, for design review (design/widget/*.png).
 *
 * The widget is native code, and the cloud sandbox can't run an emulator, so this draws the same
 * layouts in HTML: the same sizes in dp, the same colours (android/app/src/main/res/values*), the same
 * date font (assets/fonts/widget_date.ttf), the same sky colours (src/lib/sky.ts, ported to
 * WidgetDraw.java) and the same data and decisions (buildWidgetData + widgetModel from src/lib/widget.ts).
 * The system sans of the phone is stood in for by Roboto + Noto Sans Hebrew (Android's defaults):
 * set WIDGET_SANS_DIR to a folder with roboto-latin-{400,500}-normal.woff2 and
 * noto-sans-hebrew-hebrew-{400,500}-normal.woff2, otherwise IBM Plex Sans Hebrew is used.
 *
 * Run: TZ=Asia/Jerusalem npx tsx scripts/widget-preview.ts
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CITIES } from '../src/lib/cities';
import { skyAt } from '../src/lib/sky';
import { DEFAULT_SETTINGS } from '../src/lib/store';
import { dateKey } from '../src/lib/cal';
import { buildWidgetData, widgetModel, type WidgetModel } from '../src/lib/widget';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = 'design/widget';
mkdirSync(OUT, { recursive: true });

/* ---------------- fonts ---------------- */
const b64 = (p: string) => readFileSync(p).toString('base64');
const SANS_DIR = process.env.WIDGET_SANS_DIR ?? '';
const hasSans = SANS_DIR && existsSync(`${SANS_DIR}/noto-sans-hebrew-hebrew-400-normal.woff2`);
const sansFace = (w: number) =>
  hasSans
    ? `@font-face{font-family:Sys;font-weight:${w};src:url(data:font/woff2;base64,${b64(`${SANS_DIR}/roboto-latin-${w}-normal.woff2`)})}
       @font-face{font-family:Sys;font-weight:${w};unicode-range:U+0590-05FF,U+FB1D-FB4F;src:url(data:font/woff2;base64,${b64(`${SANS_DIR}/noto-sans-hebrew-hebrew-${w}-normal.woff2`)})}`
    : `@font-face{font-family:Sys;font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/ibm-plex-sans-hebrew/files/ibm-plex-sans-hebrew-hebrew-${w}-normal.woff2`)})}`;
const FONTS = `
@font-face{font-family:WDate;src:url(data:font/ttf;base64,${b64('android/app/src/main/assets/fonts/widget_date.ttf')})}
${sansFace(400)}${sansFace(500)}`;

/* ---------------- colours: the same values as res/values/widget_colors.xml and values-night ---------------- */
const read = (p: string) =>
  Object.fromEntries([...readFileSync(p, 'utf8').matchAll(/<color name="(\w+)">#([0-9A-Fa-f]{6,8})<\/color>/g)].map((m) => [m[1], argb(m[2])]));
function argb(h: string) {
  if (h.length === 6) return `#${h}`;
  const a = parseInt(h.slice(0, 2), 16) / 255;
  const [r, g, b] = [2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
const COLORS = {
  light: read('android/app/src/main/res/values/widget_colors.xml'),
  dark: { ...read('android/app/src/main/res/values/widget_colors.xml'), ...read('android/app/src/main/res/values-night/widget_colors.xml') },
};

/* ---------------- data: the app's own widget data for Bnei Brak ---------------- */
const city = CITIES.find((c) => c.id === 'bnei-brak')!;
const data = buildWidgetData(new Date(2026, 10, 15, 12), 60, city, { ...DEFAULT_SETTINGS, cityId: city.id });

/* ---------------- the widget, as the layouts in res/layout/widget_*.xml draw it ---------------- */
type Size = 's' | 'm' | 'l' | 'wide';
/** a 360dp phone with 5 columns (the owner's Samsung): n cells are 66.5·n − 16 wide, 92.5·n − 19 tall */
const SIZES: Record<Size, { w: number; h: number; name: string }> = {
  s: { w: 117, h: 166, name: '2×2' },
  m: { w: 250, h: 166, name: '4×2' },
  wide: { w: 316, h: 166, name: '5×2' },
  l: { w: 250, h: 258, name: '4×3' },
};

/** Chronometer's text: MM:SS, or H:MM:SS from an hour */
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

/** the sky band (WidgetDraw.sky): 49 colour stops midnight→midnight, right to left */
function skyBand(m: WidgetModel, now: Date) {
  const day = data.days.find((d) => d.d === dateKey(now))!;
  const t = { dawn: new Date(day.sk[0]), sunrise: new Date(day.sk[1]), sunset: new Date(day.sk[2]), dusk: new Date(day.sk[3]) };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const stops: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const c = skyAt(start + (i / 48) * 86400000, t).background.match(/rgb\([^)]+\)/g)!;
    stops.push(`${c[1]} ${((i / 48) * 100).toFixed(2)}%`);
  }
  const x = (f: number) => `${((1 - f) * 100).toFixed(2)}%`;
  return `<div class="sky">
    <div class="band" style="background:linear-gradient(to left, ${stops.join(',')})"></div>
    <i class="mark" style="left:${x(m.sky.sunrise)}"></i><i class="mark" style="left:${x(m.sky.sunset)}"></i>
    <i class="now" style="left:${x(m.sky.now)}"></i>
  </div>`;
}

const CANDLE = `<svg class="candle" viewBox="0 0 16 16"><path d="M8 1.6c1.1 1.3 1.6 2.2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.8.5-1.7 1.6-3Z" fill="currentColor"/><path d="M5.6 7.6h4.8v6.8H5.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

function widget(m: WidgetModel, now: Date, size: Size) {
  const { w, h } = SIZES[size];
  const small = size === 's';
  const left = (m.next?.at ?? now.getTime()) - now.getTime();
  // the date is one bitmap (WidgetDraw.date): an em of 28dp, the year 0.78 of it and lighter; the small size leaves the year out
  const date = `<div class="date"><span>${m.dayMonth}</span>${small ? '' : ` <span class="yr">${m.year}</span>`}</div>`;
  const next = m.next
    ? `<div class="nname">${m.next.name}</div><div class="ntime">${m.next.time}</div><div class="count">בעוד ${countdown(left)}</div>`
    : '';
  const holy = m.holy
    ? `<div class="hname">${m.holy.name}</div>
       <div class="hrow">${m.holy.candlesToday ? CANDLE : ''}<span class="hl">כניסה</span><span class="ht ${m.holy.candlesToday ? 'rib' : m.holy.inside ? 'past' : ''}">${m.holy.candles}</span></div>
       <div class="hrow"><span class="hl">יציאה</span><span class="ht">${m.holy.havdalah}</span></div>`
    : '';
  const list = m.list.items
    .map((it) => `<div class="slot ${it.state}"><i class="tab"></i><span class="sn">${it.name}</span><span class="st">${it.time}</span></div>`)
    .join('');
  const side = m.sideKind === 'chag' ? 'chag' : m.sideKind === 'label' ? 'label' : 'muted';
  const row2 = small
    ? `<div class="row2"><span class="greg">${m.eve ? m.side : m.greg.split(' · ')[1]}</span></div>`
    : `<div class="row2"><span class="greg">${m.greg}</span><span class="side ${side}">${m.side}</span></div>`;
  const body = small
    ? `${row2}<div class="sp"></div><i class="rule"></i><div class="col">${next}</div>`
    : size === 'l'
      ? `${row2}<div class="sp"></div>${skyBand(m, now)}<div class="sp"></div>
         <div class="lower"><div class="col c44">${next}<div class="sp"></div>${holy}</div><i class="vrule l"></i><div class="col c56">${list}</div></div>`
      : `${row2}<div class="sp"></div>${skyBand(m, now)}<div class="sp"></div>
         <div class="lower"><div class="col">${next}</div><i class="vrule"></i><div class="col">${holy}</div></div>`;
  return `<div class="w ${small ? 's' : ''}" style="width:${w}px;height:${h}px">
    <i class="ribbon"></i>
    <div class="content">${date}${body}</div>
  </div>`;
}

const CSS = (theme: 'light' | 'dark') => {
  const c = COLORS[theme];
  return `
  ${FONTS}
  *{box-sizing:border-box;margin:0;padding:0}
  .w{position:relative;border-radius:20px;background:${c.widget_paper};box-shadow:inset 0 0 0 1px ${c.widget_edge};direction:rtl;font-family:Sys;color:${c.widget_ink};overflow:hidden;font-variant-numeric:tabular-nums}
  .ribbon{position:absolute;top:0;right:16px;width:10px;height:18px;background:${c.widget_ribbon};clip-path:polygon(0 0,100% 0,100% 100%,50% 72%,0 100%)}
  .s .ribbon{right:14px}
  .content{position:absolute;inset:0;padding:20px 16px 12px;display:flex;flex-direction:column}
  .s .content{padding:20px 14px 12px}
  .date{flex:none;font-family:WDate;font-size:28px;line-height:28px;height:28px;white-space:nowrap;color:${c.widget_date}}
  .date .yr{opacity:${(158 / 255).toFixed(3)};font-size:${(28 * 0.78).toFixed(2)}px}
  .row2{flex:none;display:flex;align-items:baseline;font-size:12px;line-height:16px;margin-top:2px;white-space:nowrap}
  .greg{flex:1;min-width:0;color:${c.widget_muted};overflow:hidden;text-overflow:ellipsis}
  .side{margin-right:8px}
  .side.muted{color:${c.widget_muted}}
  .side.label{color:${c.widget_ink};font-weight:500}
  .side.chag{color:${c.widget_chag};font-weight:500}
  .sp{flex:1}
  .rule{flex:none;display:block;height:1px;margin-bottom:8px;background:${c.widget_line}}
  .sky{flex:none;position:relative;height:10px;margin:6px 0}
  .sky .band{position:absolute;left:0;right:0;top:2px;height:6px;border-radius:3px}
  .sky .mark{position:absolute;top:2px;width:1px;height:6px;background:rgba(255,255,255,.55);transform:translateX(-.5px)}
  .sky .now{position:absolute;top:0;width:2px;height:10px;border-radius:1px;background:#E3A73A;transform:translateX(-1px)}
  .lower{flex:none;display:flex}
  .col{flex:1;min-width:0;display:flex;flex-direction:column}
  .c44{flex:46}.c56{flex:54}
  .vrule{display:block;flex:none;width:1px;background:${c.widget_line};margin:0 12px}
  .vrule.l{margin:0 10px 0 3px}
  .nname,.hname{font-size:12px;line-height:16px;color:${c.widget_muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ntime{font-size:26px;line-height:30px;font-weight:500;margin-top:1px}
  .count{font-size:12px;line-height:16px;color:${c.widget_ribbon_ink};font-weight:500}
  .hrow{display:flex;align-items:center;height:22px}
  .hl{flex:1;font-size:12px;color:${c.widget_muted}}
  .ht{font-size:16px;font-weight:500}
  .ht.rib{color:${c.widget_ribbon_ink}}
  .ht.past{color:${c.widget_muted}}
  .candle{width:14px;height:14px;margin-left:3px;color:${c.widget_ribbon_ink}}
  .slot{display:flex;align-items:center;font-size:11px;height:15px;white-space:nowrap}
  .slot .sn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .slot.past{color:${c.widget_muted}}
  .slot.next{color:${c.widget_ribbon_ink}}
  .tab{flex:none;width:5px;height:10px;margin-left:4px;background:${c.widget_ribbon};clip-path:polygon(0 0,100% 0,100% 100%,50% 70%,0 100%);visibility:hidden}
  .slot.next .tab{visibility:visible}
  `;
};

/* ---------------- backgrounds ---------------- */
/** A busy, photo-like wallpaper (an out-of-focus street in autumn light), drawn in a canvas with a fixed seed */
const BUSY_SCRIPT = `
const cv = document.getElementById('bg'); const W = cv.width = 1080, H = cv.height = 2040; const g = cv.getContext('2d');
let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#9fb3c4'); sky.addColorStop(.32, '#dfe3e2'); sky.addColorStop(.38, '#8b7a63'); sky.addColorStop(.7, '#b3a58f'); sky.addColorStop(1, '#5d564c');
g.fillStyle = sky; g.fillRect(0, 0, W, H);
g.filter = 'blur(18px)';
for (let i = 0; i < 70; i++) { g.fillStyle = ['#3c4a2e','#6b7d3f','#c9a14a','#e7d9b0','#2c2a26','#8d5a35','#f2efe6','#4f6f8f'][i % 8]; g.globalAlpha = .35 + r() * .5; g.beginPath(); g.ellipse(r() * W, 300 + r() * 1300, 40 + r() * 220, 30 + r() * 160, r() * 3, 0, 7); g.fill(); }
g.filter = 'blur(3px)';
for (let i = 0; i < 160; i++) { g.fillStyle = ['#fff7dc','#ffd27a','#ffffff','#c5e0ff'][i % 4]; g.globalAlpha = .25 + r() * .55; g.beginPath(); g.arc(r() * W, r() * H * .75, 6 + r() * 34, 0, 7); g.fill(); }
g.globalAlpha = 1; g.filter = 'blur(7px)';
for (let i = 0; i < 9; i++) { const x = r() * W, y = 900 + r() * 700, h = 380 + r() * 420; g.fillStyle = ['#1f1d1b','#e9e1d2','#33415c','#7a2e2a','#d8c7a4'][i % 5]; g.beginPath(); g.ellipse(x, y + h * .45, 40 + r() * 40, h * .5, 0, 0, 7); g.fill(); g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(x, y - h * .08, 34, 0, 7); g.fill(); }
g.filter = 'blur(2px)'; g.strokeStyle = 'rgba(40,36,30,.35)'; g.lineWidth = 3; for (let y = 1500; y < H; y += 54) for (let x = (y / 54) % 2 ? 0 : 48; x < W; x += 96) g.strokeRect(x, y, 90, 50);
const im = g.getImageData(0, 0, W, H); for (let i = 0; i < im.data.length; i += 4) { const n = (r() - .5) * 12; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0);
`;

function page(theme: 'light' | 'dark', bg: 'busy' | 'plain' | 'none', body: string, W: number, H: number) {
  const plain = bg === 'none' ? 'transparent' : theme === 'light' ? '#c9d1d9' : '#1f252b';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(theme)}
  body{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${plain}}
  #bg{position:absolute;inset:0;width:100%;height:100%}
  </style></head><body>${bg === 'busy' ? `<canvas id="bg"></canvas><script>{${BUSY_SCRIPT}}</script>` : ''}${body}</body></html>`;
}

/* ---------------- scenes: the app's own data for Bnei Brak ---------------- */
const SCENES = [
  { id: 'weekday', at: '2026-11-15T08:13:00+02:00' },
  { id: 'friday', at: '2026-11-20T10:15:00+02:00' },
  { id: 'friday-night', at: '2026-11-20T19:40:00+02:00' },
];

const browser = await chromium.launch();

async function shot(html: string, path: string, W: number, H: number, scale = 2, transparent = false) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  p.on('pageerror', (e: Error) => console.log('page error:', e.message));
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path, omitBackground: transparent });
  await ctx.close();
}

/** a home screen of a 360dp phone (5 columns, cells 66.5 × 92.5dp), the widgets where a person would put them */
const home = (m: WidgetModel, now: Date) => `
  <div style="position:absolute;top:24px;right:22px">${widget(m, now, 'm')}</div>
  <div style="position:absolute;top:213px;right:22px">${widget(m, now, 's')}</div>
  <div style="position:absolute;top:402px;right:22px">${widget(m, now, 'l')}</div>`;

for (const sc of SCENES) {
  const now = new Date(sc.at);
  const m = widgetModel(data, now)!;
  for (const theme of ['light', 'dark'] as const) {
    for (const bg of ['busy', 'plain'] as const) {
      await shot(page(theme, bg, home(m, now), 360, 684), `${OUT}/${sc.id}-${theme}-${bg}.png`, 360, 684);
    }
  }
}

// the 5×2 (full width) on the busy wallpaper, light and dark
{
  const now = new Date(SCENES[1].at);
  const m = widgetModel(data, now)!;
  for (const theme of ['light', 'dark'] as const) {
    await shot(page(theme, 'busy', `<div style="position:absolute;top:24px;right:22px">${widget(m, now, 'wide')}</div>`, 360, 214), `${OUT}/wide-${theme}-busy.png`, 360, 214);
  }
}

// the picture in the launcher's widget list (res/drawable-nodpi/widget_preview.png), at a phone's 3x
{
  const now = new Date(SCENES[0].at);
  const m = widgetModel(data, now)!;
  await shot(page('light', 'none', `<div style="position:absolute;top:0;left:0">${widget(m, now, 'm')}</div>`, 250, 166), 'android/app/src/main/res/drawable-nodpi/widget_preview.png', 250, 166, 3, true);
}
// overview: four of the sheets side by side
{
  const pick = ['weekday-light-busy', 'weekday-dark-busy', 'friday-light-plain', 'friday-night-dark-plain'];
  const imgs = pick.map((n) => `<img src="data:image/png;base64,${b64(`${OUT}/${n}.png`)}">`).join('');
  const html = `<!doctype html><style>body{margin:0;background:#e9e6df;display:flex;gap:16px;padding:16px;width:max-content}img{width:270px;height:513px;display:block}</style><body>${imgs}</body>`;
  await shot(html, `${OUT}/overview.png`, 4 * 270 + 5 * 16, 513 + 32);
}
await browser.close();
console.log('previews in', OUT);
