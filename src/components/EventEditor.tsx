import { useState } from 'react';
import { HDate } from '@hebcal/core';
import { fromKey, gregDateStr, hebDateStr } from '../lib/cal';
import { EVENT_COLORS, newId, type MyEvent, type Repeat } from '../lib/store';
import { Sheet } from './Sheet';

interface Props {
  initial: MyEvent | null;
  date: string;
  onSave: (e: MyEvent) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function EventEditor({ initial, date, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [d, setD] = useState(initial?.date ?? date);
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? 'none');
  const [color, setColor] = useState(initial?.color ?? EVENT_COLORS[0]);
  const [time, setTime] = useState(initial?.time ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const gd = valid ? fromKey(d) : null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ id: initial?.id ?? newId(), title: title.trim(), date: d, repeat, color, time: time || undefined, note: note.trim() || undefined });
  };

  return (
    <Sheet title={initial ? 'עריכת אירוע' : 'אירוע חדש'} onClose={onClose}>
      <form className="editor" onSubmit={save}>
        <label className="field col">
          <span>כותרת</span>
          <input id="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: יום הולדת לאבא" maxLength={80} />
        </label>
        <div className="two">
          <label className="field col">
            <span>תאריך</span>
            <input id="ev-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
          <label className="field col">
            <span>שעה (רשות)</span>
            <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        {gd && (
          <p className="fine">
            {gregDateStr(gd)} · <b>{hebDateStr(new HDate(gd))}</b>
          </p>
        )}
        <div className="field col">
          <span>חזרה</span>
          <div className="seg small wrap">
            {(
              [
                ['none', 'חד־פעמי'],
                ['heb-yearly', 'כל שנה לפי התאריך העברי'],
                ['greg-yearly', 'כל שנה לפי התאריך הלועזי'],
              ] as [Repeat, string][]
            ).map(([k, l]) => (
              <button type="button" key={k} className={repeat === k ? 'on' : ''} onClick={() => setRepeat(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field col">
          <span>צבע</span>
          <div className="swatches">
            {EVENT_COLORS.map((c) => (
              <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`צבע ${c}`} />
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
    </Sheet>
  );
}
