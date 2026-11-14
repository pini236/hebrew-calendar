import { useMemo, useRef } from 'react';
import { HDate } from '@hebcal/core';
import {
  WEEKDAYS,
  gregDateStr,
  hebDateStr,
  hebMonthName,
  hebNum,
  hebYear,
  moonPhase,
  sameDay,
  addDays,
  roundTo,
  shortTitle,
  type DayItem,
} from '../lib/cal';
import { skyAt } from '../lib/sky';
import { Icon } from './Icon';

interface Props {
  date: Date;
  now: Date;
  items: DayItem[];
  times: { dawn: Date; sunrise: Date; sunset: Date; dusk: Date; chatzot: Date };
  fmt: Intl.DateTimeFormat;
  cityName: string;
  onDay: (delta: number) => void;
  onToday: () => void;
}

const CHIP_KINDS = new Set(['yomtov', 'cholhamoed', 'erev', 'fast', 'minor', 'roshchodesh', 'modern', 'special-shabbat', 'parasha', 'mevarchim', 'omer']);

// a fixed sprinkle of stars (deterministic so they don't jump around)
const STARS = Array.from({ length: 38 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1) * 100, y: r(2) * 70, s: 1 + r(3) * 1.6, d: r(4) * 4 };
});

export function DayHero({ date, now, items, times, fmt, cityName, onDay, onToday }: Props) {
  const hd = new HDate(date);
  const isToday = sameDay(date, now);
  // map the current clock time onto the selected day so the sky always feels alive
  const probe = new Date(date.getFullYear(), date.getMonth(), date.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
  const sky = skyAt(probe.getTime(), times);
  const afterSunset = isToday && now.getTime() > times.sunset.getTime();
  const tonight = new HDate(addDays(date, 1));
  const moon = moonPhase(afterSunset ? tonight : hd);
  const chips = items.filter((i) => CHIP_KINDS.has(i.kind));
  if (date.getDay() === 5 && !items.some((i) => i.kind === 'erev' || i.kind === 'yomtov')) chips.unshift({ kind: 'parasha', title: 'ערב שבת קודש' });

  const touch = useRef<{ x: number; y: number } | null>(null);

  const arc = useMemo(() => {
    const W = 320;
    const H = 96;
    const pad = 22;
    const at = (f: number) => {
      // RTL: sunrise on the right, sunset on the left
      const x = W - pad - f * (W - 2 * pad);
      const y = H - 14 - Math.sin(Math.PI * f) * (H - 30);
      return { x, y };
    };
    const pts = Array.from({ length: 41 }, (_, i) => at(i / 40));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return { W, H, d, at };
  }, []);

  const sunPos = sky.sun !== null ? arc.at(sky.sun) : null;

  return (
    <section
      className={`hero ${sky.night ? 'is-night' : ''}`}
      style={{ background: sky.background }}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onDay(dx > 0 ? 1 : -1);
      }}
      aria-label="היום הנבחר"
    >
      {sky.night && (
        <div className="stars" aria-hidden="true">
          {STARS.map((s, i) => (
            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
          ))}
        </div>
      )}

      <div className="hero-top">
        <button className="hero-nav" onClick={() => onDay(-1)} aria-label="היום הקודם">
          <Icon name="prev" />
        </button>
        <div className="hero-weekday">
          יום {WEEKDAYS[date.getDay()]}
          <span className="dot-sep">·</span>
          {gregDateStr(date)}
        </div>
        <button className="hero-nav" onClick={() => onDay(1)} aria-label="היום הבא">
          <Icon name="next" />
        </button>
      </div>

      <div className="hero-main" key={date.toDateString()}>
        <h1 className="hero-date">
          <span className="hd-day">{hebNum(hd.getDate())}</span>{' '}
          <span className="hd-month">{hebMonthName(hd.getMonth(), hd.getFullYear())}</span>
        </h1>
        <div className="hero-year">{hebYear(hd.getFullYear())}</div>
        {afterSunset && <div className="tonight">מהשקיעה כבר {hebDateStr(tonight, false)} · אור ל{WEEKDAYS[tonight.greg().getDay()] === 'שבת' ? 'שבת' : `יום ${WEEKDAYS[tonight.greg().getDay()]}`}</div>}
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c, i) => (
              <span key={i} className={`chip chip-${c.kind}`}>
                {c.kind === 'parasha' ? c.title : shortTitle(c.title)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="arc-wrap">
        <svg viewBox={`0 0 ${arc.W} ${arc.H}`} className="arc" role="img" aria-label={`זריחה ${fmt.format(roundTo(times.sunrise, 'round'))}, שקיעה ${fmt.format(roundTo(times.sunset, 'floor'))}`}>
          <line x1="6" x2={arc.W - 6} y1={arc.H - 14} y2={arc.H - 14} className="horizon" />
          <path d={arc.d} className="arc-path" />
          {sunPos && (
            <>
              <circle cx={sunPos.x} cy={sunPos.y} r="16" className="sun-glow" />
              <circle cx={sunPos.x} cy={sunPos.y} r="7.5" className="sun" />
            </>
          )}
          {!sunPos && <Moon cx={arc.W / 2} cy={34} r={12} illum={moon.illum} waxing={moon.waxing} />}
        </svg>
        <div className="arc-labels">
          <span>
            <b>{fmt.format(roundTo(times.sunrise, 'round'))}</b> זריחה
          </span>
          <span className="arc-mid">
            חצות <b>{fmt.format(roundTo(times.chatzot, 'round'))}</b>
          </span>
          <span>
            שקיעה <b>{fmt.format(roundTo(times.sunset, 'floor'))}</b>
          </span>
        </div>
      </div>

      <div className="hero-foot">
        <span className="hero-city">
          <Icon name="pin" size={14} /> {cityName}
        </span>
        {isToday ? (
          <span className="clock" aria-live="off">
            {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}
          </span>
        ) : (
          <button className="back-today" onClick={onToday}>
            <Icon name="today" size={15} /> חזרה להיום
          </button>
        )}
      </div>
    </section>
  );
}

function Moon({ cx, cy, r, illum, waxing }: { cx: number; cy: number; r: number; illum: number; waxing: boolean }) {
  // terminator ellipse: rx goes from r (new/full) to 0 (half)
  const k = 1 - 2 * illum; // 1 = new, -1 = full
  const rx = Math.abs(k) * r;
  const sweepLit = waxing ? 1 : 0; // lit limb on the right when waxing (northern hemisphere)
  const outer = `M${cx},${cy - r} A${r},${r} 0 0 ${sweepLit} ${cx},${cy + r}`;
  const inner = `A${rx},${r} 0 0 ${k > 0 ? 1 - sweepLit : sweepLit} ${cx},${cy - r}`;
  return (
    <g className="moon">
      <circle cx={cx} cy={cy} r={r + 10} className="moon-glow" />
      <circle cx={cx} cy={cy} r={r} className="moon-dark" />
      <path d={`${outer} ${inner} Z`} className="moon-lit" />
    </g>
  );
}
