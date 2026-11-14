import { useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  WEEKDAYS,
  addDays,
  dateKey,
  daysBetween,
  gregDateStr,
  hebDateStr,
  prayerNotes,
  rangeItems,
  roundTo,
  sameDay,
  type DayItem,
  type ZmanRow,
} from '../lib/cal';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { Icon } from './Icon';

/* ---------------- Zmanim ---------------- */

interface ZProps {
  date: Date;
  now: Date;
  rows: ZmanRow[];
  items: DayItem[];
  shaahZmanit: number;
  fmt: Intl.DateTimeFormat;
  city: City;
  candleMins: number;
}

interface Row {
  id: string;
  name: string;
  hint?: string;
  time: Date;
  major?: boolean;
  special?: 'candles' | 'havdalah' | 'fast';
}

function countdown(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שע׳`;
  if (m >= 10) return `${m} דק׳`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ZmanimCard({ date, now, rows, items, shaahZmanit, fmt, city, candleMins }: ZProps) {
  const [full, setFull] = useState(true);
  const isToday = sameDay(date, now);

  const merged: Row[] = rows.map((r) => ({ ...r, time: roundTo(r.time, r.round) }));
  for (const it of items) {
    if (!it.time) continue;
    if (it.kind === 'candles')
      merged.push({ id: 'candles', name: 'הדלקת נרות', hint: it.time.getHours() > 0 && candleMins ? `${candleMins} דק׳ לפני השקיעה` : undefined, time: it.time, special: 'candles', major: true });
    if (it.kind === 'havdalah') merged.push({ id: 'havdalah', name: 'צאת השבת / החג', hint: 'הבדלה', time: it.time, special: 'havdalah', major: true });
    if (it.kind === 'fast-start') merged.push({ id: 'fs', name: 'תחילת הצום', time: it.time, special: 'fast', major: true });
    if (it.kind === 'fast-end') merged.push({ id: 'fe', name: 'סיום הצום', time: it.time, special: 'fast', major: true });
  }
  // candle lighting on the 2nd night of yom tov is "not before tzeit" — hebcal already gives the right time
  merged.sort((a, b) => a.time.getTime() - b.time.getTime());

  const shown = full ? merged : merged.filter((r) => r.major);
  const t = now.getTime();
  const nextIdx = isToday ? shown.findIndex((r) => r.time.getTime() > t) : -1;

  return (
    <section className="card zmanim" aria-label="זמני היום">
      <header className="card-head">
        <h3>זמני היום</h3>
        <div className="seg small" role="tablist" aria-label="תצוגת זמנים">
          <button role="tab" aria-selected={!full} className={!full ? 'on' : ''} onClick={() => setFull(false)}>
            עיקריים
          </button>
          <button role="tab" aria-selected={full} className={full ? 'on' : ''} onClick={() => setFull(true)}>
            הכול
          </button>
        </div>
      </header>

      <ol className="ztl">
        {shown.map((r, i) => {
          const past = isToday && r.time.getTime() <= t;
          const next = i === nextIdx;
          return (
            <li key={r.id + i} className={`z ${past ? 'past' : ''} ${next ? 'next' : ''} ${r.special ? 'sp sp-' + r.special : ''} ${r.major ? 'major' : ''}`}>
              <span className="z-dot" aria-hidden="true" />
              <span className="z-name">
                {r.name}
                {r.hint && <small>{r.hint}</small>}
              </span>
              {next && <span className="z-count">בעוד {countdown(r.time.getTime() - t)}</span>}
              <time className="z-time">{fmt.format(r.time)}</time>
            </li>
          );
        })}
      </ol>
      <p className="fine">
        שעה זמנית {Math.round(shaahZmanit)} דק׳ · {city.name} · {city.il ? 'ארץ ישראל' : 'חו״ל'} · הזמנים מעוגלים לכיוון המחמיר
      </p>
    </section>
  );
}

/* ---------------- Coming Shabbat / Yom Tov ---------------- */

export function ShabbatCard({ date, city, settings, fmt, onJump, onNotify }: { date: Date; city: City; settings: Settings; fmt: Intl.DateTimeFormat; onJump: (d: Date) => void; onNotify: () => void }) {
  // on Shabbat itself, start from Friday so the current Shabbat is still shown
  const from = date.getDay() === 6 ? addDays(date, -1) : date;
  const map = rangeItems(from, addDays(from, 9), city, settings, false);
  let candle: { d: Date; it: DayItem } | null = null;
  let havdalah: { d: Date; it: DayItem } | null = null;
  let title = '';
  let isShabbat = false;
  let isChag = false;
  for (let i = 0; i <= 9 && !havdalah; i++) {
    const d = addDays(from, i);
    for (const it of map.get(dateKey(d)) ?? []) {
      if (it.kind === 'candles' && !candle) candle = { d, it };
      if (!candle) continue;
      if (it.kind === 'havdalah' && !havdalah) havdalah = { d, it };
      if (it.kind === 'yomtov' && !title) {
        title = it.title;
        isChag = true;
      }
      if (it.kind === 'parasha') {
        isShabbat = true;
        if (!title) title = it.title;
      }
    }
  }
  if (!candle || !havdalah) return null;
  const daysAway = daysBetween(date, candle.d);
  const when = daysAway < 0 ? 'עכשיו' : daysAway === 0 ? 'היום' : daysAway === 1 ? 'מחר' : `בעוד ${daysAway} ימים`;
  return (
    <section className="card shabbat" aria-label="שבת וחג">
      <div className="sh-flame" aria-hidden="true">
        <Icon name="candle" size={26} stroke={1.6} />
      </div>
      <div className="sh-body">
        <div className="eyebrow">{isChag ? (isShabbat ? 'חג ושבת' : 'החג הקרוב') : 'שבת הקרובה'} · {when}</div>
        <div className="sh-title">{title || 'שבת'}</div>
        <div className="sh-times">
          <button onClick={() => onJump(candle!.d)}>
            <small>הדלקת נרות · יום {WEEKDAYS[candle.d.getDay()]}</small>
            <b>{fmt.format(candle.it.time!)}</b>
          </button>
          <button onClick={() => onJump(havdalah!.d)}>
            <small>יציאה · יום {WEEKDAYS[havdalah.d.getDay()]}</small>
            <b>{fmt.format(havdalah.it.time!)}</b>
          </button>
        </div>
        <button className="bell-btn" onClick={onNotify}>
          <Icon name="bell" size={16} /> התראה עם הזמנים בכל יום שישי
        </button>
      </div>
    </section>
  );
}

/* ---------------- Prayer + learning ---------------- */

export function PrayerCard({ date, il, items }: { date: Date; il: boolean; items: DayItem[] }) {
  const notes = prayerNotes(date, il, items);
  const omer = items.find((i) => i.kind === 'omer');
  return (
    <section className="card prayer" aria-label="בתפילה">
      <header className="card-head">
        <h3>בתפילה היום</h3>
      </header>
      <div className="pills">
        {notes.map((n) => (
          <span className="pill" key={n}>
            {n}
          </span>
        ))}
      </div>
      {omer && <p className="omer">{omer.title}</p>}
    </section>
  );
}

export function LearningCard({ items }: { items: DayItem[] }) {
  const l = items.filter((i) => i.kind === 'learning');
  if (!l.length) return null;
  return (
    <section className="card learning" aria-label="לימוד יומי">
      <header className="card-head">
        <h3>לימוד יומי</h3>
        <Icon name="book" size={18} />
      </header>
      <dl className="learn-list">
        {l.map((x, i) => (
          <div key={i}>
            <dt>{x.label}</dt>
            <dd>{x.title}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------- My events ---------------- */

export function MyEventsCard({
  date,
  list,
  onAdd,
  onEdit,
}: {
  date: Date;
  list: { ev: MyEvent; years: number }[];
  onAdd: () => void;
  onEdit: (e: MyEvent) => void;
}) {
  const hd = new HDate(date);
  return (
    <section className="card mine" aria-label="האירועים שלי">
      <header className="card-head">
        <h3>האירועים שלי</h3>
        <button className="ghost-btn" onClick={onAdd}>
          <Icon name="plus" size={16} /> הוספה
        </button>
      </header>
      {list.length === 0 ? (
        <p className="empty">
          אין אירועים ב{hebDateStr(hd, false)} ({gregDateStr(date, false)}). הוסיפו יום הולדת עברי, יארצייט או פגישה — אירוע שנתי לפי תאריך עברי יופיע כאן אוטומטית בכל שנה.
        </p>
      ) : (
        <ul className="mine-list">
          {list.map(({ ev, years }) => (
            <li key={ev.id}>
              <button onClick={() => onEdit(ev)}>
                <i style={{ background: ev.color }} />
                <span className="m-title">
                  {ev.title}
                  {ev.time && <small> · {ev.time}</small>}
                  {ev.repeat !== 'none' && years > 0 && <small> · {years} שנה</small>}
                  {ev.note && <em>{ev.note}</em>}
                </span>
                <span className="m-kind">{ev.repeat === 'heb-yearly' ? 'שנתי עברי' : ev.repeat === 'greg-yearly' ? 'שנתי לועזי' : ''}</span>
                <Icon name="edit" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
