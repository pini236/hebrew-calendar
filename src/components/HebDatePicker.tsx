import { HDate } from '@hebcal/core';
import { hebMonthsOfYear, hebNum, hebYear } from '../lib/cal';

export interface HebParts {
  d: number;
  m: number;
  y: number;
}

/** Clamp a day / month to what exists in that Hebrew year (Adar II only in leap years, 30th day only in full months) */
export function safeHeb({ d, m, y }: HebParts): HebParts {
  const months = hebMonthsOfYear(y);
  const sm = months.some((x) => x.month === m) ? m : m === 13 ? 12 : m;
  return { d: Math.min(d, HDate.daysInMonth(sm, y)), m: sm, y };
}

export const hebPartsOf = (date: Date): HebParts => {
  const h = new HDate(date);
  return { d: h.getDate(), m: h.getMonth(), y: h.getFullYear() };
};

export const hebPartsToDate = (p: HebParts) => {
  const s = safeHeb(p);
  return new HDate(s.d, s.m, s.y).greg();
};

/** Day / month / year pickers for a Hebrew date */
export function HebDatePicker({ value, onChange, idPrefix }: { value: HebParts; onChange: (v: HebParts) => void; idPrefix: string }) {
  const { d, m, y } = safeHeb(value);
  const maxD = HDate.daysInMonth(m, y);
  const setY = (ny: number) => onChange({ d: value.d, m: value.m, y: Math.max(3762, Math.min(6500, ny)) });
  return (
    <div className="picker">
      <label>
        <span>יום</span>
        <select id={`${idPrefix}-hd`} value={d} onChange={(e) => onChange({ ...value, d: +e.target.value })}>
          {Array.from({ length: maxD }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {hebNum(n)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>חודש</span>
        <select id={`${idPrefix}-hm`} value={m} onChange={(e) => onChange({ ...value, m: +e.target.value })}>
          {hebMonthsOfYear(y).map((x) => (
            <option key={x.month} value={x.month}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>שנה · {hebYear(y)}</span>
        <div className="stepper">
          <button type="button" onClick={() => setY(y - 1)} aria-label="שנה קודמת">
            −
          </button>
          <input id={`${idPrefix}-hy`} type="number" inputMode="numeric" value={y} aria-label="שנה עברית" onChange={(e) => setY(+e.target.value || y)} />
          <button type="button" onClick={() => setY(y + 1)} aria-label="שנה הבאה">
            +
          </button>
        </div>
      </label>
    </div>
  );
}
