import { useState } from 'react';
import { HDate } from '@hebcal/core';
import { dateKey, eventHebDate, fromKey, gregDateStr, hebDateStr } from '../lib/cal';
import { byLang, tr } from '../lib/i18n';
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

// reads in the interface language wherever it is indexed (i18n.ts byLang)
const COLOR_NAMES = byLang(['כתום', 'ירוק', 'כחול', 'ורוד', 'סגול', 'חרדל'], ['orange', 'green', 'blue', 'pink', 'purple', 'mustard']);

const reminds = (): [Remind, string][] => [
  ['none', tr('ללא', 'None')],
  ['day', tr('ביום עצמו', 'On the day')],
  ['eve', tr('בערב שלפני', 'Evening before')],
  ['week', tr('שבוע לפני', 'A week before')],
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
    <Screen title={initial ? tr('עריכת אירוע', 'Edit event') : tr('אירוע חדש', 'New event')} onClose={onClose}>
      <form className="editor" onSubmit={save}>
        <label className="field col">
          <span>{tr('כותרת', 'Title')}</span>
          <input id="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('לדוגמה: יום הולדת לאבא', "e.g. Dad's birthday")} maxLength={80} />
        </label>

        <div className="field col">
          <span id="lbl-ev-datemode">{tr('תאריך', 'Date')}</span>
          <div className="seg small" role="group" aria-labelledby="lbl-ev-datemode">
            <button type="button" className={dateMode === 'greg' ? 'on' : ''} aria-pressed={dateMode === 'greg'} onClick={() => switchMode('greg')}>
              {tr('לועזי', 'Gregorian')}
            </button>
            <button type="button" className={dateMode === 'heb' ? 'on' : ''} aria-pressed={dateMode === 'heb'} onClick={() => switchMode('heb')}>
              {tr('עברי', 'Hebrew')}
            </button>
          </div>
        </div>
        {dateMode === 'greg' ? (
          <div className="two">
            <label className="field col">
              <span>{tr('תאריך לועזי', 'Gregorian date')}</span>
              <input id="ev-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </label>
            <label className="field col">
              <span>{tr('שעה (רשות)', 'Time (optional)')}</span>
              <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
        ) : (
          <>
            <HebDatePicker idPrefix="ev" value={heb} onChange={setHeb} />
            <label className="field">
              <span>{tr('שעה (רשות)', 'Time (optional)')}</span>
              <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </>
        )}
        {dateMode === 'greg' && (
          <label className="toggle" htmlFor="ev-sunset">
            <span>
              {tr('אחרי השקיעה', 'After sunset')}
              <small className="sub">
                {tr('אירוע שהיה בערב, אחרי השקיעה, חל כבר בתאריך העברי של למחרת', 'An event in the evening, after sunset, falls on the next Hebrew date')}
              </small>
            </span>
            <input id="ev-sunset" type="checkbox" checked={afterSunset} onChange={(e) => setAfterSunset(e.target.checked)} />
            <i aria-hidden="true" />
          </label>
        )}
        {gd && hd && (
          <p className="fine" aria-live="polite">
            {gregDateStr(gd)}
            {sunset ? tr(' (בערב)', ' (evening)') : ''} · <b>{hebDateStr(hd)}</b>
            {sunset && <> · {tr(`ביום עצמו היה ${hebDateStr(new HDate(gd), false)}`, `in the daytime it was ${hebDateStr(new HDate(gd), false)}`)}</>}
          </p>
        )}

        <div className="field col">
          <span id="lbl-ev-repeat">{tr('חזרה', 'Repeat')}</span>
          <div className="seg small wrap" role="group" aria-labelledby="lbl-ev-repeat">
            {(
              [
                ['none', tr('חד־פעמי', 'One-time')],
                ['heb-yearly', tr('כל שנה · עברי', 'Yearly · Hebrew')],
                ['greg-yearly', tr('כל שנה · לועזי', 'Yearly · Gregorian')],
              ] as [Repeat, string][]
            ).map(([k, l]) => (
              <button type="button" key={k} className={repeat === k ? 'on' : ''} aria-pressed={repeat === k} onClick={() => setRepeat(k)}>
                {l}
              </button>
            ))}
          </div>
          {repeat !== 'none' && (
            <small className="sub">
              {repeat === 'heb-yearly'
                ? tr('חוזר כל שנה באותו תאריך עברי, כמו יום הולדת עברי או יארצייט', 'Repeats every year on the same Hebrew date, like a Hebrew birthday or a yahrzeit')
                : tr('חוזר כל שנה באותו תאריך לועזי', 'Repeats every year on the same Gregorian date')}
            </small>
          )}
        </div>

        <div className="field col">
          <span id="lbl-ev-remind">{tr('תזכורת', 'Reminder')}</span>
          <div className="seg small wrap" role="group" aria-labelledby="lbl-ev-remind">
            {reminds().map(([k, l]) => (
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
              <span>{tr('שעת התזכורת', 'Reminder time')}</span>
              <input id="ev-remind-time" type="time" value={remindTime || REMIND_DEFAULT_TIME[remind]} onChange={(e) => e.target.value && setRemindTime(e.target.value)} />
            </label>
            <p className="fine">
              {isNative()
                ? tr('התזכורת מגיעה כהתראה בטלפון, גם כשהאפליקציה סגורה.', 'The reminder arrives as a notification on your phone, even when the app is closed.')
                : tr(
                    'התזכורת נשלחת כהתראה באפליקציה המותקנת לאנדרואיד ולאייפון. באתר היא נשמרת, אבל לא נשלחת.',
                    'Reminders are sent as notifications by the Android and iPhone apps. On the website they are saved but not sent.',
                  )}
            </p>
          </>
        )}

        <div className="field col">
          <span>{tr('צבע', 'Color')}</span>
          <div className="swatches">
            {EVENT_COLORS.map((c, i) => (
              <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={tr(`צבע ${COLOR_NAMES[i] ?? i + 1}`, `Color: ${COLOR_NAMES[i] ?? i + 1}`)} aria-pressed={color === c} />
            ))}
          </div>
        </div>
        <label className="field col">
          <span>{tr('הערה (רשות)', 'Note (optional)')}</span>
          <textarea id="ev-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <div className="editor-actions">
          <button className="primary" type="submit" disabled={!valid}>
            {tr('שמירה', 'Save')}
          </button>
          {initial &&
            (confirmDel ? (
              <span className="confirm">
                {tr('למחוק את האירוע?', 'Delete this event?')}
                <button type="button" className="danger" onClick={() => onDelete(initial.id)}>
                  {tr('כן, למחוק', 'Yes, delete')}
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmDel(false)}>
                  {tr('ביטול', 'Cancel')}
                </button>
              </span>
            ) : (
              <button type="button" className="ghost-btn danger-text" onClick={() => setConfirmDel(true)}>
                {tr('מחיקה', 'Delete')}
              </button>
            ))}
        </div>
      </form>
    </Screen>
  );
}
