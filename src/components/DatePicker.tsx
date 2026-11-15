import { useEffect, useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import { GREG_MONTHS, WEEKDAYS_SHORT, hebMonthName, hebMonthsOfYear, hebNum, hebYear, sameDay, today } from '../lib/cal';
import { isHe, tr } from '../lib/i18n';
import { Icon } from './Icon';

export type PickMode = 'heb' | 'greg';

interface Props {
  /** the day picked (highlighted) */
  value: Date;
  mode: PickMode;
  onMode: (m: PickMode) => void;
  onPick: (d: Date) => void;
}

type View = 'days' | 'months' | 'years';

/** A month shown in the picker: Gregorian (y, m 0–11) or Hebrew (y, m 1–13) */
interface Page {
  y: number;
  m: number;
}

const pageOf = (d: Date, mode: PickMode): Page => {
  if (mode === 'greg') return { y: d.getFullYear(), m: d.getMonth() };
  const h = new HDate(d);
  return { y: h.getFullYear(), m: h.getMonth() };
};

const GREG_RANGE = [1900, 2200];
const HEB_RANGE = [5660, 5960];

/** Hebrew months of a year in calendar order (Tishrei first), and stepping between them */
function hebStep(p: Page, n: number): Page {
  let { y, m } = p;
  let months = hebMonthsOfYear(y).map((x) => x.month);
  let i = months.indexOf(m) + n;
  while (i < 0) {
    y -= 1;
    months = hebMonthsOfYear(y).map((x) => x.month);
    i += months.length;
  }
  while (i >= months.length) {
    i -= months.length;
    y += 1;
    months = hebMonthsOfYear(y).map((x) => x.month);
  }
  return { y, m: months[i] };
}

/**
 * Pick any date, near or far: day grid → tap the title for the months of the year → tap the year for
 * a grid of years. Works in the Hebrew or the Gregorian calendar, each with the other's date beside it.
 */
export function DatePicker({ value, mode, onMode, onPick }: Props) {
  const [page, setPage] = useState<Page>(() => pageOf(value, mode));
  const [view, setView] = useState<View>('days');
  const [yearsFrom, setYearsFrom] = useState(() => page.y - (page.y % 12));
  const t0 = today();

  // a day picked from outside (a shortcut, a search result) brings its month into view
  useEffect(() => {
    const p = pageOf(value, mode);
    setPage((cur) => (cur.y === p.y && cur.m === p.m ? cur : p));
    setView('days');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.getTime()]);

  const switchMode = (m: PickMode) => {
    if (m === mode) return;
    const p = pageOf(value, m);
    setPage(p);
    setYearsFrom(p.y - (p.y % 12));
    onMode(m);
  };

  const step = (n: number) => {
    if (view === 'days') setPage((p) => (mode === 'greg' ? { y: p.y + Math.floor((p.m + n) / 12), m: (((p.m + n) % 12) + 12) % 12 } : hebStep(p, n)));
    else if (view === 'months') setPage((p) => ({ y: p.y + n, m: mode === 'heb' && p.m === 13 && !HDate.isLeapYear(p.y + n) ? 12 : p.m }));
    else setYearsFrom((y) => y + n * 12);
  };

  // the days of the page, padded to whole weeks
  const cells = useMemo(() => {
    const first = mode === 'greg' ? new Date(page.y, page.m, 1, 12) : new HDate(1, page.m, page.y).greg();
    const len = mode === 'greg' ? new Date(page.y, page.m + 1, 0).getDate() : HDate.daysInMonth(page.m, page.y);
    const lead = first.getDay();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 0; i < len; i++) out.push(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12));
    while (out.length % 7) out.push(null);
    return out;
  }, [page, mode]);

  const monthTitle = mode === 'greg' ? GREG_MONTHS[page.m] : hebMonthName(page.m, page.y);
  const yearTitle = mode === 'greg' ? String(page.y) : hebYear(page.y);
  const otherSpan = useMemo(() => {
    // the other calendar's months this page covers: "נובמבר–דצמבר 2026" / "חשוון–כסלו תשפ״ז"
    const a = cells.find(Boolean)!;
    const b = [...cells].reverse().find(Boolean)!;
    if (mode === 'heb') {
      const ma = GREG_MONTHS[a.getMonth()];
      const mb = GREG_MONTHS[b.getMonth()];
      return `${ma === mb ? ma : `${ma}–${mb}`} ${b.getFullYear()}`;
    }
    const ha = new HDate(a);
    const hb = new HDate(b);
    const na = hebMonthName(ha.getMonth(), ha.getFullYear());
    const nb = hebMonthName(hb.getMonth(), hb.getFullYear());
    return `${na === nb ? na : `${na}–${nb}`} ${hebYear(hb.getFullYear())}`;
  }, [cells, mode]);

  const range = mode === 'greg' ? GREG_RANGE : HEB_RANGE;
  const years = Array.from({ length: 12 }, (_, i) => yearsFrom + i);
  const months =
    mode === 'greg'
      ? Array.from({ length: 12 }, (_, i) => ({ month: i, name: GREG_MONTHS[i] }))
      : hebMonthsOfYear(page.y);
  const isThisPage = (p: Page) => {
    const n = pageOf(t0, mode);
    return n.y === p.y && n.m === p.m;
  };

  const prevLabel = view === 'days' ? tr('החודש הקודם', 'Previous month') : view === 'months' ? tr('השנה הקודמת', 'Previous year') : tr('שנים קודמות', 'Earlier years');
  const nextLabel = view === 'days' ? tr('החודש הבא', 'Next month') : view === 'months' ? tr('השנה הבאה', 'Next year') : tr('שנים הבאות', 'Later years');

  return (
    <section className="dp" aria-label={tr('בחירת תאריך', 'Pick a date')}>
      <div className="dp-top">
        <div className="seg small" role="group" aria-label={tr('לוח', 'Calendar')}>
          <button type="button" className={mode === 'heb' ? 'on' : ''} aria-pressed={mode === 'heb'} onClick={() => switchMode('heb')}>
            {tr('עברי', 'Hebrew')}
          </button>
          <button type="button" className={mode === 'greg' ? 'on' : ''} aria-pressed={mode === 'greg'} onClick={() => switchMode('greg')}>
            {tr('לועזי', 'Gregorian')}
          </button>
        </div>
        {!(view === 'days' && isThisPage(page)) && (
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              const p = pageOf(t0, mode);
              setPage(p);
              setYearsFrom(p.y - (p.y % 12));
              setView('days');
            }}
          >
            {tr('לחודש הנוכחי', 'This month')}
          </button>
        )}
      </div>

      <header className="dp-head">
        <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label={prevLabel}>
          <Icon name="prev" size={20} />
        </button>
        {view === 'days' && (
          <button type="button" className="dp-title" onClick={() => setView('months')} aria-label={tr(`${monthTitle} ${yearTitle}. בחירת חודש ושנה`, `${monthTitle} ${yearTitle}. Choose month and year`)}>
            <b>
              {monthTitle} {yearTitle}
              <Icon name="down" size={16} />
            </b>
            <small>{otherSpan}</small>
          </button>
        )}
        {view === 'months' && (
          <button
            type="button"
            className="dp-title"
            onClick={() => {
              setYearsFrom(page.y - (page.y % 12));
              setView('years');
            }}
            aria-label={tr(`${yearTitle}. בחירת שנה`, `${yearTitle}. Choose a year`)}
          >
            <b>
              {yearTitle}
              <Icon name="down" size={16} />
            </b>
            <small>{tr('בחרו חודש', 'Choose a month')}</small>
          </button>
        )}
        {view === 'years' && (
          <div className="dp-title static">
            <b>
              {mode === 'greg' ? years[0] : hebYear(years[0])}–{mode === 'greg' ? years[11] : hebYear(years[11])}
            </b>
            <small>{tr('בחרו שנה', 'Choose a year')}</small>
          </div>
        )}
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label={nextLabel}>
          <Icon name="next" size={20} />
        </button>
      </header>

      {view === 'days' && (
        <div className="dp-days" role="grid">
          {WEEKDAYS_SHORT.map((w, i) => (
            <span key={i} className="dp-wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const h = new HDate(d);
            const main = mode === 'greg' ? String(d.getDate()) : hebNum(h.getDate());
            const sub = mode === 'greg' ? hebNum(h.getDate()) : String(d.getDate());
            const cls = ['dp-day', sameDay(d, value) ? 'on' : '', sameDay(d, t0) ? 'today' : '', d.getDay() === 6 ? 'sat' : ''].join(' ');
            return (
              <button key={i} type="button" className={cls} aria-pressed={sameDay(d, value)} onClick={() => onPick(d)}>
                <b className={mode === 'heb' && isHe() ? 'heb' : ''}>{main}</b>
                <small className={mode === 'greg' && isHe() ? 'heb' : ''}>{sub}</small>
              </button>
            );
          })}
        </div>
      )}

      {view === 'months' && (
        <div className="dp-grid months">
          {months.map((x) => (
            <button
              key={x.month}
              type="button"
              className={page.m === x.month ? 'on' : ''}
              onClick={() => {
                setPage({ y: page.y, m: x.month });
                setView('days');
              }}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}

      {view === 'years' && (
        <div className="dp-grid years">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              disabled={y < range[0] || y > range[1]}
              className={[page.y === y ? 'on' : '', pageOf(t0, mode).y === y ? 'now' : ''].join(' ')}
              onClick={() => {
                setPage((p) => ({ y, m: mode === 'heb' && p.m === 13 && !HDate.isLeapYear(y) ? 12 : p.m }));
                setView('months');
              }}
            >
              <b>{mode === 'greg' ? y : hebYear(y)}</b>
              {/* the other calendar's year this one mostly overlaps */}
              <small>{mode === 'greg' ? hebYear(y + 3760) : `${y - 3761}–${String(y - 3760).slice(-2)}`}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
