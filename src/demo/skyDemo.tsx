/**
 * Prototype page for the live sky: /sky-demo.html under `npm run dev`. Not part of the app build.
 * Pick a place, a date and a time of day, or let the day run. Below the sky is the real היום screen,
 * so the week strip changes the day the way it will in the app. `?bare` hides the controls (recordings).
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-600.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-600.css';
import '../styles.css';
import './skyDemo.css';
import { addDays, dateKey, dayItems, fromKey, timeFmt, zmanim } from '../lib/cal';
import { CITIES, cityLabel } from '../lib/cities';
import { setLang, type Lang } from '../lib/i18n';
import { DEFAULT_SETTINGS } from '../lib/store';
import { SkyHeader, SkyScene, wallSecs, wallTime } from '../components/SkyScene';
import { TodayTab } from '../components/TodayTab';
import type { SkyPainter } from '../components/skyPaint';

const PLACES = ['jerusalem', 'bnei-brak', 'new-york'];
const settings = DEFAULT_SETTINGS;
const bare = new URLSearchParams(location.search).has('bare');

interface DemoState {
  cityId: string;
  day: string;
  mins: number;
  lang: Lang;
  theme: 'light' | 'dark';
  playing: boolean;
}

declare global {
  interface Window {
    skyDemo?: { set(p: Partial<DemoState>): void; get(): DemoState };
    __sky?: SkyPainter;
  }
}

function initial(): DemoState {
  const c = CITIES.find((x) => x.id === 'jerusalem')!;
  const now = Date.now();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: c.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return { cityId: c.id, day: p, mins: Math.floor(wallSecs(c.tz, now) / 60), lang: 'he', theme: 'light', playing: false };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function Demo() {
  const [st, setSt] = useState<DemoState>(initial);
  const set = (p: Partial<DemoState>) => setSt((s) => ({ ...s, ...p }));
  setLang(st.lang);

  const base = CITIES.find((c) => c.id === st.cityId)!;
  const city = useMemo(() => ({ ...base, name: cityLabel(base) }), [base, st.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = fromKey(st.day);
  const at = new Date(wallTime(city.tz, day.getFullYear(), day.getMonth(), day.getDate(), st.mins * 60));
  const z = useMemo(() => zmanim(day, city, settings), [st.day, city]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => dayItems(day, city, settings), [st.day, city]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', st.theme);
  }, [st.theme]);

  // run the day: 24 hours in 36 seconds
  const playRef = useRef(st.playing);
  playRef.current = st.playing;
  useEffect(() => {
    if (!st.playing) return;
    let raf = 0;
    let t0 = performance.now();
    const step = (t: number) => {
      const dt = t - t0;
      t0 = t;
      setSt((s) => ({ ...s, mins: (s.mins + dt * 0.04) % 1440 }));
      if (playRef.current) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [st.playing]);

  useEffect(() => {
    window.skyDemo = { set, get: () => st };
  });

  // the next Friday, a little after candle lighting
  const fridayEvening = () => {
    let d = day;
    while (d.getDay() !== 5) d = addDays(d, 1);
    const its = dayItems(d, city, settings);
    const c = its.find((i) => i.kind === 'candles')?.time;
    const mins = c ? Math.floor(wallSecs(city.tz, c.getTime() + 25 * 60000) / 60) : 17 * 60;
    set({ day: dateKey(d), mins });
  };

  const [stats, setStats] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      const s = window.__sky?.stats;
      if (!s || !s.frames) return;
      setStats(`${(s.frameMs / s.frames).toFixed(2)} ms/frame · ${s.paints} paints, ${(s.paintMs / Math.max(1, s.paints)).toFixed(1)} ms each`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const phone = (
    <div className="demo-phone">
      <SkyScene selected={day} now={at} at={at} city={city} settings={settings} z={z} items={items}>
        <SkyHeader selected={day} city={city} />
      </SkyScene>
      <div className="sky-sheet">
        <TodayTab
          selected={day}
          now={at}
          city={city}
          settings={settings}
          myEvents={[]}
          fmt={fmt}
          items={items}
          z={z}
          mine={[]}
          onSelect={(d) => set({ day: dateKey(d) })}
          onToday={() => set({ day: initial().day })}
          onJump={() => {}}
          onLocation={() => {}}
          onAddEvent={() => {}}
          onEditEvent={() => {}}
          onAllZmanim={() => {}}
          onSettings={() => {}}
        />
      </div>
    </div>
  );
  if (bare) return <div className="demo bare">{phone}</div>;

  return (
    <div className="demo">
      {phone}
      <aside className="demo-panel" dir="rtl" lang="he">
        <h1>שמיים חיים · אב־טיפוס</h1>
        <label>
          מקום
          <select value={st.cityId} onChange={(e) => set({ cityId: e.target.value })}>
            {PLACES.map((id) => (
              <option key={id} value={id}>
                {CITIES.find((c) => c.id === id)!.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          תאריך
          <input type="date" value={st.day} onChange={(e) => e.target.value && set({ day: e.target.value })} />
        </label>
        <div className="demo-row">
          <button onClick={() => set({ day: dateKey(addDays(day, -1)) })}>יום קודם</button>
          <button onClick={() => set({ day: dateKey(addDays(day, 1)) })}>יום הבא</button>
        </div>
        <label>
          שעה <b className="tnum">{hhmm(st.mins)}</b>
          <input type="range" min={0} max={1439} step={1} value={Math.floor(st.mins)} onChange={(e) => set({ mins: +e.target.value })} />
        </label>
        <div className="demo-row">
          <button onClick={() => set({ playing: !st.playing })}>{st.playing ? 'עצירה' : 'הרצת היום'}</button>
          <button onClick={() => set({ ...initial(), cityId: st.cityId, lang: st.lang, theme: st.theme })}>עכשיו</button>
          <button onClick={fridayEvening}>שישי בערב</button>
        </div>
        <div className="demo-row">
          <button onClick={() => set({ lang: st.lang === 'he' ? 'en' : 'he' })}>{st.lang === 'he' ? 'English' : 'עברית'}</button>
          <button onClick={() => set({ theme: st.theme === 'light' ? 'dark' : 'light' })}>{st.theme === 'light' ? 'ערכה כהה' : 'ערכה בהירה'}</button>
        </div>
        <p className="demo-fine">
          זריחה {fmt.format(z.sunrise)} · שקיעה {fmt.format(z.sunset)} · צאת הכוכבים {fmt.format(z.dusk)}
        </p>
        <p className="demo-fine tnum">{stats}</p>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
