import { useRef, useState } from 'react';
import { CITIES, nearestCity, type City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

interface Props {
  settings: Settings;
  city: City;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  onImport: (list: MyEvent[]) => void;
  onClose: () => void;
}

export function SettingsSheet({ settings, city, myEvents, onChange, onImport, onClose }: Props) {
  const [q, setQ] = useState('');
  const [gpsMsg, setGpsMsg] = useState('');
  const [ioMsg, setIoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });

  const list = q.trim() ? CITIES.filter((c) => c.name.includes(q.trim())) : CITIES;

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGpsMsg('המכשיר לא תומך באיתור מיקום. בחרו עיר מהרשימה.');
      return;
    }
    setGpsMsg('מאתר מיקום…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, altitude } = pos.coords;
        const near = nearestCity(lat, lon);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || near.city.tz;
        const il = tz === 'Asia/Jerusalem';
        const name = near.km < 15 ? near.city.name : `המיקום שלי (ליד ${near.city.name})`;
        const gps: City = {
          id: 'gps',
          name,
          lat: +lat.toFixed(4),
          lon: +lon.toFixed(4),
          tz,
          elev: altitude && altitude > 0 ? Math.round(altitude) : near.km < 15 ? near.city.elev : 0,
          candle: near.km < 15 ? near.city.candle : il ? 20 : 18,
          il,
        };
        set({ gps });
        setGpsMsg(`נמצא: ${name}`);
      },
      () => setGpsMsg('לא התקבלה הרשאה למיקום. אפשר לאשר מיקום בהגדרות הדפדפן, או לבחור עיר מהרשימה.'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const exportEvents = async () => {
    const data = JSON.stringify({ app: 'luach', version: 1, events: myEvents }, null, 2);
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
      <p className="fine about">הזמנים מחושבים במכשיר עצמו (ללא אינטרנט) לפי הספרייה הפתוחה Hebcal. אין פרסומות, אין מעקב.</p>
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
