import { useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  WEEKDAYS,
  addDays,
  dateKey,
  daysBetween,
  eventsOn,
  fromKey,
  gregDateStr,
  hebDateStr,
  rangeItems,
  shortTitle,
  today,
  type Kind,
} from '../lib/cal';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { HebDatePicker, hebPartsOf, hebPartsToDate } from './HebDatePicker';

interface Props {
  selected: Date;
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  onGo: (d: Date) => void;
  onClose: () => void;
}

type Tab = 'soon' | 'heb' | 'greg' | 'rel';

const LIST_KINDS = new Set<Kind>(['yomtov', 'erev', 'fast', 'minor', 'modern', 'roshchodesh']);

function relWords(n: number) {
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n === 2) return 'מחרתיים';
  return n > 0 ? `בעוד ${n.toLocaleString('he-IL')} ימים` : `לפני ${(-n).toLocaleString('he-IL')} ימים`;
}

export function JumpSheet({ selected, city, settings, myEvents, onGo, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('soon');
  const t0 = today();

  /* ----- upcoming ----- */
  const [q, setQ] = useState('');
  const upcoming = useMemo(() => {
    const end = addDays(t0, 400);
    const map = rangeItems(t0, end, city, settings, false);
    const out: { d: Date; title: string; kind: Kind | 'mine'; color?: string }[] = [];
    const lastSeen = new Map<string, number>();
    for (let i = 0; i <= 400; i++) {
      const d = addDays(t0, i);
      for (const it of map.get(dateKey(d)) ?? []) {
        if (!LIST_KINDS.has(it.kind)) continue;
        const group = it.title
          .split(/[:(]/)[0]
          .replace(/\s+ת[א-ת]*״[א-ת]$/, '')
          .replace(/\s+[א-ת]׳$/, '')
          .trim();
        const prev = lastSeen.get(group);
        lastSeen.set(group, i);
        if (prev !== undefined && i - prev < 10) continue;
        out.push({ d, title: it.kind === 'yomtov' || it.kind === 'minor' ? group || it.title : it.title, kind: it.kind });
      }
      for (const m of eventsOn(myEvents, d)) out.push({ d, title: m.ev.title, kind: 'mine', color: m.ev.color });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, settings.showModern, myEvents]);
  const filtered = q.trim() ? upcoming.filter((u) => u.title.includes(q.trim())) : upcoming;

  /* ----- hebrew picker ----- */
  const [heb, setHeb] = useState(() => hebPartsOf(selected));
  const hebTarget = hebPartsToDate(heb);

  /* ----- gregorian ----- */
  const [gk, setGk] = useState(dateKey(selected));
  const gregTarget = /^\d{4}-\d{2}-\d{2}$/.test(gk) ? fromKey(gk) : null;

  /* ----- relative ----- */
  const [amt, setAmt] = useState(7);
  const [unit, setUnit] = useState<'d' | 'w' | 'm' | 'y'>('d');
  const [dirFwd, setDirFwd] = useState(true);
  const n = (dirFwd ? 1 : -1) * (Number.isFinite(amt) ? amt : 0);
  const relTarget =
    unit === 'd'
      ? addDays(selected, n)
      : unit === 'w'
        ? addDays(selected, n * 7)
        : unit === 'm'
          ? new Date(selected.getFullYear(), selected.getMonth() + n, selected.getDate(), 12)
          : new Date(selected.getFullYear() + n, selected.getMonth(), selected.getDate(), 12);

  const target = tab === 'heb' ? hebTarget : tab === 'greg' ? gregTarget : tab === 'rel' ? relTarget : null;

  // quick chips
  const nextSat = addDays(t0, (6 - t0.getDay() + 7) % 7 || 7);
  const th = new HDate(t0);
  const nextRC = (() => {
    const last = HDate.daysInMonth(th.getMonth(), th.getFullYear());
    return addDays(t0, last - th.getDate() + 1);
  })();

  return (
    <Sheet title="קפיצה בזמן" onClose={onClose} wide>
      <div className="quick">
        <button onClick={() => onGo(t0)}>היום</button>
        <button onClick={() => onGo(addDays(t0, 1))}>מחר</button>
        <button onClick={() => onGo(nextSat)}>שבת הבאה</button>
        <button onClick={() => onGo(nextRC)}>ראש חודש הבא</button>
        <button onClick={() => onGo(addDays(selected, 7))}>שבוע קדימה</button>
        <button onClick={() => onGo(new Date(selected.getFullYear() + 1, selected.getMonth(), selected.getDate(), 12))}>שנה קדימה</button>
      </div>

      <div className="seg tabs" role="tablist">
        {(
          [
            ['soon', 'חגים ומועדים'],
            ['heb', 'תאריך עברי'],
            ['greg', 'תאריך לועזי'],
            ['rel', 'קדימה / אחורה'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'soon' && (
        <div className="soon">
          <label className="search">
            <Icon name="search" size={18} />
            <input id="jump-search" type="search" placeholder="חיפוש: פסח, חנוכה, יום הולדת…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className="soon-list">
            {filtered.slice(0, 120).map((u, i) => {
              const hd = new HDate(u.d);
              const dd = daysBetween(t0, u.d);
              return (
                <li key={i}>
                  <button onClick={() => onGo(u.d)}>
                    <span className="s-date">
                      <b>{hebDateStr(hd, false)}</b>
                      <small>
                        {WEEKDAYS[u.d.getDay()]}, {gregDateStr(u.d, u.d.getFullYear() !== t0.getFullYear())}
                      </small>
                    </span>
                    <span className={`s-title k-${u.kind}`}>
                      {u.color && <i style={{ background: u.color }} />}
                      {shortTitle(u.title)}
                    </span>
                    <span className="s-in">{relWords(dd)}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="empty">לא נמצא מועד בשם הזה בשנה הקרובה.</li>}
          </ul>
        </div>
      )}

      {tab === 'heb' && <HebDatePicker idPrefix="jump" value={heb} onChange={setHeb} />}

      {tab === 'greg' && (
        <div className="picker one">
          <label>
            <span>בחרו תאריך לועזי</span>
            <input id="jump-greg" type="date" value={gk} onChange={(e) => setGk(e.target.value)} />
          </label>
        </div>
      )}

      {tab === 'rel' && (
        <div className="picker rel">
          <div className="seg small">
            <button className={!dirFwd ? 'on' : ''} onClick={() => setDirFwd(false)}>
              אחורה
            </button>
            <button className={dirFwd ? 'on' : ''} onClick={() => setDirFwd(true)}>
              קדימה
            </button>
          </div>
          <input id="jump-amt" type="number" min={0} inputMode="numeric" value={amt} onChange={(e) => setAmt(Math.max(0, Math.min(100000, +e.target.value)))} />
          <select id="jump-unit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
            <option value="d">ימים</option>
            <option value="w">שבועות</option>
            <option value="m">חודשים</option>
            <option value="y">שנים</option>
          </select>
          <p className="fine">מהתאריך הנבחר: {gregDateStr(selected)}</p>
        </div>
      )}

      {target && (
        <div className="preview">
          <div>
            <div className="p-heb">{hebDateStr(new HDate(target))}</div>
            <div className="p-greg">
              יום {WEEKDAYS[target.getDay()]} · {gregDateStr(target)} · {relWords(daysBetween(t0, target))}
            </div>
          </div>
          <button className="primary" onClick={() => onGo(target)}>
            מעבר לתאריך
          </button>
        </div>
      )}
    </Sheet>
  );
}
