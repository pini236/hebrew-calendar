/**
 * Chanukah on היום: a deep window of an old Jerusalem stone house at night with a brass oil chanukiah on its
 * sill (rendered in Blender, composited live by chanukahPaint.ts), tonight's light in a few words, and the
 * blessings, הנרות הללו and מעוז צור a tap away in a sheet.
 *
 * Before the lighting time tonight's cups hold oil (as many as tonight, from the right) and wait, with a live
 * countdown. At the lighting time, or when "הדלקתי" is tapped, the shamash catches, is lifted, and lights them
 * one by one, the newest first; once an evening on each device, then they simply burn, the oil going down
 * until 22:00 (see src/lib/seasons/chanukah.ts). With reduced motion they are lit at once and still.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dateKey, roundTo, sameDay, timeFmt } from '../../lib/cal';
import { isHe, tr } from '../../lib/i18n';
import { isNative, notificationPermission } from '../../lib/native';
import { loadSeasonState, saveSeasonState, seasonContext } from '../../lib/seasons';
import {
  CHANUKAH_STATE,
  candleName,
  chanukahNight,
  litAt,
  litUntil,
  prefsOf,
  type ChanukahPrefs,
  type ChanukahState,
} from '../../lib/seasons/chanukah';
import { skyAt } from '../../lib/sky';
import { inTime } from '../dayinfo';
import { Icon } from '../Icon';
import { ChanukiahPainter, FLAME_BAND, canAddLayers, type RGB, type StageState } from './chanukahPaint';
import { SCENE } from './chanukahScene';
import { BLESSINGS, HANEROT_HALALU, MAOZ_TZUR } from './chanukahTexts';
import type { SeasonCardProps } from './index';
import './chanukah.css';

type Phase = 'before' | 'lit' | 'after' | 'future' | 'past' | 'eighth';
type Tab = 'blessings' | 'halalu' | 'maoz' | 'settings';

const rgbOf = (css: string): RGB[] => (css.match(/rgb\((\d+),(\d+),(\d+)\)/g) ?? []).map((m) => m.slice(4, -1).split(',').map(Number) as RGB);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function useSeasonState() {
  const [st, setSt] = useState<ChanukahState>(() => loadSeasonState('chanukah', CHANUKAH_STATE));
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === 'chanukah') setSt(loadSeasonState('chanukah', CHANUKAH_STATE));
    };
    window.addEventListener('luachi:season-state', on);
    return () => window.removeEventListener('luachi:season-state', on);
  }, []);
  const save = useCallback((patch: Partial<ChanukahState>) => {
    const cur = loadSeasonState('chanukah', CHANUKAH_STATE);
    const next = { ...cur, ...patch };
    // keep the last few evenings only
    next.lit = Object.fromEntries(Object.entries(next.lit).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 10));
    saveSeasonState('chanukah', next);
    setSt(next);
  }, []);
  return [st, save] as const;
}

export default function ChanukahCard({ day, now, city, settings, z, setPrefs }: SeasonCardProps) {
  const prefs = prefsOf(seasonContext('chanukah', city, settings));
  const [state, saveState] = useSeasonState();
  const night = useMemo(() => chanukahNight(day, city, settings, prefs), [dateKey(day), city, settings.candleMins, settings.havdalah, settings.useElevation, prefs.basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = dateKey(day);
  const isToday = sameDay(day, now);
  const t = now.getTime();
  const from = night ? litAt(night, state).getTime() : 0;
  const to = night ? litUntil(night, state).getTime() : 0;

  let phase: Phase;
  if (!night) phase = 'eighth';
  else if (!isToday) phase = day.getTime() < now.getTime() ? 'past' : 'future';
  else if (t < from) phase = 'before';
  else if (t < to) phase = 'lit';
  else phase = 'after';

  // the window's sky: now (today); that evening's lighting time (another day); late evening once they're out
  const skyMoment = phase === 'future' ? night!.at.getTime() : phase === 'past' ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21).getTime() : t;
  const skyMin = Math.floor(skyMoment / 60000);
  const stage = useMemo<StageState>(() => {
    const sky = rgbOf(skyAt(skyMin * 60000, z).background) as [RGB, RGB, RGB];
    const m = sky[1];
    const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    const burnt = phase === 'lit' ? clamp01((skyMin * 60000 - from) / Math.max(1, to - from)) : phase === 'after' || phase === 'past' || phase === 'eighth' ? 1 : 0;
    // the window across the alley: lit from a while after sunset (a little later each evening of the week,
    // as people come home) until 23:00
    const set = z.sunset.getTime();
    const on = set + (25 + ((day.getDate() * 7) % 30)) * 60000;
    const off = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23).getTime();
    const at = skyMin * 60000;
    return {
      sky,
      placed: night ? night.candles : 8,
      lit: phase === 'lit',
      burnt: Math.round(burnt * 200) / 200,
      night: 1 - Math.min(1, Math.max(0, (lum - 0.08) / 0.32)),
      window: at >= on && at < off ? 1 : 0,
    };
  }, [skyMin, z, phase, night, from, to, key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- the canvases and their loop ---------------- */

  const host = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const lightC = useRef<HTMLCanvasElement>(null);
  const flamesC = useRef<HTMLCanvasElement>(null);
  const [layers] = useState(canAddLayers);
  const engine = useRef<ReturnType<typeof startStage> | null>(null);
  useLayoutEffect(() => {
    engine.current = startStage(base.current!, lightC.current, flamesC.current!, host.current!);
    return () => engine.current?.stop();
  }, []);
  useEffect(() => {
    engine.current?.set(stage);
  }, [stage]);

  // the lighting: once an evening on this device, when the candles are lit (by the time or by a tap)
  useEffect(() => {
    if (phase !== 'lit' || !isToday) return;
    if (state.played === key) return;
    const e = engine.current;
    if (!e) return;
    e.light(() => saveState({ played: key }));
  }, [phase, isToday, key, state.played]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- words ---------------- */

  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);
  const n = night?.candles ?? 8;
  const at = night ? fmt.format(night.at) : '';
  const lighting = () => {
    if (!night) return '';
    if (night.rule === 'friday') return tr(`הדלקה לפני נרות שבת, עד ${at}`, `Light before the Shabbat candles, by ${at}`);
    if (night.rule === 'motzash') return tr(`הדלקה אחרי הבדלה, ${at}`, `Light after havdalah, ${at}`);
    return tr(`הדלקה ${at}`, `Lighting ${at}`);
  };
  let eyebrow = tr('חנוכה', 'Chanukah');
  let title = candleName(n);
  let line = '';
  let count = '';
  switch (phase) {
    case 'eighth':
      eyebrow = tr('חנוכה · היום השמיני', 'Chanukah · the eighth day');
      title = tr('זאת חנוכה', 'Zot Chanukah');
      line = tr('הנרות של אמש היו האחרונים השנה', "Last night's lights were the last this year");
      break;
    case 'before':
      eyebrow = n === 1 ? tr('ערב חנוכה · הלילה', 'Erev Chanukah · tonight') : tr('חנוכה · הלילה', 'Chanukah · tonight');
      line = lighting();
      count = inTime(night!.at.getTime() - t);
      break;
    case 'lit': {
      eyebrow = tr('חנוכה · הלילה', 'Chanukah · tonight');
      const when = fmt.format(roundTo(new Date(from), 'floor'));
      line = n === 1 ? tr(`הנר הודלק ב־${when}`, `Lit at ${when}`) : tr(`הנרות הודלקו ב־${when}`, `Lit at ${when}`);
      break;
    }
    case 'after':
      eyebrow = tr('חנוכה · הלילה', 'Chanukah · tonight');
      line = n < 8 ? tr(`מחר בערב ${candleName(n + 1)}`, `Tomorrow evening: ${candleName(n + 1)}`) : tr('מחר זאת חנוכה, היום השמיני', 'Tomorrow is the eighth day');
      break;
    case 'future':
    case 'past':
      line = lighting();
      break;
  }
  const canLight = phase === 'before' && !!night && t >= night.earliest.getTime();

  /* ---------------- the sheet ---------------- */

  const [tab, setTab] = useState<Tab | null>(null);

  const label = phase === 'lit' ? tr(`חנוכייה, ${candleName(n)} דולק`, `A chanukiah, ${candleName(n)} burning`) : tr(`חנוכייה, ${phase === 'eighth' ? 'הנרות כבו' : `${n === 1 ? 'נר אחד' : `${n} נרות`} במקומם`}`, `A chanukiah, ${n} ${n === 1 ? 'candle' : 'candles'} in place`);

  return (
    <section className="hero ch-card" aria-label={tr('חנוכה', 'Chanukah')}>
      <div className="ch-stage" ref={host} role="img" aria-label={label}>
        <canvas ref={base} aria-hidden="true" />
        {layers && <canvas ref={lightC} className="ch-light" aria-hidden="true" />}
        <canvas ref={flamesC} className="ch-flames" aria-hidden="true" style={{ top: `${(FLAME_BAND[0] / SCENE.size[1]) * 100}%`, height: `${((FLAME_BAND[1] - FLAME_BAND[0]) / SCENE.size[1]) * 100}%` }} />
      </div>
      <div className="ch-body">
        <div className="ch-head">
          <div className="ch-words">
            <div className="eyebrow">{eyebrow}</div>
            <h2 className="hero-title">{title}</h2>
          </div>
          {canLight && (
            <button className="primary ch-lit" onClick={() => saveState({ lit: { ...state.lit, [key]: Date.now() } })}>
              {tr('הדלקתי', 'I lit them')}
            </button>
          )}
        </div>
        {(line || count) && (
          <p className="ch-line">
            {line}
            {count && <span className="ch-count"> · {count}</span>}
          </p>
        )}
        <div className="ch-links">
          <button className="text-btn" onClick={() => setTab('blessings')}>
            {tr('ברכות', 'Blessings')}
          </button>
          <button className="text-btn" onClick={() => setTab('maoz')}>
            {tr('מעוז צור', 'Maoz Tzur')}
          </button>
          <button className="icon-btn sm ch-set" onClick={() => setTab('settings')} aria-label={tr('הגדרות חנוכה: זמן ההדלקה ותזכורת', 'Chanukah settings: lighting time and reminder')}>
            <Icon name="bell" size={18} />
          </button>
        </div>
      </div>
      {tab && <ChanukahSheet tab={tab} setTab={setTab} first={n === 1 && phase !== 'eighth'} prefs={prefs} setPrefs={setPrefs} onClose={() => setTab(null)} />}
    </section>
  );
}

