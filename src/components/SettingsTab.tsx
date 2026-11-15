import { useRef, useState } from 'react';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { BrandMark, Icon } from './Icon';
import { APP_NAME } from '../lib/brand';
import { isNative, shareTextFile } from '../lib/native';

interface Props {
  settings: Settings;
  city: City;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  onImport: (list: MyEvent[]) => void;
  onNotify: () => void;
  onAlerts: () => void;
  onLocation: () => void;
}

export function SettingsTab({ settings, city, myEvents, onChange, onImport, onNotify, onAlerts, onLocation }: Props) {
  const [ioMsg, setIoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const exportEvents = async () => {
    const data = JSON.stringify({ app: 'luach', version: 1, events: myEvents }, null, 2);
    if (isNative()) {
      try {
        await shareTextFile('luach-ivri-backup.json', data, 'גיבוי האירועים שלי');
        setIoMsg(`נשמרו ${myEvents.length} אירועים. שמרו את הקובץ בדרייב, במייל או בוואטסאפ.`);
      } catch {
        setIoMsg('הייצוא בוטל.');
      }
      return;
    }
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'luach-events.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setIoMsg(`יוצאו ${myEvents.length} אירועים לקובץ.`);
    } catch {
      setIoMsg('הייצוא נכשל.');
    }
  };

  const importEvents = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const evs: MyEvent[] = Array.isArray(j) ? j : j.events;
      if (!Array.isArray(evs)) throw new Error();
      const ok = evs.filter((e) => e && typeof e.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
      onImport(ok);
      setIoMsg(`יובאו ${ok.length} אירועים.`);
    } catch {
      setIoMsg('הקובץ לא נקרא. בחרו קובץ גיבוי שנוצר בייצוא מהאפליקציה.');
    }
  };

  return (
    <div className="tab settings-tab">
      <header className="tab-head">
        <h1 className="tab-title">הגדרות</h1>
      </header>

      <div className="settings-cols">
        <div>
          <section className="set-group" aria-labelledby="sg-place">
            <h3 className="group-label" id="sg-place">מיקום</h3>
            <ul className="list card-list">
              <li>
                <button className="link-row" onClick={onLocation}>
                  <Icon name={city.id === 'gps' ? 'locate' : 'pin'} size={18} />
                  <span>
                    {city.name}
                    <small>
            {city.id === 'gps' ? 'לפי GPS · ' : ''}
                      <bdi dir="ltr">
                        {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
                      </bdi>
                      {city.elev ? ` · גובה ${city.elev} מ׳` : ''}
                    </small>
                  </span>
                  <span className="row-val">שינוי</span>
                </button>
              </li>
            </ul>
          </section>

          <section className="set-group" aria-labelledby="sg-alerts">
            <h3 className="group-label" id="sg-alerts">התראות</h3>
            <ul className="list card-list">
              <li>
                <button className="link-row" onClick={onAlerts}>
                  <Icon name="bell" size={18} />
                  <span>
                    התראות לזמנים, לשבת ולחג
                    <small>{isNative() ? 'לפני כל זמן שתבחרו, הדלקת נרות, צאת שבת וצומות' : 'פועלות באפליקציה לאנדרואיד ולאייפון'}</small>
                  </span>
                  <Icon name="next" size={16} />
                </button>
              </li>
              <li>
                <button className="link-row" onClick={onNotify}>
                  <Icon name="candle" size={18} />
                  <span>
                    התראה בכל יום שישי
                    <small>עם שעת כניסת השבת ויציאתה</small>
                  </span>
                  <Icon name="next" size={16} />
                </button>
              </li>
            </ul>
          </section>

          <section className="set-group" aria-labelledby="sg-shabbat">
            <h3 className="group-label" id="sg-shabbat">שבת וחג</h3>
            <div className="card-list form-list">
              <label className="field">
                <span>הדלקת נרות</span>
                <select id="set-candle" value={settings.candleMins ?? ''} onChange={(e) => set({ candleMins: e.target.value === '' ? null : +e.target.value })}>
                  <option value="">מנהג העיר ({city.candle} דק׳)</option>
                  {[15, 18, 20, 22, 24, 30, 40].map((m) => (
                    <option key={m} value={m}>
                      {m} דק׳ לפני השקיעה
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>צאת שבת</span>
                <select id="set-havdalah" value={settings.havdalah} onChange={(e) => set({ havdalah: e.target.value as Settings['havdalah'] })}>
                  <option value="deg8.5">צאת הכוכבים (8.5°)</option>
                  <option value="min42">42 דקות אחרי השקיעה</option>
                  <option value="min50">50 דקות אחרי השקיעה</option>
                  <option value="min72">רבנו תם (72 דקות)</option>
                </select>
              </label>
            </div>
          </section>

          <section className="set-group" aria-labelledby="sg-cal">
            <h3 className="group-label" id="sg-cal">לוח וזמנים</h3>
            <div className="card-list form-list">
              <Toggle id="set-elev" label="זריחה ושקיעה לפי גובה המקום" sub="ברירת המחדל: גובה פני הים" on={settings.useElevation} onChange={(v) => set({ useElevation: v })} />
              <Toggle id="set-learn" label="לימוד יומי" sub="דף יומי, משנה, נ״ך, רמב״ם, תהילים וחפץ חיים" on={settings.showLearning} onChange={(v) => set({ showLearning: v })} />
              <Toggle id="set-modern" label="ימי זיכרון ומועדים ממלכתיים" on={settings.showModern} onChange={(v) => set({ showModern: v })} />
            </div>
          </section>
        </div>

        <div>
          <section className="set-group" aria-labelledby="sg-look">
            <h3 className="group-label" id="sg-look">תצוגה וקריאות</h3>
            <div className="card-list form-list">
              <div className="field stack">
                <span id="lbl-text-size">גודל טקסט</span>
                <div className="seg" role="group" aria-labelledby="lbl-text-size">
                  {(
                    [
                      ['normal', 'רגיל'],
                      ['large', 'גדול'],
                      ['xlarge', 'גדול מאוד'],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} className={settings.textSize === k ? 'on' : ''} aria-pressed={settings.textSize === k} onClick={() => set({ textSize: k })}>
                      {l}
                    </button>
                  ))}
                </div>
                <small className="sub">"רגיל" הולך לפי גודל הגופן שבהגדרות הטלפון</small>
              </div>
              <div className="field stack">
                <span id="lbl-theme">ערכת צבעים</span>
                <div className="seg" role="group" aria-labelledby="lbl-theme">
                  {(
                    [
                      ['auto', 'כמו הטלפון'],
                      ['light', 'בהירה'],
                      ['dark', 'כהה'],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} className={settings.theme === k ? 'on' : ''} aria-pressed={settings.theme === k} onClick={() => set({ theme: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle id="set-contrast" label="ניגודיות גבוהה" sub="טקסט וקווים כהים יותר" on={settings.highContrast} onChange={(v) => set({ highContrast: v })} />
            </div>
          </section>

          <section className="set-group" aria-labelledby="sg-backup" id="backup">
            <h3 className="group-label" id="sg-backup">גיבוי האירועים שלי</h3>
            <div className="card-list form-list">
              <p className="fine">האירועים נשמרים רק במכשיר הזה. כדאי לייצא גיבוי מדי פעם, ולייבא אותו במכשיר חדש.</p>
              <div className="row-btns">
                <button className="btn" onClick={exportEvents}>
                  <Icon name="download" size={18} /> ייצוא ({myEvents.length})
                </button>
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={18} /> ייבוא מקובץ
                </button>
                <input
                  ref={fileRef}
                  id="import-file"
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importEvents(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {ioMsg && (
                <p className="fine" role="status">
                  {ioMsg}
                </p>
              )}
            </div>
          </section>

          <section className="set-group" aria-labelledby="sg-src">
            <h3 className="group-label" id="sg-src">דיוק ומקורות</h3>
            <div className="card-list sources">
              <ul>
                <li>
                  <b>זמני היום</b> מחושבים בספריית KosherJava, מנוע הזמנים שרוב אפליקציות הזמנים בנויות עליו.
                </li>
                <li>
                  <b>לוח השנה</b>: תאריכים עבריים, חגים, פרשות, הדלקת נרות וצאת שבת, בספריית Hebcal.
                </li>
                <li>
                  <b>בדיקה צולבת</b>: כל זמן, בכל עיר ובכל יום בשנה, נבדק מול הספרייה השנייה. ההפרש הגדול ביותר: שנייה אחת. התאריכים העבריים בין 1950 ל־2100 זהים לחלוטין.
                </li>
                <li>
                  <b>מיקום הערים</b> ממאגר GeoNames, אותו מאגר ש־Hebcal משתמש בו.
                </li>
              </ul>
            </div>
          </section>

          <div className="about">
            <BrandMark size={40} />
            <div>
              <b>{APP_NAME}</b>
              <p className="fine">הכול מחושב במכשיר עצמו, גם בלי אינטרנט. אין פרסומות ואין מעקב.</p>
              <p className="fine keys">
                מקלדת: <kbd>←</kbd> <kbd>→</kbd> ימים · <kbd>PgUp</kbd> <kbd>PgDn</kbd> חודשים · <kbd>T</kbd> היום · <kbd>G</kbd> מעבר לתאריך · <kbd>1</kbd>–<kbd>5</kbd> לשוניות
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ id, label, sub, on, onChange }: { id: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        {label}
        {sub && <small className="sub">{sub}</small>}
      </span>
      <input id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
