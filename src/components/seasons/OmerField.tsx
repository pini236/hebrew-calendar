/**
 * The 49 days of the Omer as a 7×7 field: a row for each week, a square for each day (day 1 at the
 * start of the first row). Counted days are filled in the diary's green, a day missed after the
 * user began marking keeps a small dot, the days that went by unmarked are a quiet fill, and the day
 * of now carries the saffron ribbon: the app's mark for "this one". The row of its week sits on a
 * band, since the week is the second half of the day's sefira (הוד שבהוד: the day's Hod in the week of Hod).
 */
import type { CSSProperties } from 'react';
import { tr } from '../../lib/i18n';
import type { Cell } from '../../lib/seasons/omer';
import { SilkRibbon } from '../SilkRibbon';

export interface OmerFieldProps {
  cells: Cell[];
  /** the day the ribbon marks (1–49), 0 for none */
  current: number;
  /** the week on the band (1–7), 0 for none */
  week: number;
  /** a past day tapped: mark it counted, or take the mark back */
  onCell?: (n: number) => void;
  /** a value whose change makes the ribbon settle again (a count just made) */
  nudge?: string | number;
  /** the ribbon moves (the card) or hangs still (previews) */
  live?: boolean;
  size?: 'card' | 'large';
  className?: string;
}

const LABEL: Record<Cell, () => string> = {
  counted: () => tr('נספר', 'counted'),
  byDay: () => tr('נספר ביום', 'counted by day'),
  missed: () => tr('לא סומן', 'not marked'),
  assumed: () => tr('שבת או חג', 'Shabbat or Yom Tov'),
  passed: () => tr('עבר', 'passed'),
  due: () => tr('הספירה של עכשיו', 'the count of now'),
  future: () => tr('עוד לא הגיע', 'still ahead'),
};

export function OmerField({ cells, current, week, onCell, nudge, live = true, size = 'card', className }: OmerFieldProps) {
  const rows = Array.from({ length: 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  return (
    <div className={`om-field om-${size} ${className ?? ''}`} role="group" aria-label={tr('49 ימי הספירה', 'The 49 days of the count')}>
      {rows.map((row, w) => (
        <div key={w} className={`om-row ${week === w + 1 ? 'wk' : ''}`}>
          {row.map((c, i) => {
            const n = w * 7 + i + 1;
            const here = n === current;
            const tappable = !!onCell && c !== 'future' && c !== 'due';
            const cls = `om-cell c-${c} ${here ? 'here' : ''}`;
            const label = `${tr('יום', 'Day')} ${n}, ${LABEL[c]()}`;
            const inner = (
              <>
                <i className="om-fill" aria-hidden="true" />
                {here && <SilkRibbon className="silk-omer" width={size === 'large' ? 12 : 9} length={size === 'large' ? 22 : 16} segments={7} sub={3} strips={2} sheen={0.7} wind={live ? 0.5 : 0} scroll={live ? 0.6 : 0} drop={live} delay={420} nudge={nudge} />}
              </>
            );
            return tappable ? (
              <button key={n} type="button" className={cls} style={{ '--i': n } as CSSProperties} aria-label={label} aria-pressed={c === 'counted' || c === 'byDay'} onClick={() => onCell!(n)}>
                {inner}
              </button>
            ) : (
              <span key={n} className={cls} style={{ '--i': n } as CSSProperties} role="img" aria-label={label}>
                {inner}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
