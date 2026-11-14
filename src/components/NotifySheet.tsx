import { useMemo, useState } from 'react';
import { WEEKDAYS, gregDateStr, today } from '../lib/cal';
import type { City } from '../lib/cities';
import { alertText, buildShabbatIcs, shabbatAlerts } from '../lib/ics';
import type { Settings } from '../lib/store';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

interface Props {
  city: City;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

declare const __SINGLE__: boolean;

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent + (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent) ? 'iPad' : ''));
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export function NotifySheet({ city, settings, onChange, onClose }: Props) {
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const alerts = useMemo(
    () => shabbatAlerts(today(), settings.alertWeeks, city, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city, settings.alertWeeks, settings.candleMins, settings.havdalah, settings.useElevation],
  );
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const makeFile = () => {
    const ics = buildShabbatIcs(alerts, city, settings.alertTime);
    return new File([ics], 'shabbat-luachi.ics', { type: 'text/calendar' });
  };

  const addToCalendar = () => {
    try {
      const file = makeFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      // iOS opens a calendar file straight into "Add all events"; elsewhere it downloads
      if (isIOS) a.target = '_blank';
      else a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDone(true);
      setMsg(`נוצר קובץ עם ${alerts.length} התראות שבת.`);
    } catch {
      setMsg('לא הצלחנו ליצור את הקובץ במכשיר הזה. נסו "שיתוף הקובץ".');
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && (() => {
    try {
      return navigator.canShare({ files: [new File(['x'], 'a.ics', { type: 'text/calendar' })] });
    } catch {
      return false;
    }
  })();

  const share = async () => {
    try {
      await navigator.share({ files: [makeFile()], title: 'זמני שבת — לוחי' });
      setDone(true);
      setMsg('שותף. בחרו באפליקציית היומן כדי להוסיף את ההתראות.');
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setMsg('השיתוף לא הצליח במכשיר הזה. נסו "הוספה ליומן".');
    }
  };

  const preview = alerts.slice(0, 3);

  return (
    <Sheet title="התראה בכל יום שישי" onClose={onClose}>
      <p className="lead">
        בכל יום שישי בבוקר תקבלו התראה עם שעת כניסת השבת ושעת היציאה ב<b>{city.name}</b>. ההתראות נכנסות ליומן של הטלפון,
        ולכן הן מגיעות גם כשהאפליקציה סגורה.
      </p>

      <div className="two">
        <label className="field col">
          <span>שעת ההתראה ביום שישי</span>
          <input id="alert-time" type="time" value={settings.alertTime} onChange={(e) => e.target.value && set({ alertTime: e.target.value })} />
        </label>
        <label className="field col">
          <span>לכמה זמן קדימה</span>
          <select id="alert-weeks" value={settings.alertWeeks} onChange={(e) => set({ alertWeeks: +e.target.value })}>
            <option value={13}>3 חודשים</option>
            <option value={26}>חצי שנה</option>
            <option value={52}>שנה</option>
            <option value={104}>שנתיים</option>
          </select>
        </label>
      </div>

      <div className="alert-preview" aria-label="דוגמה להתראות הקרובות">
        {preview.map((a) => {
          const t = alertText(a, city);
          return (
            <div className="notif" key={a.friday.getTime()}>
              <div className="notif-head">
                <span className="notif-app">
                  <Icon name="candle" size={14} /> יומן
                </span>
                <span>
                  יום {WEEKDAYS[5]}, {gregDateStr(a.friday, false)} · {settings.alertTime}
                </span>
              </div>
              <div className="notif-body">{t.summary.replace(/^🕯️\s*/, '')}</div>
            </div>
          );
        })}
        {alerts.length === 0 && <p className="empty">לא נמצאו זמני שבת לטווח הזה.</p>}
      </div>

      <div className="row-btns">
        <button className="primary" onClick={addToCalendar} disabled={!alerts.length}>
          <Icon name="today" size={18} /> הוספה ליומן ({alerts.length} שבתות)
        </button>
        {canShare && (
          <button className="ghost-btn" onClick={share} disabled={!alerts.length}>
            <Icon name="share" size={16} /> שיתוף הקובץ
          </button>
        )}
      </div>
      {__SINGLE__ && (
        <p className="fine" role="note">
          בתצוגה המקדימה הזאת הדפדפן חוסם הורדת קבצים. הכפתור יעבוד באפליקציה המותקנת (אחרי הפרסום ב־GitHub Pages).
        </p>
      )}
      {msg && (
        <p className="fine" role="status">
          {msg}
        </p>
      )}

      <details className="howto" open={done}>
        <summary>איך זה עובד בטלפון שלי?</summary>
        {isIOS || !isAndroid ? (
          <ol>
            <li>
              <b>אייפון:</b> אחרי הלחיצה ייפתח חלון עם רשימת האירועים. לוחצים "הוסף הכל" ובוחרים יומן.
            </li>
            <li>
              ההתראה מופיעה בשעה שבחרתם. אם היא לא מגיעה, בדקו ב"הגדרות ← יומן ← עדכונים" שההתראות של היומן מופעלות.
            </li>
          </ol>
        ) : null}
        {isAndroid || !isIOS ? (
          <ol>
            <li>
              <b>אנדרואיד:</b> פותחים את הקובץ שירד (shabbat-luachi.ics) באפליקציית היומן, או משתפים אותו ישירות אליה. יומן Samsung
              ורוב היומנים מייבאים אותו מיד.
            </li>
            <li>
              ב־Google Calendar, אם הקובץ לא נפתח: calendar.google.com במחשב ← הגדרות ← ייבוא. גוגל מצמיד להתראה את התזכורת
              הרגילה של היומן שלכם.
            </li>
          </ol>
        ) : null}
        <p className="fine">
          החלפתם עיר או שעה? יוצרים את הקובץ שוב, ומוחקים מהיומן את ההתראות הקודמות. כדי שיהיה קל למחוק, אפשר להוסיף אותן ליומן נפרד בשם "זמני שבת". הזמנים מחושבים לפי ההגדרות של הדלקת נרות וצאת שבת
          (כרגע: {settings.candleMins ?? city.candle} דק׳ לפני השקיעה).
        </p>
      </details>
    </Sheet>
  );
}
