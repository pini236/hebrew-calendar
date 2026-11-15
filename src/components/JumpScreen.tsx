import { useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  GREG_MONTHS_SHORT,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  addDays,
  dateKey,
  daysBetween,
  eventsOn,
  cellLabel,
  itemTitle,
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
import { DatePicker, type PickMode } from './DatePicker';
import { dayName, relWords } from './dayinfo';

interface Props {
  selected: Date;
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  onGo: (d: Date) => void;
  onClose: () => void;
}

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

  /* ----- the day picked: chosen in the picker, a shortcut or a search result; "show" opens it ----- */
  const [pick, setPick] = useState(selected);
  const [mode, setMode] = useState<PickMode>(settings.monthMode === 'heb' ? 'heb' : 'greg');
  const choose = (d: Date) => {
    setPick(d);
    setQ('');
  };
  const pickItems = useMemo(() => rangeItems(pick, pick, city, settings, false).get(dateKey(pick)) ?? [], [pick, city, settings]);
  const pickLabel = cellLabel(pickItems);
  const pickMine = eventsOn(myEvents, pick);

  // shortcuts
  const nextSat = addDays(t0, (6 - t0.getDay() + 7) % 7 || 7);
  const th = new HDate(t0);
  const nextRC = addDays(t0, HDate.daysInMonth(th.getMonth(), th.getFullYear()) - th.getDate() + 1);
  const searching = q.trim().length > 0;

  return (
    <Screen title={tr('מעבר לתאריך', 'Go to date')} onClose={onClose}>
      <label className="search big">
        <Icon name="search" size={20} />
        <input
          id="jump-search"
          type="search"
          autoComplete="off"
          placeholder={tr('חיפוש חג או אירוע', 'Search a holiday or event')}
          aria-label={tr('חיפוש חג, מועד או אירוע', 'Search holidays and events')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {searching ? (
        <SoonList list={filtered} t0={t0} onPick={choose} />
      ) : (
        <>
          <div className="quick">
            <button onClick={() => choose(t0)}>{tr('היום', 'Today')}</button>
            <button onClick={() => choose(addDays(t0, 1))}>{tr('מחר', 'Tomorrow')}</button>
            <button onClick={() => choose(nextSat)}>{tr('שבת הבאה', 'Next Shabbat')}</button>
            <button onClick={() => choose(nextRC)}>{tr('ראש חודש', 'Rosh Chodesh')}</button>
          </div>
          <DatePicker value={pick} mode={mode} onMode={setMode} onPick={setPick} />
          <h3 className="jump-h">{tr('מועדים קרובים', 'Coming up')}</h3>
          <SoonList list={upcoming.slice(0, 8)} t0={t0} onPick={choose} />
        </>
      )}

      <div className="preview">
        <div className="p-text">
          <div className="p-heb">{hebDateStr(new HDate(pick))}</div>
          <div className="p-greg">
            {dayName(pick)} · {gregDateStr(pick)}
          </div>
          {(pickLabel || pickMine.length > 0) && (
            <div className="p-what">{[pickLabel ? itemTitle(pickLabel) : '', ...pickMine.map((m) => m.ev.title)].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <button className="primary" onClick={() => onGo(pick)}>
          {daysBetween(t0, pick) === 0 ? tr('להיום', 'Today') : tr('הצגה', 'Show')}
        </button>
      </div>
    </Screen>
  );
}

type Soon = { d: Date; title: string; en: string; kind: Kind | 'mine'; color?: string };

function SoonList({ list, t0, onPick }: { list: Soon[]; t0: Date; onPick: (d: Date) => void }) {
  return (
    <ul className="soon-list">
      {list.slice(0, 120).map((u, i) => {
        const hd = new HDate(u.d);
        return (
          <li key={i}>
            <button onClick={() => onPick(u.d)}>
              <span className="s-date">
                <b>{hebDateStr(hd, false)}</b>
                <small>
                  {isHe()
                    ? `${WEEKDAYS[u.d.getDay()]}, ${gregDateStr(u.d, u.d.getFullYear() !== t0.getFullYear())}`
                    : `${WEEKDAYS_SHORT[u.d.getDay()]}, ${GREG_MONTHS_SHORT[u.d.getMonth()]} ${u.d.getDate()}${u.d.getFullYear() !== t0.getFullYear() ? ', ' + u.d.getFullYear() : ''}`}
                </small>
              </span>
              <span className={`s-title k-${u.kind}`}>
                {u.color && <i style={{ background: u.color }} />}
                {shortItem(u)}
              </span>
              <span className="s-in">{relWords(daysBetween(t0, u.d))}</span>
            </button>
          </li>
        );
      })}
      {list.length === 0 && <li className="empty">{tr('לא נמצא', 'Nothing found')}</li>}
    </ul>
  );
}
