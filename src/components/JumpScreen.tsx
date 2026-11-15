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
  shortItem,
  today,
  type Kind,
} from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, tr } from '../lib/i18n';
import type { MyEvent, Settings } from '../lib/store';
import { Screen } from './Screen';
import { Icon } from './Icon';
import { HebDatePicker, hebPartsOf, hebPartsToDate } from './HebDatePicker';
import { dayName, relWords } from './dayinfo';

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

/** English search: lower case, letters and digits only, common spellings mapped to Hebcal's */
function normEn(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/passover/g, 'pesach')
    .replace(/c?hann?ukk?ah?/g, 'chanukah')
    .replace(/hashanah/g, 'hashana')
    .replace(/sukkos/g, 'sukkot')
    .replace(/shavuos/g, 'shavuot')
    .replace(/tishah/g, 'tisha');
}

export function JumpScreen({ selected, city, settings, myEvents, onGo, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('soon');
  const t0 = today();

  /* ----- upcoming ----- */
  const [q, setQ] = useState('');
  const upcoming = useMemo(() => {
    const end = addDays(t0, 400);
    const map = rangeItems(t0, end, city, settings, false);
    // title: Hebrew (also what the grouping matches on); en: English
    const out: { d: Date; title: string; en: string; kind: Kind | 'mine'; color?: string }[] = [];
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
        const en = it.en ?? it.title;
        const enGroup = en
          .split(/[:(]/)[0]
          .replace(/\s+(\d{4}|[IVX]+)$/, '')
          .trim();
        const whole = it.kind === 'yomtov' || it.kind === 'minor';
        out.push({ d, title: whole ? group || it.title : it.title, en: whole ? enGroup || en : en, kind: it.kind });
      }
      for (const m of eventsOn(myEvents, d)) out.push({ d, title: m.ev.title, en: m.ev.title, kind: 'mine', color: m.ev.color });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, settings.showModern, myEvents]);
  // Hebrew matches the Hebrew names; English matches the English names (and Hebrew typed into it)
  const nq = normEn(q);
  const filtered = !q.trim()
    ? upcoming
    : isHe()
      ? upcoming.filter((u) => u.title.includes(q.trim()))
      : upcoming.filter((u) => u.title.includes(q.trim()) || (nq !== '' && normEn(u.en).includes(nq)));

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
    <Screen title={tr('מעבר לתאריך', 'Go to date')} onClose={onClose}>
      <label className="search big">
        <Icon name="search" size={20} />
        <input
          id="jump-search"
          type="search"
          autoComplete="off"
          placeholder={tr('חג, מועד או אירוע שלי', 'A holiday or one of my events')}
          aria-label={tr('חיפוש חג, מועד או אירוע', 'Search holidays and events')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setTab('soon');
          }}
        />
      </label>
      <div className="quick">
        <button onClick={() => onGo(t0)}>{tr('היום', 'Today')}</button>
        <button onClick={() => onGo(addDays(t0, 1))}>{tr('מחר', 'Tomorrow')}</button>
        <button onClick={() => onGo(nextSat)}>{tr('שבת הבאה', 'Next Shabbat')}</button>
        <button onClick={() => onGo(nextRC)}>{tr('ראש חודש הבא', 'Next Rosh Chodesh')}</button>
        <button onClick={() => onGo(addDays(selected, 7))}>{tr('שבוע קדימה', 'A week ahead')}</button>
        <button onClick={() => onGo(new Date(selected.getFullYear() + 1, selected.getMonth(), selected.getDate(), 12))}>{tr('שנה קדימה', 'A year ahead')}</button>
      </div>

      <div className="seg tabs" role="tablist">
        {(
          [
            ['soon', tr('מועדים', 'Holidays')],
            ['heb', tr('עברי', 'Hebrew')],
            ['greg', tr('לועזי', 'Gregorian')],
            ['rel', tr('בעוד / לפני', 'Relative')],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'soon' && (
        <div className="soon">
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
                      {shortItem(u)}
                    </span>
                    <span className="s-in">{relWords(dd)}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="empty">{tr('לא נמצא מועד בשם הזה בשנה הקרובה.', 'Nothing by that name in the coming year.')}</li>}
          </ul>
        </div>
      )}

      {tab === 'heb' && <HebDatePicker idPrefix="jump" value={heb} onChange={setHeb} />}

      {tab === 'greg' && (
        <div className="picker one">
          <label>
            <span>{tr('בחרו תאריך לועזי', 'Pick a Gregorian date')}</span>
            <input id="jump-greg" type="date" value={gk} onChange={(e) => setGk(e.target.value)} />
          </label>
        </div>
      )}

      {tab === 'rel' && (
        <div className="picker rel">
          <div className="seg small">
            <button className={!dirFwd ? 'on' : ''} onClick={() => setDirFwd(false)}>
              {tr('אחורה', 'Back')}
            </button>
            <button className={dirFwd ? 'on' : ''} onClick={() => setDirFwd(true)}>
              {tr('קדימה', 'Forward')}
            </button>
          </div>
          <input id="jump-amt" type="number" min={0} inputMode="numeric" value={amt} onChange={(e) => setAmt(Math.max(0, Math.min(100000, +e.target.value)))} />
          <select id="jump-unit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
            <option value="d">{tr('ימים', 'days')}</option>
            <option value="w">{tr('שבועות', 'weeks')}</option>
            <option value="m">{tr('חודשים', 'months')}</option>
            <option value="y">{tr('שנים', 'years')}</option>
          </select>
          <p className="fine">
            {tr('מהתאריך הנבחר:', 'From the selected date:')} {gregDateStr(selected)}
          </p>
        </div>
      )}

      {target && (
        <div className="preview">
          <div>
            <div className="p-heb">{hebDateStr(new HDate(target))}</div>
            <div className="p-greg">
              {dayName(target)} · {gregDateStr(target)} · {relWords(daysBetween(t0, target))}
            </div>
          </div>
          <button className="primary" onClick={() => onGo(target)}>
            {tr('מעבר לתאריך', 'Go to date')}
          </button>
        </div>
      )}
    </Screen>
  );
}
