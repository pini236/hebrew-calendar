import { useEffect, useMemo, useState } from 'react';
import { APP_NAME } from '../lib/brand';
import { CANDLE_OFFSETS, IOS_LIMIT, ZMAN_ALERTS, ZMAN_OFFSETS, planNotifications, type PlannedNotification } from '../lib/alerts';
import { WEEKDAYS_SHORT, roundTo, timeFmt, today, zmanim } from '../lib/cal';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { isNative, notificationPermission } from '../lib/native';
import { Screen } from './Screen';
import { Icon } from './Icon';

interface Props {
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  /** the Friday-morning alert has its own screen (it also works on the web, via the phone's calendar) */
  onFriday: () => void;
  onClose: () => void;
}

const offsetLabel = (m: number) => (m === 0 ? 'בזמן' : `${m} דק׳ לפני`);

export function AlertsScreen({ city, settings, myEvents, onChange, onFriday, onClose, focus }: Props & { focus?: string }) {
  // opened from a zman's bell: bring that zman's row into view
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`al-z-${focus}`)?.closest('.za-row');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('focus');
  }, [focus]);
  const native = isNative();
  const [msg, setMsg] = useState('');
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  /** switching anything on asks for notification permission first (native apps only) */
  const enable = async (apply: () => void) => {
    setMsg('');
    if (native) {
      try {
        const p = await notificationPermission(true);
        if (p !== 'granted') {
          setMsg(`ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון ← אפליקציות ← ${APP_NAME} ← התראות, ולנסות שוב.`);
          return;
        }
      } catch {
        setMsg('לא הצלחנו לבקש הרשאה להתראות. נסו שוב.');
        return;
      }
    }
    apply();
  };

  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayRows = useMemo(() => zmanim(today(), city, settings).rows, [city, settings.useElevation]);
  const plan = useMemo(
    () => planNotifications({ now: new Date(), city, settings, events: myEvents }),
    [city, settings, myEvents],
  );
  // on the website nothing can be switched on, so show what a typical choice would look like
  const sample = useMemo(
    () =>
      native || plan.list.length
        ? plan.list
        : planNotifications({ now: new Date(), city, settings: { ...settings, zmanAlerts: { shma: 15, sunset: 0 }, candleAlert: true, havdalahAlert: true }, events: [] }).list,
    [native, plan, city, settings],
  );
  const withReminders = myEvents.filter((e) => e.remind && e.remind !== 'none').length;

  const setZman = (id: string, mins: number | null) => {
    const next = { ...settings.zmanAlerts };
    if (mins === null) delete next[id];
    else next[id] = mins;
    set({ zmanAlerts: next });
  };

  return (
    <Screen title="התראות" onClose={onClose}>
      {native ? (
        <p className="lead">
          ההתראות מגיעות גם כשהאפליקציה סגורה. הן מחושבות לפי <b>{city.name}</b>, ומתעדכנות בכל פתיחה של האפליקציה ובכל החלפת מיקום.
        </p>
      ) : (
        <div className="notice" role="note">
          <Icon name="bell" size={20} />
          <div>
            <b>ההתראות פועלות באפליקציה המותקנת לאנדרואיד ולאייפון.</b> דפדפן לא יכול לשלוח התראה בזמן כשהאתר סגור, ולכן כאן
            רק רואים איך הן ייראו. באתר אפשר להוסיף ליומן של הטלפון התראה בכל יום שישי עם זמני השבת.
          </div>
        </div>
      )}
      {msg && (
        <p className="fine warn" role="alert">
          {msg}
        </p>
      )}

      <section className="set-sec">
        <h3>שבת, חג וצום</h3>
        <div className="field">
          <span>
            התראה בכל יום שישי בבוקר
            <small className="sub">{native ? (settings.nativeAlerts ? `פועלת · ${settings.alertTime}` : 'כבויה') : 'דרך היומן של הטלפון'}</small>
          </span>
          <button className="ghost-btn" onClick={onFriday}>
            <Icon name="candle" size={16} /> הגדרה
          </button>
        </div>
        <fieldset className="plain" disabled={!native}>
          <div className="za-row">
            <Switch
              id="al-candle"
              label="תזכורת להדלקת נרות"
              hint="ערב שבת וערב חג"
              on={settings.candleAlert}
              onChange={(v) => (v ? enable(() => set({ candleAlert: true })) : set({ candleAlert: false }))}
            />
            <select
              id="al-candle-mins"
              aria-label="כמה זמן לפני הדלקת הנרות"
              value={settings.candleAlertMins}
              disabled={!settings.candleAlert}
              onChange={(e) => set({ candleAlertMins: +e.target.value })}
            >
              {CANDLE_OFFSETS.map((m) => (
                <option key={m} value={m}>
                  {m} דק׳ לפני
                </option>
              ))}
            </select>
          </div>
          <Switch
            id="al-havdalah"
            label="צאת השבת והחג"
            hint="בשעת היציאה"
            on={settings.havdalahAlert}
            onChange={(v) => (v ? enable(() => set({ havdalahAlert: true })) : set({ havdalahAlert: false }))}
          />
          <Switch
            id="al-fast"
            label="תחילת הצום וסיומו"
            hint="צום שמתחיל בעלות השחר: תזכורת בערב שלפניו ב־21:00"
            on={settings.fastAlerts}
            onChange={(v) => (v ? enable(() => set({ fastAlerts: true })) : set({ fastAlerts: false }))}
          />
        </fieldset>
      </section>

      <section className="set-sec">
        <h3>זמני היום</h3>
        <p className="fine">בחרו זמנים, וכמה דקות לפני כל אחד תרצו לקבל התראה. השעה שליד כל זמן היא של היום.</p>
        <fieldset className="plain" disabled={!native}>
          {ZMAN_ALERTS.map((z) => {
            const mins = settings.zmanAlerts[z.id];
            const on = mins !== undefined;
            const row = todayRows.find((r) => r.id === z.id);
            return (
              <div className="za-row" key={z.id}>
                <Switch
                  id={`al-z-${z.id}`}
                  label={z.label}
                  hint={[z.hint, row ? fmt.format(roundTo(row.time, row.round)) : 'אין היום'].filter(Boolean).join(' · ')}
                  on={on}
                  onChange={(v) => (v ? enable(() => setZman(z.id, 15)) : setZman(z.id, null))}
                />
                <select id={`al-zm-${z.id}`} aria-label={`כמה זמן לפני ${z.label}`} value={mins ?? 15} disabled={!on} onChange={(e) => setZman(z.id, +e.target.value)}>
                  {ZMAN_OFFSETS.map((m) => (
                    <option key={m} value={m}>
                      {offsetLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </fieldset>
      </section>

      <section className="set-sec">
        <h3>האירועים שלי</h3>
        <p className="fine">
          לכל יום הולדת, יארצייט או אירוע אפשר לבחור תזכורת: ביום עצמו, בערב שלפניו או שבוע לפני. בוחרים אותה בעריכת האירוע.
          {withReminders > 0 && ` כרגע יש תזכורת ל־${withReminders} אירועים.`}
        </p>
      </section>

      <section className="set-sec">
        <h3>{native ? 'ההתראות הקרובות' : 'כך זה ייראה באפליקציה'}</h3>
        <Preview list={sample.slice(0, 4)} fmt={timeFmt(Intl.DateTimeFormat().resolvedOptions().timeZone)} />
        {native ? (
          <p className="fine">
            מתוזמנות {plan.list.length} התראות. אייפון שומר עד {IOS_LIMIT} התראות לכל אפליקציה, ולכן
            {plan.zmanDays > 0 ? ` זמני היום נקבעים ל־${plan.zmanDays} ${plan.zmanDays === 1 ? 'יום' : 'ימים'} קדימה` : ' זמני היום נקבעים לימים הקרובים'}
            {plan.fridayWeeks > 0 ? `, התראת יום שישי ל־${plan.fridayWeeks} שבועות` : ''}
            {withReminders > 0 ? ', ותזכורות לאירועים לחודשיים' : ''}. כל פתיחה של האפליקציה ממשיכה את הרשימה. באנדרואיד התראה עשויה
            להגיע באיחור של כמה דקות כשהטלפון במצב חיסכון בסוללה.
          </p>
        ) : (
          <p className="fine">
            לדוגמה: סוף זמן ק״ש, שקיעה והדלקת נרות ב{city.name}. באפליקציה ההתראות נקבעות לימים הקרובים ומתחדשות בכל פתיחה (אייפון
            שומר עד {IOS_LIMIT} התראות לכל אפליקציה).
          </p>
        )}
      </section>
    </Screen>
  );
}

function Preview({ list, fmt }: { list: PlannedNotification[]; fmt: Intl.DateTimeFormat }) {
  if (!list.length) return <p className="empty">עוד לא נבחרה אף התראה.</p>;
  return (
    <div className="alert-preview" aria-label="דוגמה להתראות הקרובות">
      {list.map((n) => (
        <div className="notif" key={n.id}>
          <div className="notif-head">
            <span className="notif-app">
              <Icon name={n.channel === 'zmanim' ? 'bell' : n.channel === 'reminders' ? 'today' : 'candle'} size={14} /> {APP_NAME}
            </span>
            <span>
              יום {WEEKDAYS_SHORT[n.at.getDay()]} · {fmt.format(n.at)}
            </span>
          </div>
          <div className="notif-body">{n.title}</div>
          <div className="notif-text">{n.body}</div>
        </div>
      ))}
    </div>
  );
}

function Switch({ id, label, hint, on, onChange }: { id: string; label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        {label}
        {hint && <small className="sub">{hint}</small>}
      </span>
      <input id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
