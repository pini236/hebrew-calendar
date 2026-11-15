import { useMemo, useState } from 'react';
import { APP_NAME } from '../lib/brand';
import { WEEKDAYS, gregDateStr, today } from '../lib/cal';
import type { City } from '../lib/cities';
import { alertText, buildShabbatIcs, shabbatAlerts } from '../lib/ics';
import type { Settings } from '../lib/store';
import { Screen } from './Screen';
import { Icon } from './Icon';
import { cancelGroups, isNative, notificationPermission } from '../lib/native';
import { isHe, tr } from '../lib/i18n';

interface Props {
  city: City;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

declare const __SINGLE__: boolean;

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent + (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent) ? 'iPad' : ''));
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export function NotifyScreen(props: Props) {
  return isNative() ? <NativeNotify {...props} /> : <WebNotify {...props} />;
}

/** Android / iOS app: real local notifications, rescheduled every time the app opens */
function NativeNotify({ city, settings, onChange, onClose }: Props) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const alerts = useMemo(
    () => shabbatAlerts(today(), 4, city, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city, settings.candleMins, settings.havdalah, settings.useElevation],
  );
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const toggle = async (on: boolean) => {
    setBusy(true);
    setMsg('');
    try {
      if (on) {
        const p = await notificationPermission(true);
        if (p !== 'granted') {
          setMsg(
            tr(
              `ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון ← אפליקציות ← ${APP_NAME} ← התראות, ולנסות שוב.`,
              `Notifications are blocked. Turn them on in phone Settings → Apps → ${APP_NAME} → Notifications, then try again.`,
            ),
          );
          return;
        }
        set({ nativeAlerts: true });
        setMsg(tr('מופעל. ההתראות מתעדכנות אוטומטית בכל פתיחה של האפליקציה, גם אם תחליפו עיר.', 'On. The alerts update automatically every time you open the app, even if you change city.'));
      } else {
        await cancelGroups(['friday']);
        set({ nativeAlerts: false });
        setMsg(tr('ההתראות כובו.', 'Alerts turned off.'));
      }
    } catch {
      setMsg(tr('לא הצלחנו לעדכן את ההתראות. נסו שוב.', "Couldn't update the alerts. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={tr('התראה בכל יום שישי', 'Every Friday alert')} onClose={onClose}>
      <label className="toggle big" htmlFor="native-alerts">
        <span>{tr('התראה בכל יום שישי', 'Every Friday alert')}</span>
        <input id="native-alerts" type="checkbox" checked={settings.nativeAlerts} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <i aria-hidden="true" />
      </label>
      <label className="field">
        <span>{tr('שעת ההתראה', 'Alert time')}</span>
        <input id="alert-time" type="time" value={settings.alertTime} onChange={(e) => e.target.value && set({ alertTime: e.target.value })} />
      </label>
      <Preview alerts={alerts} city={city} time={settings.alertTime} />
      {msg && (
        <p className="fine" role="status">
          {msg}
        </p>
      )}
    </Screen>
  );
}

function Preview({ alerts, city, time }: { alerts: ReturnType<typeof shabbatAlerts>; city: City; time: string }) {
  return (
    <div className="alert-preview" aria-label={tr('דוגמה להתראות הקרובות', 'Preview of upcoming alerts')}>
      {alerts.slice(0, 3).map((a) => {
        const t = alertText(a, city);
        return (
          <div className="notif" key={a.friday.getTime()}>
            <div className="notif-head">
              <span className="notif-app">
                <Icon name="candle" size={14} /> {APP_NAME}
              </span>
              <span>
                {tr('יום ', '')}
                {WEEKDAYS[5]}, {gregDateStr(a.friday, false)} · {time}
              </span>
            </div>
            <div className="notif-body">{t.summary.replace(/^🕯️\s*/, '')}</div>
          </div>
        );
      })}
      {alerts.length === 0 && <p className="empty">{tr('לא נמצאו זמני שבת לטווח הזה.', 'No Shabbat times found for this range.')}</p>}
    </div>
  );
}

/** Website / PWA: add the alerts to the phone's calendar with an .ics file */
function WebNotify({ city, settings, onChange, onClose }: Props) {
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
    return new File([ics], 'shabbat-times.ics', { type: 'text/calendar' });
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
      setMsg(tr(`נוצר קובץ עם ${alerts.length} התראות שבת.`, `Created a file with ${alerts.length} Shabbat ${alerts.length === 1 ? 'alert' : 'alerts'}.`));
    } catch {
      setMsg(tr('לא הצלחנו ליצור את הקובץ במכשיר הזה. נסו "שיתוף הקובץ".', 'Couldn\'t create the file on this device. Try "Share file".'));
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
      await navigator.share({ files: [makeFile()], title: tr(`זמני שבת — ${APP_NAME}`, `Shabbat times — ${APP_NAME}`) });
      setDone(true);
      setMsg(tr('שותף. בחרו באפליקציית היומן כדי להוסיף את ההתראות.', 'Shared. Choose your calendar app to add the alerts.'));
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setMsg(tr('השיתוף לא הצליח במכשיר הזה. נסו "הוספה ליומן".', 'Sharing didn\'t work on this device. Try "Add to calendar".'));
    }
  };

  const preview = alerts.slice(0, 3);

  return (
    <Screen title={tr('התראה בכל יום שישי', 'Every Friday alert')} onClose={onClose}>

      <div className="two">
        <label className="field col">
          <span>{tr('שעת ההתראה ביום שישי', 'Friday alert time')}</span>
          <input id="alert-time" type="time" value={settings.alertTime} onChange={(e) => e.target.value && set({ alertTime: e.target.value })} />
        </label>
        <label className="field col">
          <span>{tr('לכמה זמן קדימה', 'How far ahead')}</span>
          <select id="alert-weeks" value={settings.alertWeeks} onChange={(e) => set({ alertWeeks: +e.target.value })}>
            <option value={13}>{tr('3 חודשים', '3 months')}</option>
            <option value={26}>{tr('חצי שנה', '6 months')}</option>
            <option value={52}>{tr('שנה', '1 year')}</option>
            <option value={104}>{tr('שנתיים', '2 years')}</option>
          </select>
        </label>
      </div>

      <div className="alert-preview" aria-label={tr('דוגמה להתראות הקרובות', 'Preview of upcoming alerts')}>
        {preview.map((a) => {
          const t = alertText(a, city);
          return (
            <div className="notif" key={a.friday.getTime()}>
              <div className="notif-head">
                <span className="notif-app">
                  <Icon name="candle" size={14} /> {tr('יומן', 'Calendar')}
                </span>
                <span>
                  {tr('יום ', '')}
                  {WEEKDAYS[5]}, {gregDateStr(a.friday, false)} · {settings.alertTime}
                </span>
              </div>
              <div className="notif-body">{t.summary.replace(/^🕯️\s*/, '')}</div>
            </div>
          );
        })}
        {alerts.length === 0 && <p className="empty">{tr('לא נמצאו זמני שבת לטווח הזה.', 'No Shabbat times found for this range.')}</p>}
      </div>

      <div className="row-btns">
        <button className="primary" onClick={addToCalendar} disabled={!alerts.length}>
          <Icon name="today" size={18} /> {tr(`הוספה ליומן (${alerts.length} שבתות)`, `Add to calendar (${alerts.length} ${alerts.length === 1 ? 'week' : 'weeks'})`)}
        </button>
        {canShare && (
          <button className="ghost-btn" onClick={share} disabled={!alerts.length}>
            <Icon name="share" size={16} /> {tr('שיתוף הקובץ', 'Share file')}
          </button>
        )}
      </div>
      {__SINGLE__ && (
        <p className="fine" role="note">
          {tr(
            'בתצוגה המקדימה הזאת הדפדפן חוסם הורדת קבצים. הכפתור יעבוד באפליקציה המותקנת (אחרי הפרסום ב־GitHub Pages).',
            'This preview blocks file downloads. The button works in the installed app (after publishing to GitHub Pages).',
          )}
        </p>
      )}
      {msg && (
        <p className="fine" role="status">
          {msg}
        </p>
      )}

      <details className="howto" open={done}>
        {isHe() ? (
          <>
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
                  <b>אנדרואיד:</b> פותחים את הקובץ שירד (shabbat-times.ics) באפליקציית היומן, או משתפים אותו ישירות אליה. יומן Samsung
                  ורוב היומנים מייבאים אותו מיד.
                </li>
                <li>
                  ב־Google Calendar, אם הקובץ לא נפתח: calendar.google.com במחשב ← הגדרות ← ייבוא. גוגל מצמיד להתראה את התזכורת
                  הרגילה של היומן שלכם.
                </li>
              </ol>
            ) : null}
          </>
        ) : (
          <>
            <summary>How does it work on my phone?</summary>
            {isIOS || !isAndroid ? (
              <ol>
                <li>
                  <b>iPhone:</b> after you tap, a window opens with the list of events. Tap &quot;Add All&quot; and choose a calendar.
                </li>
                <li>
                  The alert shows up at the time you chose. If it doesn&apos;t, check in Settings → Calendar that calendar alerts are on.
                </li>
              </ol>
            ) : null}
            {isAndroid || !isIOS ? (
              <ol>
                <li>
                  <b>Android:</b> open the downloaded file (shabbat-times.ics) in your calendar app, or share it straight to it. Samsung
                  Calendar and most calendars import it right away.
                </li>
                <li>
                  In Google Calendar, if the file doesn&apos;t open: calendar.google.com on a computer → Settings → Import. Google adds your
                  calendar&apos;s usual reminder to the alert.
                </li>
              </ol>
            ) : null}
          </>
        )}
      </details>
    </Screen>
  );
}
