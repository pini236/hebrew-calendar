import { useState } from 'react';
import { HDate } from '@hebcal/core';
import { dateKey, eventHebDate, fromKey, gregDateStr, hebDateStr } from '../lib/cal';
import { EVENT_COLORS, REMIND_DEFAULT_TIME, newId, type MyEvent, type Remind, type Repeat } from '../lib/store';
import { isNative, notificationPermission } from '../lib/native';
import { Screen } from './Screen';
import { HebDatePicker, hebPartsOf, hebPartsToDate, type HebParts } from './HebDatePicker';

interface Props {
  initial: MyEvent | null;
  date: string;
  onSave: (e: MyEvent) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const COLOR_NAMES = ['כתום', 'ירוק', 'כחול', 'ורוד', 'סגול', 'חרדל'];

const REMINDS: [Remind, string][] = [
  ['none', 'ללא'],
  ['day', 'ביום עצמו'],
  ['eve', 'בערב שלפני'],
  ['week', 'שבוע לפני'],
];

export function EventEditor({ initial, date, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [d, setD] = useState(initial?.date ?? date);
  const [afterSunset, setAfterSunset] = useState(!!initial?.afterSunset);
  const [dateMode, setDateMode] = useState<'greg' | 'heb'>('greg');
  const [heb, setHeb] = useState<HebParts>(() => hebPartsOf(eventHebDate({ date: initial?.date ?? date, afterSunset: initial?.afterSunset }).greg()));
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? 'none');
  const [color, setColor] = useState(initial?.color ?? EVENT_COLORS[0]);
  const [time, setTime] = useState(initial?.time ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [remind, setRemind] = useState<Remind>(initial?.remind ?? 'none');
  const [remindTime, setRemindTime] = useState(initial?.remindTime ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  // in Hebrew mode the Hebrew date is what the user chose; the Gregorian date is the daytime of that day
  const key = dateMode === 'heb' ? dateKey(hebPartsToDate(heb)) : d;
  const sunset = dateMode === 'heb' ? false : afterSunset;
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(key);
  const gd = /^\d{4}-\d{2}-\d{2}$/.test(key) ? fromKey(key) : null;
  const hd = gd ? eventHebDate({ date: key, afterSunset: sunset }) : null;

  const switchMode = (m: 'greg' | 'heb') => {
    if (m === dateMode) return;
    if (m === 'heb' && hd) setHeb(hebPartsOf(hd.greg()));
    if (m === 'greg') {
      setD(key);
      setAfterSunset(false);
    }
    setDateMode(m);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    // a reminder on the phone needs notification permission; ask now, while the user is choosing it
    if (remind !== 'none' && isNative()) notificationPermission(true).catch(() => {});
    onSave({
      id: initial?.id ?? newId(),
      title: title.trim(),
      date: key,
      repeat,
      color,
      time: time || undefined,
      note: note.trim() || undefined,
      afterSunset: sunset || undefined,
      remind: remind === 'none' ? undefined : remind,
      remindTime: remind === 'none' || !remindTime || remindTime === REMIND_DEFAULT_TIME[remind] ? undefined : remindTime,
    });
  };

  return (
    <Screen title={initial ? 'עריכת אירוע' : 'אירוע חדש'} onClose={onClose}>
      <form className="editor" onSubmit={save}>
        <label className="field col">
          <span>כותרת</span>
          <input id="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: יום הולדת לאבא" maxLength={80} />
        </label>

        <div className="field col">
          <span id="lbl-ev-datemode">תאריך</span>
          <div className="seg small" role="group" aria-labelledby="lbl-ev-datemode">
            <button type="button" className={dateMode === 'greg' ? 'on' : ''} aria-pressed={dateMode === 'greg'} onClick={() => switchMode('greg')}>
              לועזי
            </button>
            <button type="button" className={dateMode === 'heb' ? 'on' : ''} aria-pressed={dateMode === 'heb'} onClick={() => switchMode('heb')}>
              עברי
            </button>
          </div>
        </div>
        {dateMode === 'greg' ? (
          <div className="two">
            <label className="field col">
              <span>תאריך לועזי</span>
              <input id="ev-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </label>
            <label className="field col">
              <span>שעה (רשות)</span>
              <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
        ) : (
          <>
            <HebDatePicker idPrefix="ev" value={heb} onChange={setHeb} />
            <label className="field">
              <span>שעה (רשות)</span>
              <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </>
        )}
        {dateMode === 'greg' && (
          <label className="toggle" htmlFor="ev-sunset">
            <span>
              אחרי השקיעה
              <small className="sub">אירוע שהיה בערב, אחרי השקיעה, חל כבר בתאריך העברי של למחרת</small>
            </span>
            <input id="ev-sunset" type="checkbox" checked={afterSunset} onChange={(e) => setAfterSunset(e.target.checked)} />
            <i aria-hidden="true" />
          </label>
        )}
        {gd && hd && (
          <p className="fine" aria-live="polite">
            {gregDateStr(gd)}
            {sunset ? ' (בערב)' : ''} · <b>{hebDateStr(hd)}</b>
            {sunset && <> · ביום עצמו היה {hebDateStr(new HDate(gd), false)}</>}
          </p>
        )}

        <div className="field col">
          <span id="lbl-ev-repeat">חזרה</span>
          <div className="seg small wrap" role="group" aria-labelledby="lbl-ev-repeat">
            {(
              [
                ['none', 'חד־פעמי'],
                ['heb-yearly', 'כל שנה · עברי'],
                ['greg-yearly', 'כל שנה · לועזי'],
              ] as [Repeat, string][]
            ).map(([k, l]) => (
              <button type="button" key={k} className={repeat === k ? 'on' : ''} aria-pressed={repeat === k} onClick={() => setRepeat(k)}>
                {l}
              </button>
            ))}
          </div>
          {repeat !== 'none' && (
            <small className="sub">{repeat === 'heb-yearly' ? 'חוזר כל שנה באותו תאריך עברי, כמו יום הולדת עברי או יארצייט' : 'חוזר כל שנה באותו תאריך לועזי'}</small>
          )}
        </div>

        <div className="field col">
          <span id="lbl-ev-remind">תזכורת</span>
          <div className="seg small wrap" role="group" aria-labelledby="lbl-ev-remind">
            {REMINDS.map(([k, l]) => (
              <button
                type="button"
                key={k}
                className={remind === k ? 'on' : ''}
                aria-pressed={remind === k}
                onClick={() => {
                  setRemind(k);
                  setRemindTime(k === 'none' ? '' : REMIND_DEFAULT_TIME[k]);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {remind !== 'none' && (
          <>
            <label className="field">
              <span>שעת התזכורת</span>
              <input id="ev-remind-time" type="time" value={remindTime || REMIND_DEFAULT_TIME[remind]} onChange={(e) => e.target.value && setRemindTime(e.target.value)} />
            </label>
            <p className="fine">
              {isNative()
                ? 'התזכורת מגיעה כהתראה בטלפון, גם כשהאפליקציה סגורה.'
                : 'התזכורת נשלחת כהתראה באפליקציה המותקנת לאנדרואיד ולאייפון. באתר היא נשמרת, אבל לא נשלחת.'}
            </p>
          </>
        )}

        <div className="field col">
          <span>צבע</span>
          <div className="swatches">
            {EVENT_COLORS.map((c, i) => (
              <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`צבע ${COLOR_NAMES[i] ?? i + 1}`} aria-pressed={color === c} />
            ))}
          </div>
        </div>
        <label className="field col">
          <span>הערה (רשות)</span>
          <textarea id="ev-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <div className="editor-actions">
          <button className="primary" type="submit" disabled={!valid}>
            שמירה
          </button>
          {initial &&
            (confirmDel ? (
              <span className="confirm">
                למחוק את האירוע?
                <button type="button" className="danger" onClick={() => onDelete(initial.id)}>
                  כן, למחוק
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmDel(false)}>
                  ביטול
                </button>
              </span>
            ) : (
              <button type="button" className="ghost-btn danger-text" onClick={() => setConfirmDel(true)}>
                מחיקה
              </button>
            ))}
        </div>
      </form>
    </Screen>
  );
}