/* ---------------- the sheet: blessings, הנרות הללו, מעוז צור, settings ---------------- */

function ChanukahSheet({ tab, setTab, first, prefs, setPrefs, onClose }: { tab: Tab; setTab: (t: Tab) => void; first: boolean; prefs: ChanukahPrefs; setPrefs: (p: Partial<ChanukahPrefs>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  // one history entry, so the phone's back gesture closes the sheet (as the app's own screens)
  useEffect(() => {
    const d = ref.current!;
    try {
      d.showModal();
    } catch {
      d.setAttribute('open', '');
    }
    try {
      history.pushState({ luachSheet: true }, '');
    } catch {
      /* sandboxed preview */
    }
    const onPop = () => {
      closing.current = true;
      onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (history.state?.luachSheet) history.back();
    else onClose();
  };
  const he = isHe();
  const tabs: [Tab, string][] = [
    ['blessings', tr('ברכות', 'Blessings')],
    ['halalu', tr('הנרות הללו', 'HaNerot Halalu')],
    ['maoz', tr('מעוז צור', 'Maoz Tzur')],
    ['settings', tr('הגדרות', 'Settings')],
  ];
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [tab]);

  return (
    <dialog
      ref={ref}
      className="ch-sheet"
      aria-label={tr('חנוכה', 'Chanukah')}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="ch-sheet-in">
        <header className="ch-sheet-bar">
          <div className="seg tabs" role="tablist">
            {tabs.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={close} aria-label={tr('סגירה', 'Close')}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="ch-sheet-body" ref={body} role="tabpanel">
          {tab === 'blessings' && (
            <>
              <p className="ch-note">{tr('לפני ההדלקה מברכים:', 'Before lighting:')}</p>
              {BLESSINGS.filter((b) => first || !b.firstNight).map((b, i) => (
                <div key={i} className="ch-text">
                  <p lang="he" dir="rtl">
                    {b.he}
                  </p>
                  {!he && <p className="ch-en">{b.en}</p>}
                </div>
              ))}
              {!first && <p className="ch-note">{tr('בלילה הראשון מוסיפים שהחיינו.', 'On the first night, Shehecheyanu is added.')}</p>}
            </>
          )}
          {tab === 'halalu' && (
            <>
              <p className="ch-note">{tr('אחרי הדלקת הנר הראשון:', 'After lighting the first candle:')}</p>
              <div className="ch-text">
                <p lang="he" dir="rtl">
                  {HANEROT_HALALU.he}
                </p>
                {!he && <p className="ch-en">{HANEROT_HALALU.en}</p>}
              </div>
            </>
          )}
          {tab === 'maoz' &&
            MAOZ_TZUR.map((st, i) => (
              <p key={i} className="ch-text ch-verse" lang="he" dir="rtl">
                {st.map((l, j) => (
                  <span key={j}>{l}</span>
                ))}
              </p>
            ))}
          {tab === 'settings' && <ChanukahSettings prefs={prefs} setPrefs={setPrefs} />}
        </div>
      </div>
    </dialog>
  );
}

function ChanukahSettings({ prefs, setPrefs }: { prefs: ChanukahPrefs; setPrefs: (p: Partial<ChanukahPrefs>) => void }) {
  const native = isNative();
  return (
    <div className="form-list ch-form">
      <div className="field stack">
        <span id="ch-basis">{tr('זמן ההדלקה', 'Lighting time')}</span>
        <div className="seg" role="group" aria-labelledby="ch-basis">
          {(
            [
              ['tzeit', tr('צאת הכוכבים', 'Nightfall')],
              ['sunset', tr('שקיעה', 'Sunset')],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={prefs.basis === k ? 'on' : ''} aria-pressed={prefs.basis === k} onClick={() => setPrefs({ basis: k })}>
              {l}
            </button>
          ))}
        </div>
        <small className="sub">{tr('בערב שבת לפני הדלקת נרות שבת, ובמוצאי שבת אחרי הבדלה.', 'On Friday before the Shabbat candles; on Saturday night after havdalah.')}</small>
      </div>
      {native ? (
        <>
          <label className="toggle" htmlFor="ch-remind">
            <span>
              {tr('תזכורת בכל ערב', 'A reminder each evening')}
              <small className="sub">{tr('בזמן ההדלקה. בערב שבת לפני נרות שבת.', 'At lighting time; on Friday before the Shabbat candles.')}</small>
            </span>
            <input
              id="ch-remind"
              type="checkbox"
              checked={prefs.remind}
              onChange={(e) => {
                const on = e.target.checked;
                setPrefs({ remind: on });
                if (on) notificationPermission(true).catch(() => {});
              }}
            />
            <i aria-hidden="true" />
          </label>
          {prefs.remind && (
            <div className="field stack">
              <span id="ch-fri">{tr('בערב שבת, כמה לפני נרות שבת', 'On Friday, how long before the Shabbat candles')}</span>
              <div className="seg" role="group" aria-labelledby="ch-fri">
                {[10, 20, 30, 45].map((m) => (
                  <button key={m} className={prefs.fridayMins === m ? 'on' : ''} aria-pressed={prefs.fridayMins === m} onClick={() => setPrefs({ fridayMins: m })}>
                    {tr(`${m} דק׳`, `${m} min`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="ch-note">{tr('תזכורת להדלקה בכל ערב יש באפליקציה לטלפון.', 'An evening reminder is available in the phone app.')}</p>
      )}
    </div>
  );
}

/* ---------------- the loop: 30 fps while the candles burn, 60 while the shamash moves, only while seen ---------------- */

function startStage(base: HTMLCanvasElement, light: HTMLCanvasElement | null, flames: HTMLCanvasElement, host: HTMLElement) {
  const painter = new ChanukiahPainter(base, light, flames);
  const reducedMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!reducedMq?.matches;
  let inView = true;
  // most of the window is on screen: the lighting waits for this, so it is seen from its start
  let seen = true;
  let raf = 0;
  let last = 0;
  let size = '';
  // the scene's own clock: it only runs while the scene is drawn, so the lighting never jumps ahead off screen
  let clock = 0;
  let prev = 0;
  let pending: (() => void) | null = null;

  const running = () => inView && !document.hidden && !reduced && (painter.animating || painter.burningNow);
  const tick = (now: number) => {
    raf = 0;
    if (!inView || document.hidden) return;
    // nothing to draw until the pictures are in (and the scene's clock waits for them: onReady restarts it)
    if (!painter.ready) {
      prev = 0;
      return;
    }
    const fps = painter.animating ? 60 : 30;
    if (now - last >= 1000 / fps - 4) {
      clock += prev ? Math.min(0.1, (now - prev) / 1000) : 0;
      prev = now;
      last = now;
      painter.frame(clock, reduced);
    }
    if (running()) raf = requestAnimationFrame(tick);
    else prev = 0;
  };
  const go = () => {
    if (!raf && inView && !document.hidden) raf = requestAnimationFrame(tick);
  };
  // the pictures load with the card: paint as soon as they are in
  painter.onReady = go;

  const measure = () => {
    const r = host.getBoundingClientRect();
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const zoom = r.width / w;
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * zoom);
    const k = `${w}x${h}@${dpr}`;
    if (k === size) return;
    size = k;
    painter.resize(w, h, dpr);
    go();
  };
  const ro = new ResizeObserver(measure);
  ro.observe(host);
  const io = new IntersectionObserver(
    (es) => {
      const e = es[es.length - 1];
      inView = e.isIntersecting;
      seen = e.intersectionRatio >= 0.6;
      if (seen && pending) {
        const p = pending;
        pending = null;
        // a moment to arrive before the lighting starts
        setTimeout(p, 500);
      }
      go();
    },
    { threshold: [0, 0.6] },
  );
  io.observe(host);
  const onVis = () => {
    if (!document.hidden && seen && pending) {
      const p = pending;
      pending = null;
      setTimeout(p, 500);
    }
    go();
  };
  document.addEventListener('visibilitychange', onVis);
  const onMq = () => {
    reduced = !!reducedMq?.matches;
    if (reduced && painter.animating) painter.lightNow();
    go();
  };
  reducedMq?.addEventListener?.('change', onMq);
  measure();

  (window as unknown as { __chanukiah?: ChanukiahPainter }).__chanukiah = painter;

  return {
    set(s: StageState) {
      painter.set(s);
      go();
    },
    /** light tonight's candles with the shamash (at once with reduced motion); `done` when it's over */
    light(done: () => void) {
      const run = () => {
        if (reduced) {
          painter.lightNow();
          done();
        } else painter.light(clock, done);
        go();
      };
      if (seen && !document.hidden) run();
      else pending = run;
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reducedMq?.removeEventListener?.('change', onMq);
    },
  };
}
