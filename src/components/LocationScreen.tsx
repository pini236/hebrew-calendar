import { useEffect, useMemo, useState } from 'react';
import { CITIES, findCity, nearestCity, type City } from '../lib/cities';
import { loadPlaces, nearestPlace, placeSub, placeToCity, searchPlaces, type PlaceDB } from '../lib/places';
import type { Settings } from '../lib/store';
import { isNative, nativePosition } from '../lib/native';
import { Screen } from './Screen';
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

export function LocationScreen({ settings, city, onChange, onClose }: Props) {
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
    // the name of the place found: a Hebrew-named city when inside it, otherwise the closest place
    // in the worldwide list (every locality in Israel is there), otherwise "near" the closest city
    const d = db ?? (await loadPlaces().catch(() => null));
    const p = d && nearestPlace(d, lat, lon);
    const pName = p ? (p.place.cityId && findCity(p.place.cityId)?.name) || p.place.name : '';
    const name =
      near.km < 5 || (near.km < 10 && !(p && p.km < near.km))
        ? near.city.name
        : p && p.km < 10
          ? pName
          : p && p.km < 30
            ? `ליד ${pName}`
            : `ליד ${near.city.name}`;
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
    setGpsMsg(''); // the card above now shows the place found
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
    <Screen title="מיקום" onClose={onClose}>
      <div className="loc-now">
        <Icon name={settings.gps ? 'locate' : 'pin'} size={20} />
        <span className="pr-text">
          <small className="loc-kicker">{settings.gps ? 'המיקום שנמצא לפי GPS' : 'המיקום הנוכחי'}</small>
          <b>{city.name}</b>
          <small>
            <bdi dir="ltr">
              {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
            </bdi>
            {city.elev ? ` · גובה ${city.elev} מ׳` : ''} · {city.il ? 'ארץ ישראל' : 'חו״ל'}
          </small>
        </span>
        {settings.gps && (
          <button className="text-btn" onClick={() => onChange({ ...settings, gps: null })}>
            ביטול
          </button>
        )}
      </div>
      <div className="row-btns">
        <button className="ghost-btn" onClick={locate}>
          <Icon name="locate" size={16} /> {settings.gps ? 'איתור מחדש לפי GPS' : 'איתור לפי GPS'}
        </button>
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
          placeholder="חיפוש עיר או יישוב, בעברית או באנגלית"
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
    </Screen>
  );
}
