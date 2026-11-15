import { useMemo, useRef, useState } from 'react';
import { HDate } from '@hebcal/core';
import {
  WEEKDAYS,
  WEEKDAYS_SHORT,
  addDays,
  dateKey,
  eventsOn,
  gregDateStr,
  hebDateStr,
  hebMonthName,
  hebNum,
  itemTitle,
  learningLabel,
  prayerNotes,
  rangeItems,
  roundTo,
  sameDay,
  shortTitle,
  zmanim,
  type DayItem,
  type ZmanRow,
} from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, tr } from '../lib/i18n';
import type { MyEvent, Settings } from '../lib/store';
import { Icon } from './Icon';
import { SkyHeader, SkyScene } from './SkyScene';
import { agendaRows, dayName, daysBetween, inTime, nextShabbat, weekParasha, yearsWord, type ShabbatInfo } from './dayinfo';

type Z = ReturnType<typeof zmanim>;

interface Props {
  selected: Date;
  now: Date;
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  fmt: Intl.DateTimeFormat;
  items: DayItem[];
  z: Z;
  mine: { ev: MyEvent; years: number }[];
  onSelect: (d: Date) => void;
  onToday: () => void;
  onJump: () => void;
  onLocation: () => void;
  onAddEvent: () => void;
  onEditEvent: (e: MyEvent) => void;
  onAllZmanim: () => void;
}

const DAY_KINDS = new Set(['yomtov', 'cholhamoed', 'erev', 'fast', 'minor', 'roshchodesh', 'modern', 'special-shabbat', 'parasha', 'mevarchim']);

export function TodayTab(p: Props) {
  const { selected, now, city, settings, items, z } = p;
  const isToday = sameDay(selected, now);
  const afterSunset = isToday && now.getTime() > z.sunset.getTime();
  const tonight = new HDate(addDays(selected, 1));
  const tonightDow = addDays(selected, 1).getDay();
  const tonightDay = WEEKDAYS[tonightDow];

  return (
    <>
      <div className="today-sky">
        <SkyScene selected={selected} now={now} city={city} settings={settings} z={z} items={items} className="card">
          <SkyHeader selected={selected} city={city} onJump={p.onJump} onLocation={p.onLocation} />
        </SkyScene>
      </div>
    <div className="tab today-tab sky-sheet">
      {afterSunset && (
        <p className="tonight">
          {tr(
            `מהשקיעה כבר ${hebDateStr(tonight, false)}, אור ל${tonightDow === 6 ? 'שבת' : `יום ${tonightDay}`}`,
            `Since sunset it's ${hebDateStr(tonight, false)}, the eve of ${tonightDay}`,
          )}
        </p>
      )}

      <WeekStrip {...p} />

      <div className="today-grid">
        <div className="today-main">
          <NowHero {...p} isToday={isToday} />
          <Agenda {...p} isToday={isToday} />
        </div>
        <div className="today-side">
          <Notes date={selected} il={city.il} items={items} showLearning={settings.showLearning} />
        </div>
      </div>
    </div>
    </>
  );
}

/* ---------------- week strip ---------------- */

