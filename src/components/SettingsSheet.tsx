import { useRef, useState } from 'react';
import { CITIES, nearestCity, type City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { isNative, nativePosition, shareTextFile } from '../lib/native';

interface Props {
  settings: Settings;
  city: City;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  onImport: (list: MyEvent[]) => void;
  onNotify: () => void;
  onClose: () => void;
}

export function SettingsSheet({ settings, city, myEvents, onChange, onImport, onNotify, onClose }: Props) {
  const [q, setQ] = useState('');
  const [gpsMsg, setGpsMsg] = useState('');
  const [ioMsg, setIoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const list = q.trim() ? CITIES.filter((c) => c.name.includes(q.trim())) : CITIES;

  const applyPosition = (lat: number, lon: number, altitude: number | null | undefined) => {
    const near = nearestCity(lat, lon);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || near.city.tz;
    const il = tz === 'Asia/Jerusalem';
    const name = near.km < 15 ? near.city.name : `המיקום שלי (ליד ${near.city.name})`;
    const gps: City = {
      id: 'gps',
      name,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      tz,
      elev: altitude && altitude > 0 ? Math.round(altitude) : near.km < 15 ? near.city.elev : 0,
      candle: near.km < 15 ? near.city.candle : il ? 20 : 18,
      il,
    };
    set({ gps });
    setGpsMsg(`נמצא: ${name}`);
  };
  const denied = 'לא התקבלה הרשאה למיקום. אפשר לאשר מיקום בהגדרות, או לבחור עיר מהרשימה.';

  const locate = () => {
    setGpsMsg('מאתר מיקום…');
    if (isNative()) {
      nativePosition()
        .then((c) => applyPosition(c.latitude, c.longitude, c.altitude))
        .catch(() => setGpsMsg(denied));
      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsMsg('המכשיר לא תומך באיתור מיקום. בחרו עיר מהרשימה.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude),
      () => setGpsMsg(denied),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

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
    <Sheet title="הגדרות" onClose={onClose} wide>
      <section className="set-sec">
        <h3>מיקום</h3>
        <p className="fine">
          כרגע: <b>{city.name}</b> · {city.lat.toFixed(3)}, {city.lon.toFixed(3)} · גובה {city.elev} מ׳
        </p>
        <div className="row-btns">
          <button className="ghost-btn" onClick={locate}>
            <Icon name="locate" size={16} /> איתור לפי GPS
          </button>
          {settings.gps && (
            <button className="ghost-btn" onClick={() => set({ gps: null })}>
              חזרה לעיר מהרשימה
            </button>
          )}
        </div>
        {gpsMsg && <p className="fine" role="status">{gpsMsg}</p>}
        <label className="search">
          <Icon name="search" size={18} />
          <input id="city-search" type="search" placeholder="חיפוש עיר…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="city-list">
          {list.map((c) => (
            <button key={c.id} className={!settings.gps && settings.cityId === c.id ? 'on' : ''} onClick={() => set({ cityId: c.id, gps: null })}>
              {c.name}
              {!c.il && <small> · חו״ל</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="set-sec">
        <h3>שבת וחג</h3>
        <label className="field">
          <span>הדלקת נרות</span>
          <select id="set-candle" value={settings.candleMins ?? ''} onChange={(e) => set({ candleMins: e.target.value === '' ? null : +e.target.value })}>
            <option value="">לפי מנהג העיר ({city.candle} דק׳)</option>
            {[15, 18, 20, 22, 24, 30, 40].map((m) => (
              <option key={m} value={m}>
                {m} דקות לפני השקיעה
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
        <button className="ghost-btn" onClick={onNotify}>
          <Icon name="bell" size={16} /> התראה בכל יום שישי עם זמני השבת
        </button>
      </section>

      <section className="set-sec">
        <h3>תצוגה</h3>
        <Toggle id="set-elev" label="חישוב זריחה ושקיעה לפי גובה המקום" on={settings.useElevation} onChange={(v) => set({ useElevation: v })} />
        <Toggle id="set-learn" label="הצגת לימוד יומי (דף יומי, משנה, רמב״ם…)" on={settings.showLearning} onChange={(v) => set({ showLearning: v })} />
        <Toggle id="set-modern" label="הצגת ימי זיכרון ומועדים ממלכתיים" on={settings.showModern} onChange={(v) => set({ showModern: v })} />
        <div className="field">
          <span>ערכת צבעים</span>
          <div className="seg small">
            {(
              [
                ['auto', 'אוטומטי'],
                ['light', 'בהיר'],
                ['dark', 'כהה'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={settings.theme === k ? 'on' : ''} onClick={() => set({ theme: k })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="set-sec">
        <h3>גיבוי האירועים שלי</h3>
        <p className="fine">האירועים נשמרים רק במכשיר הזה. כדאי לייצא גיבוי מדי פעם, ולייבא אותו במכשיר חדש.</p>
        <div className="row-btns">
          <button className="ghost-btn" onClick={exportEvents}>
            <Icon name="download" size={16} /> ייצוא ({myEvents.length})
          </button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> ייבוא מקובץ
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
        {ioMsg && <p className="fine" role="status">{ioMsg}</p>}
      </section>
      <section className="set-sec sources">
        <h3>דיוק ומקורות</h3>
        <ul>
          <li>
            <b>זמני היום</b> מחושבים בספריית <b>KosherJava</b>, מנוע הזמנים שרוב אפליקציות הזמנים בנויות עליו.
          </li>
          <li>
            <b>לוח השנה</b>: תאריכים עבריים, חגים, פרשות, הדלקת נרות וצאת שבת מחושבים בספריית <b>Hebcal</b>.
          </li>
          <li>
            <b>בדיקה צולבת</b>: כל זמן, בכל עיר ובכל יום בשנה, נבדק מול הספרייה השנייה. ההפרש הגדול ביותר שנמצא: שנייה אחת. התאריכים העבריים בין 1950 ל־2100 זהים לחלוטין.
          </li>
          <li>
            <b>מיקום הערים</b> לקוח ממאגר GeoNames, אותו מאגר ש־Hebcal משתמש בו.
          </li>
          <li>
            <b>שיטות</b>: עלות השחר 16.1°, משיכיר 11.5°, מגן אברהם 72 דקות, צאת הכוכבים 8.5°, רבנו תם 72 דקות. חצות היום היא הרגע שבו השמש עוברת בקו האורך של המקום.
          </li>
          <li>
            <b>עיגול</b>: סוף זמן מעוגל לדקה שלפניו, תחילת זמן לדקה שאחריה.
          </li>
          <li>
            לוחות שמחשבים נץ ושקיעה <b>הנראים</b> לפי תוואי ההרים סביב העיר עשויים להראות הפרש של דקה או שתיים בזריחה ובשקיעה. החישוב כאן הוא לפי האופק המישורי, כמקובל ברוב הלוחות.
          </li>
        </ul>
      </section>
      <p className="fine about">הכול מחושב במכשיר עצמו, גם בלי אינטרנט. אין פרסומות ואין מעקב.</p>
    </Sheet>
  );
}

function Toggle({ id, label, on, onChange }: { id: string; label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
