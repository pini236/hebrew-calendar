import { useEffect, useMemo, useState } from 'react';
import { CITIES, nearestCity, type City } from '../lib/cities';
import { loadPlaces, nearestPlace, placeSub, placeToCity, searchPlaces, type PlaceDB } from '../lib/places';
import type { Settings } from '../lib/store';
import { isNative, nativePosition } from '../lib/native';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

interface Props {
  settings: Settings;
  city: City;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

/** Settings after choosing a place: built-in cities by id, others as a full City; remembered in "recent" */
export function choosePlace(settings: Settings, c: City): Settings {
  const recentPlaces = [c, ...settings.recentPlaces.filter((r) => r.id !== c.id)].slice(0, 5);
  const builtIn = CITIES.some((x) => x.id === c.id);
  return builtIn ? { ...settings, cityId: c.id, gps: null, place: null, recentPlaces } : { ...settings, place: c, gps: null, recentPlaces };
}

export function LocationSheet({ settings, city, onChange, onClose }: Props) {
  const [q, setQ] = useState('');
  const [db, setDb] = useState<PlaceDB | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  // the worldwide list is loaded only now, when this screen opens
  useEffect(() => {
    let live = true;
    loadPlaces()
      .then((d) => live && setDb(d))
      .catch(() => live && setLoadErr(true));
    return () => {
      live = false;
    };
  }, []);

  const hits = useMemo(() => searchPlaces(db, q), [db, q]);
  const pick = (c: City) => {
    onChange(choosePlace(settings, c));
    onClose();
  };

  const applyPosition = async (lat: number, lon: number, altitude: number | null | undefined) => {
    const near = nearestCity(lat, lon);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || near.city.tz;
    const il = tz === 'Asia/Jerusalem';
    let name = near.km < 15 ? near.city.name : '';
    if (!name) {
      // not next to one of the Hebrew-named cities: name it after the closest place in the worldwide list
      const d = db ?? (await loadPlaces().catch(() => null));
      const p = d && nearestPlace(d, lat, lon);
      name = p && p.km < 25 ? `המיקום שלי (ליד ${p.place.name})` : `המיקום שלי (ליד ${near.city.name})`;
    }
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
    onChange({ ...settings, gps });
    setGpsMsg(`נמצא: ${name}`);
  };
  const denied = 'לא התקבלה הרשאה למיקום. אפשר לאשר מיקום בהגדרות, או לחפש עיר.';

  const locate = () => {
    setGpsMsg('מאתר מיקום…');
    if (isNative()) {
      nativePosition()
        .then((c) => applyPosition(c.latitude, c.longitude, c.altitude))
        .catch(() => setGpsMsg(denied));
      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsMsg('המכשיר לא תומך באיתור מיקום. חפשו עיר ברשימה.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude),
      () => setGpsMsg(denied),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const current = (c: City) => c.id === city.id && !settings.gps;
  const searching = q.trim().length > 0;

  return (
    <Sheet title="מיקום" onClose={onClose} wide>
      <p className="fine loc-now">
        כרגע: <b>{city.name}</b> · <bdi dir="ltr">{city.lat.toFixed(3)}, {city.lon.toFixed(3)}</bdi> · {city.il ? 'ארץ ישראל' : 'חו״ל'} · {city.tz}
        {city.elev ? ` · גובה ${city.elev} מ׳` : ''}
      </p>
      <div className="row-btns">
        <button className="ghost-btn" onClick={locate}>
          <Icon name="locate" size={16} /> איתור לפי GPS
        </button>
        {settings.gps && (
          <button className="ghost-btn" onClick={() => onChange({ ...settings, gps: null })}>
            ביטול ה־GPS
          </button>
        )}
      </div>
      {gpsMsg && (
        <p className="fine" role="status">
          {gpsMsg}
        </p>
      )}

      <label className="search">
        <Icon name="search" size={18} />
        <input
          id="place-search"
          type="search"
          autoComplete="off"
          placeholder="חיפוש עיר בעולם: ירושלים, London, Paris…"
          aria-label="חיפוש עיר"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {searching ? (
        <ul className="place-list" aria-label="תוצאות החיפוש" aria-busy={!db && !loadErr}>
          {hits.map((h, i) => {
            const c = h.city ?? placeToCity(h.place!);
            const he = h.city || (h.place?.cityId && c.name !== h.place.name);
            return (
              <li key={(h.place ? h.place.rank : c.id) + ':' + i}>
                <button className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                  <span className="pl-name">
                    {c.name}
                    {he && h.place && <small> · {h.place.name}</small>}
                  </span>
                  <span className="pl-sub">{h.place ? placeSub(h.place) : c.il ? 'ישראל' : 'חו״ל'}</span>
                </button>
              </li>
            );
          })}
          {hits.length === 0 && (
            <li className="empty">
              {loadErr ? 'לא הצלחנו לטעון את מאגר המקומות. נסו שוב.' : !db ? 'טוען את מאגר המקומות…' : 'לא נמצא מקום בשם הזה. נסו באנגלית, למשל Paris, או "Springfield, Illinois".'}
            </li>
          )}
        </ul>
      ) : (
        <>
          {settings.recentPlaces.length > 0 && (
            <section className="set-sec">
              <h3>אחרונים</h3>
              <div className="city-list">
                {settings.recentPlaces.map((c) => (
                  <button key={c.id} className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                    {c.name}
                    {!c.il && <small> · חו״ל</small>}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="set-sec">
            <h3>ערים נפוצות</h3>
            <div className="city-list">
              {CITIES.map((c) => (
                <button key={c.id} className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                  {c.name}
                  {!c.il && <small> · חו״ל</small>}
                </button>
              ))}
            </div>
          </section>
          <p className="fine">
            {db ? `${db.places.length.toLocaleString('he-IL')} מקומות בעולם, ` : ''}כל הישובים בארץ, ובחו״ל כל עיר עם 15,000 תושבים ומעלה. הכול שמור במכשיר, ולכן החיפוש
            עובד גם בלי אינטרנט. מקום שאינו ברשימת הערים מחושב בגובה פני הים, והדלקת הנרות בו לפי 20 דק׳ בארץ ו־18 בחו״ל
            (אפשר לשנות בהגדרות).
          </p>
        </>
      )}
    </Sheet>
  );
}
