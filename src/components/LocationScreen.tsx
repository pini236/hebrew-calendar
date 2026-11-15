import { useEffect, useMemo, useState } from 'react';
import { CITIES, cityLabel, findCity, nearestCity, type City } from '../lib/cities';
import { loadPlaces, nearestPlace, placeSub, placeToCity, searchPlaces, type PlaceDB } from '../lib/places';
import type { Settings } from '../lib/store';
import { isNative, nativePosition } from '../lib/native';
import { Screen } from './Screen';
import { Icon } from './Icon';
import { isHe, locale, tr } from '../lib/i18n';

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
    // in the worldwide list (every locality in Israel is there), otherwise "near" the closest city.
    // The name is kept in the interface language of the moment it was found.
    const d = db ?? (await loadPlaces().catch(() => null));
    const p = d && nearestPlace(d, lat, lon);
    const known = p?.place.cityId ? findCity(p.place.cityId) : undefined;
    const pName = p ? (known && cityLabel(known)) || p.place.name : '';
    const name =
      near.km < 5 || (near.km < 10 && !(p && p.km < near.km))
        ? cityLabel(near.city)
        : p && p.km < 10
          ? pName
          : p && p.km < 30
            ? tr(`ליד ${pName}`, `Near ${pName}`)
            : tr(`ליד ${near.city.name}`, `Near ${cityLabel(near.city)}`);
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
  const denied = tr('לא התקבלה הרשאה למיקום. אפשר לאשר מיקום בהגדרות, או לחפש עיר.', 'No location permission. Allow location in Settings, or search for a city.');

  const locate = () => {
    setGpsMsg(tr('מאתר מיקום…', 'Finding your location…'));
    if (isNative()) {
      nativePosition()
        .then((c) => applyPosition(c.latitude, c.longitude, c.altitude))
        .catch(() => setGpsMsg(denied));
      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsMsg(tr('המכשיר לא תומך באיתור מיקום. חפשו עיר ברשימה.', "This device can't find its location. Search for a city."));
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
    <Screen title={tr('מיקום', 'Location')} onClose={onClose}>
      <div className="loc-now">
        <Icon name={settings.gps ? 'locate' : 'pin'} size={20} />
        <span className="pr-text">
          <small className="loc-kicker">{settings.gps ? tr('המיקום שנמצא לפי GPS', 'Location found by GPS') : tr('המיקום הנוכחי', 'Current location')}</small>
          <b>{city.name}</b>
          <small>
            <bdi dir="ltr">
              {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
            </bdi>
            {city.elev ? tr(` · גובה ${city.elev} מ׳`, ` · elevation ${city.elev} m`) : ''} · {city.il ? tr('ארץ ישראל', 'Israel') : tr('חו״ל', 'Outside Israel')}
          </small>
        </span>
        {settings.gps && (
          <button className="text-btn" onClick={() => onChange({ ...settings, gps: null })}>
            {tr('ביטול', 'Cancel')}
          </button>
        )}
      </div>
      <div className="row-btns">
        <button className="ghost-btn" onClick={locate}>
          <Icon name="locate" size={16} /> {settings.gps ? tr('איתור מחדש לפי GPS', 'Locate again by GPS') : tr('איתור לפי GPS', 'Locate by GPS')}
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
          placeholder={tr('חיפוש עיר או יישוב, בעברית או באנגלית', 'Search for a city or town')}
          aria-label={tr('חיפוש עיר', 'Search for a city')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {searching ? (
        <ul className="place-list" aria-label={tr('תוצאות החיפוש', 'Search results')} aria-busy={!db && !loadErr}>
          {hits.map((h, i) => {
            const c = h.city ?? placeToCity(h.place!);
            // a listed city found by its English name: in Hebrew, also show the name searched for
            const he = isHe() && (h.city || (h.place?.cityId && c.name !== h.place.name));
            return (
              <li key={(h.place ? h.place.rank : c.id) + ':' + i}>
                <button className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                  <span className="pl-name">
                    {cityLabel(c)}
                    {he && h.place && <small> · {h.place.name}</small>}
                  </span>
                  <span className="pl-sub">{h.place ? placeSub(h.place) : c.il ? tr('ישראל', 'Israel') : tr('חו״ל', 'Outside Israel')}</span>
                </button>
              </li>
            );
          })}
          {hits.length === 0 && (
            <li className="empty">
              {loadErr
                ? tr('לא הצלחנו לטעון את מאגר המקומות. נסו שוב.', "Couldn't load the list of places. Try again.")
                : !db
                  ? tr('טוען את מאגר המקומות…', 'Loading the list of places…')
                  : tr('לא נמצא מקום בשם הזה. נסו באנגלית, למשל Paris, או "Springfield, Illinois".', 'No place by that name. Try e.g. Paris, or "Springfield, Illinois".')}
            </li>
          )}
        </ul>
      ) : (
        <>
          {settings.recentPlaces.length > 0 && (
            <section className="set-sec">
              <h3>{tr('אחרונים', 'Recent')}</h3>
              <div className="city-list">
                {settings.recentPlaces.map((c) => (
                  <button key={c.id} className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                    {cityLabel(c)}
                    {!c.il && <small> · {tr('חו״ל', 'abroad')}</small>}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="set-sec">
            <h3>{tr('ערים נפוצות', 'Popular cities')}</h3>
            <div className="city-list">
              {CITIES.map((c) => (
                <button key={c.id} className={current(c) ? 'on' : ''} onClick={() => pick(c)}>
                  {cityLabel(c)}
                  {!c.il && <small> · {tr('חו״ל', 'abroad')}</small>}
                </button>
              ))}
            </div>
          </section>
          {isHe() ? (
            <p className="fine">
              {db ? `${db.places.length.toLocaleString(locale())} מקומות בעולם, ` : ''}כל הישובים בארץ, ובחו״ל כל עיר עם 15,000 תושבים ומעלה. הכול שמור במכשיר, ולכן החיפוש
              עובד גם בלי אינטרנט. מקום שאינו ברשימת הערים מחושב בגובה פני הים, והדלקת הנרות בו לפי 20 דק׳ בארץ ו־18 בחו״ל
              (אפשר לשנות בהגדרות).
            </p>
          ) : (
            <p className="fine">
              {db ? `${db.places.length.toLocaleString(locale())} places worldwide: ` : ''}every town in Israel, and abroad every city with
              15,000 people or more. It is all stored on the device, so search works offline too. A place not in the city list is
              calculated at sea level, with candle lighting 20 min before sunset in Israel and 18 abroad (you can change this in Settings).
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
