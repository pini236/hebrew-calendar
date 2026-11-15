import { useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import { dateKey, eventHebDate, fromKey, gregDateStr, hebDateStr } from '../lib/cal';
import { isHe, plural, tr } from '../lib/i18n';
import type { MyEvent } from '../lib/store';
import { Icon } from './Icon';
import { dayName, upcomingEvents, yearsWord, type Upcoming } from './dayinfo';

interface Props {
  myEvents: MyEvent[];
  today: Date;
  onAdd: () => void;
  onEdit: (e: MyEvent) => void;
  onOpenDay: (d: Date) => void;
  onAlerts: () => void;
  onBackup: () => void;
}


export function MineTab({ myEvents, today, onAdd, onEdit, onOpenDay, onAlerts, onBackup }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { upcoming, past } = useMemo(() => upcomingEvents(myEvents, today), [myEvents, dateKey(today)]);
  const [showPast, setShowPast] = useState(false);
  const groups: [string, Upcoming[]][] = [
    [tr('השבוע', 'This week'), upcoming.filter((u) => u.inDays < 7)],
    [tr('החודש הקרוב', 'Coming month'), upcoming.filter((u) => u.inDays >= 7 && u.inDays < 31)],
    [tr('בהמשך השנה', 'Later this year'), upcoming.filter((u) => u.inDays >= 31)],
  ];

  return (
    <div className="tab mine-tab">
      <header className="tab-head">
        <h1 className="tab-title">{tr('האירועים שלי', 'My events')}</h1>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={18} />
          {tr('אירוע חדש', 'New event')}
        </button>
      </header>

      {myEvents.length === 0 ? (
        <section className="empty-state">
          <h2>{tr('ימי הולדת ויארצייט, לפי התאריך העברי', 'Birthdays and yahrzeits, by the Hebrew date')}</h2>
          <p>
            {tr(
              'מוסיפים פעם אחת, והאירוע חוזר כל שנה בתאריך העברי הנכון, עם תזכורת ביום עצמו, בערב שלפניו או שבוע לפני. אפשר גם אירוע חד־פעמי או לפי התאריך הלועזי.',
              'Add it once and it comes back every year on the right Hebrew date, with a reminder on the day, the evening before or a week before. One-time events and events by the Gregorian date work too.',
            )}
          </p>
          <button className="btn primary" onClick={onAdd}>
            <Icon name="plus" size={18} />
            {tr('הוספת האירוע הראשון', 'Add your first event')}
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
              <section aria-label={tr('אירועים שעברו', 'Past events')}>
                <button className="group-label as-btn" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
                  {tr(`שעברו (${past.length})`, `Past (${past.length})`)}
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
                  <span>{tr('התראות', 'Alerts')}</span>
                  <Icon name="next" size={16} />
                </button>
              </li>
              <li>
                <button className="link-row" onClick={onBackup}>
                  <Icon name="download" size={18} />
                  <span>{tr('גיבוי', 'Backup')}</span>
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
  const when = inDays === 0 ? tr('היום', 'Today') : inDays === 1 ? tr('מחר', 'Tomorrow') : null;
  // "Tomorrow" is too wide for the box in English: it shows "1 day" there
  const word = inDays === 1 && !isHe() ? null : when;
  return (
    <div className="ev-row">
      <button className="ev-when" onClick={() => onOpenDay(d)} aria-label={tr(`${when ?? `בעוד ${inDays} ימים`}. פתיחת היום`, `${when ?? `In ${inDays} days`}. Open the day`)}>
        {word ? (
          <b className="word">{word}</b>
        ) : (
          <>
            <b>{inDays}</b>
            <small>{tr('ימים', plural(inDays, 'day', 'days'))}</small>
          </>
        )}
      </button>
      <button className="ev-main" onClick={() => onEdit(ev)}>
        <b>
          <i style={{ background: ev.color }} aria-hidden="true" />
          {ev.title}
          {ev.repeat !== 'none' && years > 0 && <span className="ev-years"> · {yearsWord(years)}</span>}
        </b>
        <small>
          {hebDateStr(hd, false)} · {dayName(d)}, {gregDateStr(d, false)}
          {ev.time ? ` · ${ev.time}` : ''}
        </small>
      </button>
      {ev.remind && ev.remind !== 'none' && (
        <span className="ev-bell" aria-label={tr('יש תזכורת', 'Reminder on')}>
          <Icon name="bell" size={16} />
        </span>
      )}
    </div>
  );
}
