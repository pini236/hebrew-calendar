/**
 * The Omer widget's HTML twin with real data: /omer-demo.html under `npm run dev`. Not part of the app build.
 * design/omer/shoot.cjs photographs it on a phone's home screen (light and dark, every size, on a busy
 * photo-like wallpaper and on a plain one) and makes the launcher's preview image
 * (res/drawable-nodpi/omer_widget_preview.png).
 * ?at=<ISO time>&marks=<days counted, e.g. 1-32>&skip=<days not marked, e.g. 2,9>&theme=light|dark
 *  &bg=busy|plain&lang=he|en&nusach=ashkenaz|sefard|edot&sizes=m,s,w,t&preview
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css';
import '../styles.css';
import { findCity } from '../lib/cities';
import { setLang } from '../lib/i18n';
import { DEFAULT_SETTINGS } from '../lib/store';
import { EMPTY_STATE, mark, type Nusach, type OmerState } from '../lib/seasons/omer';
import { buildWidgetData, omerWidgetModel, widgetOmer } from '../lib/widget';
import { OW_SIZES, OmerWidgetMock, type OmerWidgetSize } from '../components/seasons/OmerWidgetMock';

// the widget's own font file for the large figures, as the phone draws them (OmerWidgetMock falls back to the app's)
const face = document.createElement('style');
face.textContent = "@font-face{font-family:WDate;src:url('/android/app/src/main/assets/fonts/widget_date.ttf')}";
document.head.append(face);

const q = new URLSearchParams(location.search);
setLang(q.get('lang') === 'en' ? 'en' : 'he');
const theme = (q.get('theme') as 'light' | 'dark') || 'light';
document.documentElement.setAttribute('data-theme', theme);
const now = q.get('at') ? new Date(q.get('at')!) : new Date();
const city = findCity('jerusalem')!;
const settings = { ...DEFAULT_SETTINGS, cityId: city.id, theme, seasons: { omer: { nusach: (q.get('nusach') as Nusach) || 'sefard' } } };
// the launcher's preview image: the widget alone, on nothing (its corners stay transparent)
const preview = q.has('preview');
if (preview) for (const el of [document.documentElement, document.body]) el.style.background = 'transparent';

// the marks: days 1..N counted, some left unmarked
let st: OmerState = EMPTY_STATE;
const [a, b] = (q.get('marks') || '0-0').split('-').map(Number);
const skip = new Set((q.get('skip') || '').split(',').filter(Boolean).map(Number));
const year = widgetOmer(now, city, settings, EMPTY_STATE).y;
for (let k = a; k <= b; k++) if (k > 0 && !skip.has(k)) st = mark(st, year, k, 'night', 0);
const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
const data = buildWidgetData(day, 3, city, settings, st);
const m = omerWidgetModel(data, now)!;

const ribbon = '/android/app/src/main/res/drawable-nodpi/widget_ribbon_f00.png';
const sizes = (q.get('sizes') || 'm,s,w,t').split(',') as OmerWidgetSize[];

/** A busy, photo-like wallpaper (an out-of-focus street in autumn light), drawn with a fixed seed (as scripts/widget-preview.ts) */
function Busy() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const W = (cv.width = 1080);
    const H = (cv.height = 2700);
    const g = cv.getContext('2d')!;
    let s = 11;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9fb3c4');
    sky.addColorStop(0.3, '#dfe3e2');
    sky.addColorStop(0.36, '#8b7a63');
    sky.addColorStop(0.7, '#b3a58f');
    sky.addColorStop(1, '#5d564c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.filter = 'blur(18px)';
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ['#3c4a2e', '#6b7d3f', '#c9a14a', '#e7d9b0', '#2c2a26', '#8d5a35', '#f2efe6', '#4f6f8f'][i % 8];
      g.globalAlpha = 0.35 + r() * 0.5;
      g.beginPath();
      g.ellipse(r() * W, 300 + r() * 1900, 40 + r() * 220, 30 + r() * 160, r() * 3, 0, 7);
      g.fill();
    }
    g.filter = 'blur(3px)';
    for (let i = 0; i < 200; i++) {
      g.fillStyle = ['#fff7dc', '#ffd27a', '#ffffff', '#c5e0ff'][i % 4];
      g.globalAlpha = 0.25 + r() * 0.55;
      g.beginPath();
      g.arc(r() * W, r() * H * 0.8, 6 + r() * 34, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    g.filter = 'blur(7px)';
    for (let i = 0; i < 12; i++) {
      const x = r() * W;
      const y = 900 + r() * 1300;
      const h = 380 + r() * 420;
      g.fillStyle = ['#1f1d1b', '#e9e1d2', '#33415c', '#7a2e2a', '#d8c7a4'][i % 5];
      g.beginPath();
      g.ellipse(x, y + h * 0.45, 40 + r() * 40, h * 0.5, 0, 0, 7);
      g.fill();
      g.fillStyle = '#3a2a20';
      g.beginPath();
      g.arc(x, y - h * 0.08, 34, 0, 7);
      g.fill();
    }
    g.filter = 'blur(2px)';
    g.strokeStyle = 'rgba(40,36,30,.35)';
    g.lineWidth = 3;
    for (let y = 2100; y < H; y += 54) for (let x = (y / 54) % 2 ? 0 : 48; x < W; x += 96) g.strokeRect(x, y, 90, 50);
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

function Demo() {
  if (preview)
    return (
      <div id="shot" style={{ display: 'inline-block', padding: 0, background: 'transparent' }}>
        <OmerWidgetMock m={m} size={sizes[0]} theme={theme} ribbon={ribbon} />
      </div>
    );
  // a home screen of a 360dp phone (5 columns, cells 66.5 × 92.5dp): the widgets where a person would put them
  const bg = q.get('bg') || 'plain';
  const plain = theme === 'light' ? '#c9d1d9' : '#1f252b';
  const H = 24 + sizes.reduce((h, s) => h + OW_SIZES[s].h + 24, 0);
  return (
    <div id="shot" style={{ position: 'relative', width: 360, height: H, overflow: 'hidden', background: plain }}>
      {bg === 'busy' && <Busy />}
      <div style={{ position: 'relative', display: 'grid', gap: 24, padding: '24px 22px', justifyItems: 'end', direction: 'ltr' }}>
        {sizes.map((s) => (
          <OmerWidgetMock key={s} m={m} size={s} theme={theme} ribbon={ribbon} />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
