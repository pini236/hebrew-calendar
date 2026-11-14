import { useMemo, useRef, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  GREG_MONTHS,
  WEEKDAYS_SHORT,
  addDays,
  cellLabel,
  dateKey,
  eventsOn,
  hebMonthName,
  hebNum,
  hebYear,
  rangeItems,
  sameDay,
  shortTitle,
} from '../lib/cal';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { Icon } from './Icon';

interface Props {
  anchor: Date;
  selected: Date;
  now: Date;
  mode: 'greg' | 'heb';
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  onSelect: (d: Date) => void;
  onMonth: (delta: number) => void;
  onMode: (m: 'greg' | 'heb') => void;
}

export function monthBounds(anchor: Date, mode: 'greg' | 'heb') {
  if (mode === 'greg') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    return { first, last };
  }
  const hd = new HDate(anchor);
  const first = new HDate(1, hd.getMonth(), hd.getFullYear()).greg();
  const last = new HDate(HDate.daysInMonth(hd.getMonth(), hd.getFullYear()), hd.getMonth(), hd.getFullYear()).greg();
  return { first: addDays(first, 0), last: addDays(last, 0) };
}

/** Move an anchor by whole months in the given mode */
export function shiftMonth(anchor: Date, delta: number, mode: 'greg' | 'heb') {
  if (mode === 'greg') return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1, 12);
  const { first, last } = monthBounds(anchor, 'heb');
  return delta > 0 ? addDays(last, 1) : addDays(first, -1);
}

export function MonthView({ anchor, selected, now, mode, city, settings, myEvents, onSelect, onMonth, onMode }: Props) {
  const { first, last } = monthBounds(anchor, mode);
  const gridStart = addDays(first, -first.getDay());
  const total = Math.ceil((first.getDay() + Math.round((last.getTime() - first.getTime()) / 86400000) + 1) / 7) * 7;
  const gridEnd = addDays(gridStart, total - 1);

  const items = useMemo(
    () => rangeItems(gridStart, gridEnd, city, settings, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey(gridStart), total, city, settings.candleMins, settings.havdalah, settings.useElevation, settings.showModern],
  );

  const [dir, setDir] = useState<'f' | 'b' | ''>('');
  const move = (d: number) => {
    setDir(d > 0 ? 'f' : 'b');
    onMonth(d);
  };

  const touch = useRef<{ x: number; y: number } | null>(null);

  // titles
  const hFirst = new HDate(first);
  const hLast = new HDate(last);
  let title: string;
  let sub: string;
  if (mode === 'greg') {
    title = `${GREG_MONTHS[first.getMonth()]} ${first.getFullYear()}`;
    const a = hebMonthName(hFirst.getMonth(), hFirst.getFullYear());
    const b = hebMonthName(hLast.getMonth(), hLast.getFullYear());
    sub = hFirst.getFullYear() === hLast.getFullYear() ? `${a} – ${b} ${hebYear(hLast.getFullYear())}` : `${a} ${hebYear(hFirst.getFullYear())} – ${b} ${hebYear(hLast.getFullYear())}`;
  } else {
    title = `${hebMonthName(hFirst.getMonth(), hFirst.getFullYear())} ${hebYear(hFirst.getFullYear())}`;
    const a = GREG_MONTHS[first.getMonth()];
    const b = GREG_MONTHS[last.getMonth()];
    sub = first.getFullYear() === last.getFullYear() ? `${a} – ${b} ${last.getFullYear()}` : `${a} ${first.getFullYear()} – ${b} ${last.getFullYear()}`;
  }

  const cells = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  const monthId = `${mode}-${dateKey(first)}`;

  return (
    <section className="card month" aria-label="לוח חודשי">
      <header className="month-head">
        <button className="icon-btn" onClick={() => move(-1)} aria-label="החודש הקודם">
          <Icon name="prev" />
        </button>
        <div className="month-title">
          <h2>{title}</h2>
          <div className="month-sub">{sub}</div>
        </div>
        <button className="icon-btn" onClick={() => move(1)} aria-label="החודש הבא">
          <Icon name="next" />
        </button>
      </header>

      <div className="seg" role="tablist" aria-label="סוג חודש">
        <button role="tab" aria-selected={mode === 'greg'} className={mode === 'greg' ? 'on' : ''} onClick={() => onMode('greg')}>
          חודש לועזי
        </button>
        <button role="tab" aria-selected={mode === 'heb'} className={mode === 'heb' ? 'on' : ''} onClick={() => onMode('heb')}>
          חודש עברי
        </button>
      </div>

      <div className="weekdays" aria-hidden="true">
        {WEEKDAYS_SHORT.map((w, i) => (
          <span key={w} className={i === 6 ? 'sat' : ''}>
            {w}
          </span>
        ))}
      </div>

      <div
        className={`grid slide-${dir}`}
        key={monthId}
        role="grid"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx > 0 ? 1 : -1);
        }}
      >
        {cells.map((d) => {
          const k = dateKey(d);
          const its = items.get(k) ?? [];
          const lab = cellLabel(its);
          const hd = new HDate(d);
          const inMonth = d >= first && d <= last;
          const mine = eventsOn(myEvents, d);
          const isSat = d.getDay() === 6;
          const chag = its.some((i) => i.kind === 'yomtov');
          const cls = [
            'cell',
            inMonth ? '' : 'out',
            isSat ? 'sat' : '',
            chag ? 'chag' : '',
            sameDay(d, now) ? 'today' : '',
            sameDay(d, selected) ? 'sel' : '',
          ].join(' ');
          const big = mode === 'greg' ? String(d.getDate()) : hebNum(hd.getDate());
          const small = mode === 'greg' ? hebNum(hd.getDate()) : String(d.getDate());
          const firstOfOther = mode === 'greg' ? hd.getDate() === 1 : d.getDate() === 1;
          return (
            <button
              key={k}
              className={cls}
              onClick={() => onSelect(d)}
              aria-label={`${d.getDate()} ${GREG_MONTHS[d.getMonth()]}, ${hebNum(hd.getDate())} ${hebMonthName(hd.getMonth(), hd.getFullYear())}${lab ? ', ' + lab.title : ''}`}
              aria-pressed={sameDay(d, selected)}
            >
              <span className={`c-big ${mode === 'heb' ? 'heb' : ''}`}>{big}</span>
              <span className={`c-small ${mode === 'greg' ? 'heb' : ''}`}>
                {firstOfOther ? (mode === 'greg' ? hebMonthName(hd.getMonth(), hd.getFullYear()) : GREG_MONTHS[d.getMonth()].slice(0, 3) + '׳') : small}
              </span>
              {lab && <span className={`c-label k-${lab.kind}`}>{shortTitle(lab.title)}</span>}
              {mine.length > 0 && (
                <span className="c-dots">
                  {mine.slice(0, 3).map((m) => (
                    <i key={m.ev.id} style={{ background: m.ev.color }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
