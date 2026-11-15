/**
 * The Omer widget's HTML twin with real data: /omer-demo.html under `npm run dev`. Not part of the app build.
 * design/omer/shoot.cjs photographs it on a phone's home screen (light and dark, 4×2 and 2×2) and makes
 * the launcher's preview image (res/drawable-nodpi/omer_widget_preview.png).
 * ?at=<ISO time>&marks=<days counted, e.g. 1-32>&skip=<days not marked, e.g. 2,9>&theme=light|dark&preview
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '../styles.css';
import { findCity } from '../lib/cities';
import { setLang } from '../lib/i18n';
import { DEFAULT_SETTINGS } from '../lib/store';
import { EMPTY_STATE, mark, type OmerState } from '../lib/seasons/omer';
import { omerWidgetModel, widgetOmer, type WidgetData } from '../lib/widget';
import { OmerWidgetMock } from '../components/seasons/OmerWidgetMock';

setLang('he');
const q = new URLSearchParams(location.search);
const theme = (q.get('theme') as 'light' | 'dark') || 'light';
document.documentElement.setAttribute('data-theme', theme);
const now = q.get('at') ? new Date(q.get('at')!) : new Date();
const city = findCity('jerusalem')!;
// the launcher's preview image: the widget alone, on nothing (its corners stay transparent)
if (q.has('preview')) for (const el of [document.documentElement, document.body]) el.style.background = 'transparent';

// the marks: days 1..N counted, some left unmarked
let st: OmerState = EMPTY_STATE;
const [a, b] = (q.get('marks') || '0-0').split('-').map(Number);
const skip = new Set((q.get('skip') || '').split(',').filter(Boolean).map(Number));
const om = widgetOmer(now, city, DEFAULT_SETTINGS, EMPTY_STATE);
for (let k = a; k <= b; k++) if (k > 0 && !skip.has(k)) st = mark(st, om.y, k, 'night', 0);
const m = omerWidgetModel({ om: widgetOmer(now, city, DEFAULT_SETTINGS, st) } as WidgetData, now)!;

const ribbon = `/android/app/src/main/res/drawable${theme === 'dark' ? '-night' : ''}-nodpi/widget_ribbon_f00.png`;

function Demo() {
  if (q.has('preview'))
    return (
      <div id="shot" style={{ display: 'inline-block', padding: 0, background: 'transparent' }}>
        <OmerWidgetMock m={m} size="m" theme={theme} ribbon={ribbon} />
      </div>
    );
  // a phone's home screen, 360 wide: a 4×2 and a 2×2 on a quiet wallpaper
  const wall = theme === 'dark' ? '#2b3a35' : '#c9d6cf';
  return (
    <div id="shot" style={{ width: 360, padding: '32px 16px 40px', background: wall, display: 'grid', gap: 24, justifyItems: 'start' }}>
      <OmerWidgetMock m={m} size="m" theme={theme} ribbon={ribbon} />
      <div style={{ display: 'flex', gap: 16 }}>
        <OmerWidgetMock m={m} size="s" theme={theme} ribbon={ribbon} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
