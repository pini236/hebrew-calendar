import { useMemo, useRef, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  GREG_MONTHS,
  GREG_MONTHS_SHORT,
  WEEKDAYS_SHORT,
  addDays,
  cellLabel,
  dateKey,
  eventsOn,
  gregDateStr,
  hebDateStr,
  hebMonthName,
  hebNum,
  hebYear,
  itemTitle,
  rangeItems,
  sameDay,
  shortItem,
  shortTitle,
} from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, tr } from '../lib/i18n';
import type { MyEvent, Settings } from '../lib/store';
import { Icon } from './Icon';
import { dayName } from './dayinfo';

interface Props {
  anchor: Date;
  selected: Date;
  now: Date;
  mode: 'greg' | 'heb';
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  fmt: Intl.DateTimeFormat;
  onSelect: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  onMonth: (delta: number) => void;
  onMode: (m: 'greg' | 'heb') => void;
  onToday: () => void;
  onJump: () => void;
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

const SUM_KINDS = new Set(['yomtov', 'cholhamoed', 'erev', 'fast', 'minor', 'roshchodesh', 'modern', 'special-shabbat', 'parasha']);

export function MonthTab({ anchor, selected, now, mode, city, settings, myEvents, fmt, onSelect, onOpenDay, onMonth, onMode, onToday, onJump }: Props) {
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

  const hFirst = new HDate(first);
  const hLast = new HDate(last);
  let title: string;
  let sub: string;
  if (mode === 'greg') {
    title = `${GREG_MONTHS[first.getMonth()]} ${first.getFullYear()}`;
    const a = hebMonthName(hFirst.getMonth(), hFirst.getFullYear());
    const b = hebMonthName(hLast.getMonth(), hLast.getFullYear());
    sub = hFirst.getFullYear() === hLast.getFullYear() ? `${a}–${b} ${hebYear(hLast.getFullYear())}` : `${a} ${hebYear(hFirst.getFullYear())} – ${b} ${hebYear(hLast.getFullYear())}`;
  } else {
    title = `${hebMonthName(hFirst.getMonth(), hFirst.getFullYear())} ${hebYear(hFirst.getFullYear())}`;
    const a = GREG_MONTHS[first.getMonth()];
    const b = GREG_MONTHS[last.getMonth()];
    sub = first.getFullYear() === last.getFullYear() ? `${a}–${b} ${last.getFullYear()}` : `${a} ${first.getFullYear()} – ${b} ${last.getFullYear()}`;
  }

  const cells = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  const monthId = `${mode}-${dateKey(first)}`;
  const nowInMonth = dateKey(now) >= dateKey(first) && dateKey(now) <= dateKey(last);

  // the selected day, summed up under the grid
  const sel = items.get(dateKey(selected)) ?? [];
  const selMine = eventsOn(myEvents, selected);
  const selHd = new HDate(selected);
  const labels = sel.filter((i) => SUM_KINDS.has(i.kind));
  const candles = sel.find((i) => i.kind === 'candles');
  const havdalah = sel.find((i) => i.kind === 'havdalah');

  return (
    <div className="tab month-tab">
      <header className="tab-head month-head">
        <button className="icon-btn" onClick={() => move(-1)} aria-label={tr('החודש הקודם', 'Previous month')}>
          <Icon name="prev" size={22} />
        </button>
        <button className="date-title center" onClick={onJump} aria-label={tr(`${title}. מעבר לתאריך אחר`, `${title}. Go to another date`)}>
          <span className="dt-main">
            {title}
            <Icon name="down" size={18} />
          </span>
          <span className="dt-sub">{sub}</span>
        </button>
        <button className="icon-btn" onClick={() => move(1)} aria-label={tr('החודש הבא', 'Next month')}>
          <Icon name="next" size={22} />
        </button>
      </header>

      <div className="month-tools">
        <div className="seg" role="group" aria-label={tr('סוג חודש', 'Calendar')}>
          <button aria-pressed={mode === 'greg'} className={mode === 'greg' ? 'on' : ''} onClick={() => onMode('greg')}>
            {tr('לועזי', 'Gregorian')}
          </button>
          <button aria-pressed={mode === 'heb'} className={mode === 'heb' ? 'on' : ''} onClick={() => onMode('heb')}>
            {tr('עברי', 'Hebrew')}
          </button>
        </div>
        <div className="tools-end">
          {!nowInMonth && (
            <button className="text-btn" onClick={onToday}>
              {tr('להיום', 'Today')}
            </button>
          )}
          <button className="place-chip jump-chip" onClick={onJump}>
            <Icon name="today" size={16} />
            <span>{tr('תאריך אחר', 'Other date')}</span>
          </button>
        </div>
      </div>

      <div className="month-body">
        <section className="wall" aria-label={tr('לוח חודשי', 'Month calendar')}>
          <div className="weekdays" aria-hidden="true">
            {WEEKDAYS_SHORT.map((w, i) => (
              <span key={w} className={i === 6 ? 'sat' : ''}>
                {i === 6 ? tr('שבת', w) : w}
              </span>
            ))}
          </div>
          <div
            className={`grid rows-${total / 7} slide-${dir}`}
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
              const isSel = sameDay(d, selected);
              const cls = ['cell', inMonth ? '' : 'out', isSat ? 'sat' : '', chag ? 'chag' : '', sameDay(d, now) ? 'today' : '', isSel ? 'sel' : ''].join(' ');
              const big = mode === 'greg' ? String(d.getDate()) : hebNum(hd.getDate());
              const small = mode === 'greg' ? hebNum(hd.getDate()) : String(d.getDate());
              const firstOfOther = mode === 'greg' ? hd.getDate() === 1 : d.getDate() === 1;
              return (
                <button
                  key={k}
                  className={cls}
                  onClick={() => (isSel ? onOpenDay(d) : onSelect(d))}
                  aria-label={
                    isHe()
                      ? `${d.getDate()} ${GREG_MONTHS[d.getMonth()]}, ${hebNum(hd.getDate())} ${hebMonthName(hd.getMonth(), hd.getFullYear())}${lab ? ', ' + lab.title : ''}`
                      : `${gregDateStr(d, false)}, ${hebDateStr(hd, false)}${lab ? ', ' + itemTitle(lab) : ''}`
                  }
                  aria-pressed={isSel}
                >
                  <span className={`c-big ${mode === 'heb' ? 'heb' : ''}`}>{big}</span>
                  <span className={`c-small ${mode === 'greg' ? 'heb' : ''}`}>
                    {firstOfOther ? (mode === 'greg' ? hebMonthName(hd.getMonth(), hd.getFullYear()) : tr(GREG_MONTHS[d.getMonth()], GREG_MONTHS_SHORT[d.getMonth()])) : small}
                  </span>
                  {lab && <span className={`c-label k-${lab.kind}`}>{shortItem(lab)}</span>}
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

        <section className="day-sum" aria-label={tr('היום הנבחר', 'Selected day')} aria-live="polite">
          <div className="ds-head">
            <div>
              <div className="ds-date">{hebDateStr(selHd, false)}</div>
              <div className="ds-sub">
                {dayName(selected)} · {gregDateStr(selected)}
              </div>
            </div>
            <button className="btn" onClick={() => onOpenDay(selected)}>
              {tr('סדר היום', 'Schedule')}
              <Icon name="next" size={16} />
            </button>
          </div>
          {(labels.length > 0 || candles || havdalah || selMine.length > 0) && (
            <ul className="ds-list">
              {labels.map((l, i) => (
                <li key={i} className={`k-${l.kind}`}>
                  {isHe() ? (l.kind === 'parasha' ? l.title : shortTitle(l.title)) : itemTitle(l)}
                </li>
              ))}
              {candles && (
                <li className="k-candles">
                  {tr('הדלקת נרות', 'Candle lighting')} <b>{fmt.format(candles.time!)}</b>
                </li>
              )}
              {havdalah && (
                <li>
                  {tr('צאת השבת / החג', 'Shabbat / Yom Tov ends')} <b>{fmt.format(havdalah.time!)}</b>
                </li>
              )}
              {selMine.map((m) => (
                <li key={m.ev.id} className="k-mine">
                  <i style={{ background: m.ev.color }} />
                  {m.ev.title}
                  {m.ev.time && <b>{m.ev.time}</b>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
