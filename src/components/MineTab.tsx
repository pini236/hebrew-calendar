import { useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import { WEEKDAYS, dateKey, eventHebDate, fromKey, gregDateStr, hebDateStr } from '../lib/cal';
import type { MyEvent } from '../lib/store';
import { Icon } from './Icon';
import { upcomingEvents, type Upcoming } from './dayinfo';

interface Props {
  myEvents: MyEvent[];
  today: Date;
  onAdd: () => void;
  onEdit: (e: MyEvent) => void;
  onOpenDay: (d: Date) => void;
  onAlerts: () => void;
  onBackup: () => void;
}

const REPEAT_WORDS: Record<MyEvent['repeat'], string> = { none: 'חד־פעמי', 'heb-yearly': 'כל שנה, לפי התאריך העברי', 'greg-yearly': 'כל שנה, לפי התאריך הלועזי' };
const REMIND_WORDS = { day: 'ביום עצמו', eve: 'בערב שלפני', week: 'שבוע לפני' } as const;

export function MineTab({ myEvents, today, onAdd, onEdit, onOpenDay, onAlerts, onBackup }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { upcoming, past } = useMemo(() => upcomingEvents(myEvents, today), [myEvents, dateKey(today)]);
  const [showPast, setShowPast] = useState(false);
  const groups: [string, Upcoming[]][] = [
    ['השבוע', upcoming.filter((u) => u.inDays < 7)],
    ['החודש הקרוב', upcoming.filter((u) => u.inDays >= 7 && u.inDays < 31)],
    ['בהמשך השנה', upcoming.filter((u) => u.inDays >= 31)],
  ];
  const reminders = myEvents.filter((e) => e.remind && e.remind !== 'none').length;

  return (
    <div className="tab mine-tab">
      <header className="tab-head">
        <h1 className="tab-title">האירועים שלי</h1>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={18} />
          אירוע חדש
        </button>
      </header>

      {myEvents.length === 0 ? (
        <section className="empty-state">
          <h2>ימי הולדת ויארצייט, לפי התאריך העברי</h2>
          <p>
            מוסיפים פעם אחת, והאירוע חוזר כל שנה בתאריך העברי הנכון, עם תזכורת ביום עצמו, בערב שלפניו או שבוע לפני. אפשר גם אירוע חד־פעמי או לפי התאריך הלועזי.
          </p>
          <button className="btn primary" onClick={onAdd}>
            <Icon name="plus" size={18} />
            הוספת האירוע הראשון
          </button>
        </section>
      ) : (
        <div className="mine-cols">
          <div className="mine-list">
            {groups.map(([name, list]) =>
              list.length ? (
                <section key={name} aria-label={name}>
                  <h3 className="group-label">{name}</h3>
                  <ul className="list">
                    {list.map((u) => (
                      <li key={u.ev.id}>
                        <EventRow u={u} onEdit={onEdit} onOpenDay={onOpenDay} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
            {past.length > 0 && (
              <section aria-label="אירועים שעברו">
                <button className="group-label as-btn" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
                  שעברו ({past.length})
                  <Icon name="down" size={16} />
                </button>
                {showPast && (
                  <ul className="list">
                    {past.map((e) => (
                      <li key={e.id}>
                        <button className="ev-row past" onClick={() => onEdit(e)}>
                          <span className="ev-when">
                            <i style={{ background: e.color }} />
                          </span>
                          <span className="ev-main">
                            <b>{e.title}</b>
                            <small>
                              {hebDateStr(eventHebDate(e))} · {gregDateStr(fromKey(e.date))}
                            </small>
                          </span>
                          <Icon name="edit" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div className="mine-side">
            <ul className="list card-list">
              <li>
                <button className="link-row" onClick={onAlerts}>
                  <Icon name="bell" size={18} />
                  <span>
                    תזכורות והתראות
                    <small>{reminders ? `תזכורת ל־${reminders} אירועים` : 'בוחרים תזכורת בעריכת האירוע'}</small>
                  </span>
                  <Icon name="next" size={16} />
                </button>
              </li>
              <li>
                <button className="link-row" onClick={onBackup}>
                  <Icon name="download" size={18} />
                  <span>
                    גיבוי והעברה למכשיר אחר
                    <small>האירועים שמורים רק במכשיר הזה</small>
                  </span>
                  <Icon name="next" size={16} />
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ u, onEdit, onOpenDay }: { u: Upcoming; onEdit: (e: MyEvent) => void; onOpenDay: (d: Date) => void }) {
  const { ev, d, years, inDays } = u;
  const hd = new HDate(d);
  const when = inDays === 0 ? 'היום' : inDays === 1 ? 'מחר' : null;
  return (
    <div className="ev-row">
      <button className="ev-when" onClick={() => onOpenDay(d)} aria-label={`${when ?? `בעוד ${inDays} ימים`}. פתיחת היום`}>
        {when ? (
          <b className="word">{when}</b>
        ) : (
          <>
            <b>{inDays}</b>
            <small>ימים</small>
          </>
        )}
      </button>
      <button className="ev-main" onClick={() => onEdit(ev)}>
        <b>
          <i style={{ background: ev.color }} aria-hidden="true" />
          {ev.title}
          {ev.repeat !== 'none' && years > 0 && <span className="ev-years"> · {years} שנים</span>}
        </b>
        <small>
          {hebDateStr(hd, false)} · יום {WEEKDAYS[d.getDay()]}, {gregDateStr(d, false)}
          {ev.time ? ` · ${ev.time}` : ''}
        </small>
        <small className="ev-meta">
          {REPEAT_WORDS[ev.repeat]}
          {ev.remind && ev.remind !== 'none' ? ` · תזכורת ${REMIND_WORDS[ev.remind]}` : ''}
        </small>
      </button>
      {ev.remind && ev.remind !== 'none' && (
        <span className="ev-bell" aria-label="יש תזכורת">
          <Icon name="bell" size={16} />
        </span>
      )}
    </div>
  );
}
