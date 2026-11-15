import { useEffect, useMemo, useState } from 'react';
import { APP_NAME } from '../lib/brand';
import { CANDLE_OFFSETS, IOS_LIMIT, ZMAN_ALERTS, ZMAN_OFFSETS, planNotifications, type PlannedNotification } from '../lib/alerts';
import { WEEKDAYS_SHORT, roundTo, timeFmt, today, zmanim } from '../lib/cal';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { isNative, notificationPermission } from '../lib/native';
import { Screen } from './Screen';
import { Icon } from './Icon';
import { isHe, plural, tr } from '../lib/i18n';

interface Props {
  city: City;
  settings: Settings;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  /** the Friday-morning alert has its own screen (it also works on the web, via the phone's calendar) */
  onFriday: () => void;
  onClose: () => void;
}

const offsetLabel = (m: number) => (m === 0 ? tr('בזמן', 'On time') : tr(`${m} דק׳ לפני`, `${m} min before`));

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
          setMsg(
            tr(
              `ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון ← אפליקציות ← ${APP_NAME} ← התראות, ולנסות שוב.`,
              `Notifications are blocked. Turn them on in phone Settings → Apps → ${APP_NAME} → Notifications, then try again.`,
            ),
          );
          return;
        }
      } catch {
        setMsg(tr('לא הצלחנו לבקש הרשאה להתראות. נסו שוב.', "Couldn't ask for notification permission. Try again."));
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
    <Screen title={tr('התראות', 'Alerts')} onClose={onClose}>
      {native ? (
        <p className="lead">
          {isHe() ? (
            <>
              ההתראות מגיעות גם כשהאפליקציה סגורה. הן מחושבות לפי <b>{city.name}</b>, ומתעדכנות בכל פתיחה של האפליקציה ובכל החלפת מיקום.
            </>
          ) : (
            <>
              Alerts arrive even when the app is closed. They are calculated for <b>{city.name}</b> and update every time you open the
              app or change location.
            </>
          )}
        </p>
      ) : (
        <div className="notice" role="note">
          <Icon name="bell" size={20} />
          {isHe() ? (
            <div>
              <b>ההתראות פועלות באפליקציה המותקנת לאנדרואיד ולאייפון.</b> דפדפן לא יכול לשלוח התראה בזמן כשהאתר סגור, ולכן כאן
              רק רואים איך הן ייראו. באתר אפשר להוסיף ליומן של הטלפון התראה בכל יום שישי עם זמני השבת.
            </div>
          ) : (
            <div>
              <b>Alerts work in the installed Android and iPhone app.</b> A browser can&apos;t send an alert on time while the site is
              closed, so here you only see how they will look. On the website you can add an every-Friday alert with Shabbat times to
              your phone&apos;s calendar.
            </div>
          )}
        </div>
      )}
      {msg && (
        <p className="fine warn" role="alert">
          {msg}
        </p>
      )}

      <section className="set-sec">
        <h3>{tr('שבת, חג וצום', 'Shabbat, holidays & fasts')}</h3>
        <div className="field">
          <span>
            {tr('התראה בכל יום שישי בבוקר', 'Every Friday morning alert')}
            <small className="sub">
              {native
                ? settings.nativeAlerts
                  ? tr(`פועלת · ${settings.alertTime}`, `On · ${settings.alertTime}`)
                  : tr('כבויה', 'Off')
                : tr('דרך היומן של הטלפון', "Through your phone's calendar")}
            </small>
          </span>
          <button className="ghost-btn" onClick={onFriday}>
            <Icon name="candle" size={16} /> {tr('הגדרה', 'Set up')}
          </button>
        </div>
        <fieldset className="plain" disabled={!native}>
          <div className="za-row">
            <Switch
              id="al-candle"
              label={tr('תזכורת להדלקת נרות', 'Candle lighting reminder')}
              hint={tr('ערב שבת וערב חג', 'Erev Shabbat and Erev Yom Tov')}
              on={settings.candleAlert}
              onChange={(v) => (v ? enable(() => set({ candleAlert: true })) : set({ candleAlert: false }))}
            />
            <select
              id="al-candle-mins"
              aria-label={tr('כמה זמן לפני הדלקת הנרות', 'How long before candle lighting')}
              value={settings.candleAlertMins}
              disabled={!settings.candleAlert}
              onChange={(e) => set({ candleAlertMins: +e.target.value })}
            >
              {CANDLE_OFFSETS.map((m) => (
                <option key={m} value={m}>
                  {tr(`${m} דק׳ לפני`, `${m} min before`)}
                </option>
              ))}
            </select>
          </div>
          <Switch
            id="al-havdalah"
            label={tr('צאת השבת והחג', 'End of Shabbat & Yom Tov')}
            hint={tr('בשעת היציאה', 'At the time it ends')}
            on={settings.havdalahAlert}
            onChange={(v) => (v ? enable(() => set({ havdalahAlert: true })) : set({ havdalahAlert: false }))}
          />
          <Switch
            id="al-fast"
            label={tr('תחילת הצום וסיומו', 'Start and end of fasts')}
            hint={tr('צום שמתחיל בעלות השחר: תזכורת בערב שלפניו ב־21:00', 'A fast that starts at dawn: reminder the evening before at 21:00')}
            on={settings.fastAlerts}
            onChange={(v) => (v ? enable(() => set({ fastAlerts: true })) : set({ fastAlerts: false }))}
          />
        </fieldset>
      </section>

      <section className="set-sec">
        <h3>{tr('זמני היום', 'Zmanim')}</h3>
        <p className="fine">
          {tr(
            'בחרו זמנים, וכמה דקות לפני כל אחד תרצו לקבל התראה. השעה שליד כל זמן היא של היום.',
            "Choose zmanim, and how many minutes before each one you'd like an alert. The time next to each zman is today's.",
          )}
        </p>
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
                  hint={[z.hint, row ? fmt.format(roundTo(row.time, row.round)) : tr('אין היום', 'None today')].filter(Boolean).join(' · ')}
                  on={on}
                  onChange={(v) => (v ? enable(() => setZman(z.id, 15)) : setZman(z.id, null))}
                />
                <select id={`al-zm-${z.id}`} aria-label={tr(`כמה זמן לפני ${z.label}`, `How long before ${z.label}`)} value={mins ?? 15} disabled={!on} onChange={(e) => setZman(z.id, +e.target.value)}>
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
        <h3>{tr('האירועים שלי', 'My events')}</h3>
        <p className="fine">
          {tr(
            'לכל יום הולדת, יארצייט או אירוע אפשר לבחור תזכורת: ביום עצמו, בערב שלפניו או שבוע לפני. בוחרים אותה בעריכת האירוע.',
            'Each birthday, yahrzeit or event can have a reminder: on the day, the evening before or a week before. Choose it when editing the event.',
          )}
          {withReminders > 0 &&
            tr(
              ` כרגע יש תזכורת ל־${withReminders} אירועים.`,
              ` ${withReminders} ${plural(withReminders, 'event has', 'events have')} a reminder now.`,
            )}
        </p>
      </section>

      <section className="set-sec">
        <h3>{native ? tr('ההתראות הקרובות', 'Upcoming alerts') : tr('כך זה ייראה באפליקציה', 'How it looks in the app')}</h3>
        <Preview list={sample.slice(0, 4)} fmt={timeFmt(Intl.DateTimeFormat().resolvedOptions().timeZone)} />
        {native ? (
          isHe() ? (
            <p className="fine">
              מתוזמנות {plan.list.length} התראות. אייפון שומר עד {IOS_LIMIT} התראות לכל אפליקציה, ולכן
              {plan.zmanDays > 0 ? ` זמני היום נקבעים ל־${plan.zmanDays} ${plan.zmanDays === 1 ? 'יום' : 'ימים'} קדימה` : ' זמני היום נקבעים לימים הקרובים'}
              {plan.fridayWeeks > 0 ? `, התראת יום שישי ל־${plan.fridayWeeks} שבועות` : ''}
              {withReminders > 0 ? ', ותזכורות לאירועים לחודשיים' : ''}. כל פתיחה של האפליקציה ממשיכה את הרשימה. באנדרואיד התראה עשויה
              להגיע באיחור של כמה דקות כשהטלפון במצב חיסכון בסוללה.
            </p>
          ) : (
            <p className="fine">
              {plan.list.length} {plural(plan.list.length, 'alert', 'alerts')} scheduled. iPhone keeps up to {IOS_LIMIT} alerts per app, so
              {plan.zmanDays > 0 ? ` zmanim are set ${plan.zmanDays} ${plural(plan.zmanDays, 'day', 'days')} ahead` : ' zmanim are set for the coming days'}
              {plan.fridayWeeks > 0 ? `, the Friday alert ${plan.fridayWeeks} ${plural(plan.fridayWeeks, 'week', 'weeks')} ahead` : ''}
              {withReminders > 0 ? ', and event reminders two months ahead' : ''}. Each time you open the app the list continues. On Android
              an alert may arrive a few minutes late when the phone is in battery saver.
            </p>
          )
        ) : isHe() ? (
          <p className="fine">
            לדוגמה: סוף זמן ק״ש, שקיעה והדלקת נרות ב{city.name}. באפליקציה ההתראות נקבעות לימים הקרובים ומתחדשות בכל פתיחה (אייפון
            שומר עד {IOS_LIMIT} התראות לכל אפליקציה).
          </p>
        ) : (
          <p className="fine">
            For example: latest Shema, sunset and candle lighting in {city.name}. In the app, alerts are set for the coming days and
            renewed every time you open it (iPhone keeps up to {IOS_LIMIT} alerts per app).
          </p>
        )}
      </section>
    </Screen>
  );
}

function Preview({ list, fmt }: { list: PlannedNotification[]; fmt: Intl.DateTimeFormat }) {
  if (!list.length) return <p className="empty">{tr('עוד לא נבחרה אף התראה.', 'No alerts chosen yet.')}</p>;
  return (
    <div className="alert-preview" aria-label={tr('דוגמה להתראות הקרובות', 'Preview of upcoming alerts')}>
      {list.map((n) => (
        <div className="notif" key={n.id}>
          <div className="notif-head">
            <span className="notif-app">
              <Icon name={n.channel === 'zmanim' ? 'bell' : n.channel === 'reminders' ? 'today' : 'candle'} size={14} /> {APP_NAME}
            </span>
            <span>
              {tr('יום ', '')}
              {WEEKDAYS_SHORT[n.at.getDay()]} · {fmt.format(n.at)}
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