function WeekStrip({ selected, now, city, settings, myEvents, onSelect, onToday }: Props) {
  const start = addDays(selected, -selected.getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const map = useMemo(
    () => rangeItems(start, days[6], city, settings, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey(start), city, settings.showModern, settings.candleMins, settings.havdalah],
  );
  const parasha = useMemo(() => weekParasha(start, city, settings), [dateKey(start), city, settings.showModern]); // eslint-disable-line react-hooks/exhaustive-deps
  const heb = settings.monthMode === 'heb';
  const touch = useRef<{ x: number; y: number } | null>(null);
  const thisWeek = sameDay(addDays(now, -now.getDay()), start);
  const h0 = new HDate(days[0]);
  const h6 = new HDate(days[6]);
  const months =
    h0.getMonth() === h6.getMonth()
      ? hebMonthName(h0.getMonth(), h0.getFullYear())
      : `${hebMonthName(h0.getMonth(), h0.getFullYear())}–${hebMonthName(h6.getMonth(), h6.getFullYear())}`;

  return (
    <section className="week" aria-label={tr('השבוע', 'Week')}>
      <div className="week-head">
        <button className="icon-btn sm" onClick={() => onSelect(addDays(selected, -7))} aria-label={tr('השבוע הקודם', 'Previous week')}>
          <Icon name="prev" />
        </button>
        <span className="week-name">
          {parasha ? tr(`שבוע ${parasha.title}`, itemTitle(parasha)) : months}
          {parasha && <small> · {months}</small>}
        </span>
        {!sameDay(selected, now) && (
          <button className="text-btn" onClick={onToday}>
            {thisWeek ? tr('היום', 'Today') : tr('חזרה להיום', 'Back to today')}
          </button>
        )}
        <button className="icon-btn sm" onClick={() => onSelect(addDays(selected, 7))} aria-label={tr('השבוע הבא', 'Next week')}>
          <Icon name="next" />
        </button>
      </div>
      <div
        className="week-days"
        role="group"
        aria-label={tr('ימי השבוע', 'Days of the week')}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSelect(addDays(selected, dx > 0 ? 7 : -7));
        }}
      >
        {days.map((d) => {
          const h = new HDate(d);
          const its = map.get(dateKey(d)) ?? [];
          const chag = its.some((i) => i.kind === 'yomtov');
          const has = eventsOn(myEvents, d).length > 0;
          const sel = sameDay(d, selected);
          const tod = sameDay(d, now);
          return (
            <button
              key={dateKey(d)}
              className={`wd ${sel ? 'sel' : ''} ${tod ? 'today' : ''} ${chag ? 'chag' : ''} ${d.getDay() === 6 ? 'sat' : ''}`}
              onClick={() => onSelect(d)}
              aria-pressed={sel}
              aria-label={tr(
                `יום ${WEEKDAYS[d.getDay()]}, ${hebDateStr(h, false)}, ${gregDateStr(d, false)}${tod ? ', היום' : ''}`,
                `${WEEKDAYS[d.getDay()]}, ${hebDateStr(h, false)}, ${gregDateStr(d, false)}${tod ? ', today' : ''}`,
              )}
            >
              <span className="wd-name">{WEEKDAYS_SHORT[d.getDay()]}</span>
              <span className={`wd-num ${heb ? 'heb' : ''}`}>{heb ? hebNum(h.getDate()) : d.getDate()}</span>
              <span className={`wd-sub ${heb ? '' : 'heb'}`}>{heb ? d.getDate() : hebNum(h.getDate())}</span>
              <i className={`wd-dot ${has ? 'on' : ''}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- what matters now ---------------- */

function showShabbat(sh: ShabbatInfo | null, selected: Date, now: Date) {
  if (!sh) return false;
  // after havdalah it is over, even though it is still the same day
  if (sh.havdalah.it.time && now.getTime() >= sh.havdalah.it.time.getTime() && daysBetween(now, selected) <= 0) return false;
  const toCandle = daysBetween(selected, sh.candle.d);
  const toEnd = daysBetween(selected, sh.havdalah.d);
  return toCandle <= 1 && toEnd >= 0;
}

function NowHero({ selected, now, city, settings, fmt, z, isToday }: Props & { isToday: boolean }) {
  const sh = useMemo(
    () => nextShabbat(selected, city, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey(selected), city, settings.candleMins, settings.havdalah, settings.useElevation],
  );
  const t = now.getTime();

  // the next zman of today; after the last one, tomorrow's first. The same zmanim as the day's
  // schedule below (the main ones and those with an alert), so the two never name different times.
  const shown = (r: ZmanRow) => !!r.major || settings.zmanAlerts[r.id] !== undefined;
  let next: { name: string; hint?: string; time: Date; tomorrow?: boolean } | null = null;
  if (isToday) {
    const r = z.rows
      .filter(shown)
      .map((x) => ({ ...x, time: roundTo(x.time, x.round) }))
      .find((x) => x.time.getTime() > t);
    if (r) next = r;
    else {
      const tz = zmanim(addDays(selected, 1), city, settings).rows.filter(shown)[0];
      if (tz) next = { name: tz.name, hint: tz.hint, time: roundTo(tz.time, tz.round), tomorrow: true };
    }
  }
  const shab = showShabbat(sh, selected, now) ? sh : null;
  const inShabbat = shab && isToday && t >= shab.candle.it.time!.getTime();

  return (
    <section className={`hero ${shab ? 'is-shabbat' : ''}`} aria-label={shab ? (shab.isChag ? tr('החג', 'Yom Tov') : tr('שבת', 'Shabbat')) : tr('הזמן הבא', 'Next zman')}>
      {shab ? (
        <div className="hero-shabbat">
          <div className="eyebrow">
            {shab.isChag ? (shab.isShabbat ? tr('שבת וחג', 'Shabbat & Yom Tov') : tr('החג', 'Yom Tov')) : tr('שבת', 'Shabbat')}
            {' · '}
            {inShabbat
              ? tr('עכשיו', 'now')
              : tr(
                  `${shab.isChag && !shab.isShabbat ? 'נכנס' : 'נכנסת'} ${daysBetween(selected, shab.candle.d) === 0 ? 'היום' : 'מחר'}`,
                  `begins ${daysBetween(selected, shab.candle.d) === 0 ? 'today' : 'tomorrow'}`,
                )}
          </div>
          <h2 className="hero-title">{itemTitle(shab)}</h2>
          <div className="pair">
            <div className={`pair-cell ${inShabbat ? 'done' : ''}`}>
              <span className="pc-label">{tr('הדלקת נרות', 'Candle lighting')}</span>
              <span className="pc-time candle">{fmt.format(shab.candle.it.time!)}</span>
              <span className="pc-sub">{dayName(shab.candle.d)}</span>
            </div>
            <div className="pair-cell">
              <span className="pc-label">{shab.isChag && !shab.isShabbat ? tr('צאת החג', 'Yom Tov ends') : tr('צאת השבת', 'Shabbat ends')}</span>
              <span className="pc-time">{fmt.format(shab.havdalah.it.time!)}</span>
              <span className="pc-sub">{shab.havdalah.d.getDay() === 6 ? tr('מוצאי שבת', 'Saturday night') : dayName(shab.havdalah.d)}</span>
            </div>
          </div>
          {isToday && (
            <p className="hero-count">
              {!inShabbat
                ? `${tr('הדלקת נרות', 'Candle lighting')} ${inTime(shab.candle.it.time!.getTime() - t)}`
                : `${shab.isChag && !shab.isShabbat ? tr('צאת החג', 'Yom Tov ends') : tr('צאת השבת', 'Shabbat ends')} ${inTime(shab.havdalah.it.time!.getTime() - t)}`}
            </p>
          )}
        </div>
      ) : next ? (
        <div className="hero-next">
          <div className="eyebrow">{next.tomorrow ? tr('הזמן הבא · מחר', 'Next zman · tomorrow') : tr('הזמן הבא', 'Next zman')}</div>
          <div className="hn-row">
            <h2 className="hero-title">
              {next.name}
              {next.hint && <small>{next.hint}</small>}
            </h2>
            <span className="hn-time">{fmt.format(next.time)}</span>
          </div>
          <p className="hero-count">{inTime(next.time.getTime() - t)}</p>
        </div>
      ) : (
        <div className="hero-next">
          <div className="eyebrow">{dayName(selected)}</div>
          <h2 className="hero-title">{hebDateStr(new HDate(selected))}</h2>
        </div>
      )}

      {/* the colours of the day are in the sky above; here just its two edges */}
      <div className="sun-times">
        <span>
          {tr('זריחה', 'Sunrise')} <b>{fmt.format(roundTo(z.sunrise, 'round'))}</b>
        </span>
        <span>
          {tr('שקיעה', 'Sunset')} <b>{fmt.format(roundTo(z.sunset, 'floor'))}</b>
        </span>
      </div>
    </section>
  );
}

/* ---------------- the day as an agenda ---------------- */

function Agenda({ selected, now, items, z, mine, settings, city, fmt, isToday, onAddEvent, onEditEvent, onAllZmanim }: Props & { isToday: boolean }) {
  const alerted = settings.zmanAlerts;
  const rows = agendaRows(z.rows, items, mine, selected, (r) => !!r.major || alerted[r.id] !== undefined, settings.candleMins ?? city.candle);
  const allDay: { key: string; title: string; kind: string; color?: string; ev?: MyEvent; years?: number }[] = items
    .filter((i) => DAY_KINDS.has(i.kind))
    // Hebrew: the short cell title (the parasha in full); English: the full title, which reads better in a row
    .map((i, n) => ({ key: i.kind + n, title: isHe() ? (i.kind === 'parasha' ? i.title : shortTitle(i.title)) : itemTitle(i), kind: i.kind }));
  if (selected.getDay() === 5 && !items.some((i) => i.kind === 'erev' || i.kind === 'yomtov')) allDay.unshift({ key: 'erev-shabbat', title: tr('ערב שבת קודש', 'Erev Shabbat'), kind: 'erev' });
  for (const m of mine) if (!m.ev.time) allDay.push({ key: 'ev' + m.ev.id, title: m.ev.title, kind: 'mine', color: m.ev.color, ev: m.ev, years: m.years });

  const t = now.getTime();
  const nextIdx = isToday ? rows.findIndex((r) => r.time.getTime() > t) : -2;
  // today: the zmanim that already passed fold into one line, so "now" sits near the top
  const [showPast, setShowPast] = useState(false);
  const pastCount = isToday ? (nextIdx === -1 ? rows.length : nextIdx) : 0;
  const fold = pastCount > 1 && !showPast;
  const mineById = new Map(mine.map((m) => [m.ev.id, m.ev]));

  return (
    <section className="agenda" aria-label={tr('סדר היום', 'Schedule')}>
      <header className="sec-head">
        <h3>{tr('סדר היום', 'Schedule')}</h3>
        <button className="text-btn" onClick={onAllZmanim}>
          {tr('כל הזמנים', 'All zmanim')}
        </button>
      </header>

      {allDay.length > 0 && (
        <ul className="allday">
          {allDay.map((a) =>
            a.ev ? (
              <li key={a.key}>
                <button className="ad-row" onClick={() => onEditEvent(a.ev!)}>
                  <i className="mk" style={{ background: a.color }} />
                  <span className="ad-title">
                    {a.title}
                    {a.ev.repeat !== 'none' && a.years! > 0 && <small> · {yearsWord(a.years!)}</small>}
                  </span>
                  {a.ev.remind && a.ev.remind !== 'none' && <Icon name="bell" size={16} />}
                </button>
              </li>
            ) : (
              <li key={a.key} className={`ad-row k-${a.kind}`}>
                <i className="mk" />
                <span className="ad-title">{a.title}</span>
              </li>
            ),
          )}
        </ul>
      )}

      <ol className="tl">
        {fold && (
          <li className="tl-row folded">
            <button className="tl-body" onClick={() => setShowPast(true)}>
              <span className="tl-time">{fmt.format(rows[0].time)}</span>
              <i className="tl-dot" aria-hidden="true" />
              <span className="tl-name">
                {tr(`${pastCount} זמנים שעברו`, `${pastCount} earlier zmanim`)}
              </span>
              <Icon name="down" size={16} />
            </button>
          </li>
        )}
        {rows.map((r, i) => {
          if (fold && i < pastCount) return null;
          const past = isToday && r.time.getTime() <= t;
          const ev = r.kind === 'mine' ? mineById.get(r.key.slice(2)) : undefined;
          const body = (
            <>
              <time className="tl-time">{fmt.format(r.time)}</time>
              <i className="tl-dot" style={r.color ? { background: r.color, borderColor: r.color } : undefined} aria-hidden="true" />
              <span className="tl-name">
                {r.name}
                {r.hint && <small>{r.hint}</small>}
              </span>
              {r.zmanId && alerted[r.zmanId] !== undefined && (
                <span className="tl-bell" aria-label={tr('יש התראה', 'Alert on')}>
                  <Icon name="bell" size={16} />
                </span>
              )}
            </>
          );
          return (
            <li key={r.key} className={`tl-row k-${r.kind} ${past ? 'past' : ''}`}>
              {i === nextIdx && (
                <div className="now-line" aria-label={tr(`עכשיו ${fmt.format(now)}`, `Now ${fmt.format(now)}`)}>
                  <span className="nl-time">{fmt.format(now)}</span>
                  <i />
                  <span className="nl-text">
                    {r.name.split(' — ')[0]} {inTime(r.time.getTime() - t)}
                  </span>
                </div>
              )}
              {ev ? (
                <button className="tl-body" onClick={() => onEditEvent(ev)}>
                  {body}
                </button>
              ) : (
                <div className="tl-body">{body}</div>
              )}
            </li>
          );
        })}
        {isToday && nextIdx === -1 && rows.length > 0 && (
          <li className="tl-row">
            <div className="now-line">
              <span className="nl-time">{fmt.format(now)}</span>
              <i />
              <span className="nl-text">{tr('הזמנים של היום עברו', "Today's zmanim have passed")}</span>
            </div>
          </li>
        )}
      </ol>
      <button className="add-row" onClick={onAddEvent}>
        <Icon name="plus" size={18} />
        <span>{tr('הוספת אירוע ביום הזה', 'Add an event on this day')}</span>
      </button>
    </section>
  );
}

/* ---------------- prayer + learning, as compact rows ---------------- */

function Notes({ date, il, items, showLearning }: { date: Date; il: boolean; items: DayItem[]; showLearning: boolean }) {
  const notes = prayerNotes(date, il, items);
  const omer = items.find((i) => i.kind === 'omer');
  const learning = showLearning ? items.filter((i) => i.kind === 'learning') : [];
  return (
    <section className="notes" aria-label={tr('בתפילה ובלימוד', 'Prayer and learning')}>
      <header className="sec-head">
        <h3>{learning.length ? tr('בתפילה ובלימוד', 'Prayer & learning') : tr('בתפילה', 'Prayer')}</h3>
      </header>
      <dl className="facts">
        <div>
          <dt>{tr('בתפילה', 'Prayer')}</dt>
          <dd>
            {notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </dd>
        </div>
        {omer && (
          <div>
            <dt>{tr('ספירת העומר', 'Omer count')}</dt>
            <dd>{itemTitle(omer)}</dd>
          </div>
        )}
        {learning.map((x, i) => (
          <div key={i}>
            <dt>{learningLabel(x)}</dt>
            <dd>{itemTitle(x)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
