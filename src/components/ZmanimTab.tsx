import { useMemo } from 'react';
import { HDate } from '@hebcal/core';
import { addDays, dateKey, gregDateStr, hebDateStr, itemTitle, sameDay, zmanim, type DayItem } from '../lib/cal';
import type { City } from '../lib/cities';
import { isHe, plural, tr } from '../lib/i18n';
import type { Settings } from '../lib/store';
import { Icon } from './Icon';
import { agendaRows, dayName, inTime, nextShabbat, type AgendaRow } from './dayinfo';

type Z = ReturnType<typeof zmanim>;

interface Props {
  selected: Date;
  now: Date;
  city: City;
  settings: Settings;
  fmt: Intl.DateTimeFormat;
  items: DayItem[];
  z: Z;
  onSelect: (d: Date) => void;
  onJump: () => void;
  onLocation: () => void;
  onAlerts: (zmanId?: string) => void;
  onFriday: () => void;
  onSettings: () => void;
}

const havdalahName = (h: Settings['havdalah']) =>
  ({
    'deg8.5': tr('צאת הכוכבים (8.5°)', 'Nightfall (8.5°)'),
    min42: tr('42 דקות אחרי השקיעה', '42 minutes after sunset'),
    min50: tr('50 דקות אחרי השקיעה', '50 minutes after sunset'),
    min72: tr('רבנו תם (72 דקות)', 'Rabbeinu Tam (72 minutes)'),
  })[h];

export function ZmanimTab({ selected, now, city, settings, fmt, items, z, onSelect, onJump, onLocation, onAlerts, onFriday, onSettings }: Props) {
  const isToday = sameDay(selected, now);
  const hd = new HDate(selected);
  const candleMins = settings.candleMins ?? city.candle;
  const rows = agendaRows(z.rows, items, [], selected, () => true, candleMins);
  const chatzot = z.rows.find((r) => r.id === 'chatzot')?.time ?? z.sunrise;
  const groups: [string, AgendaRow[]][] = [
    [tr('בוקר', 'Morning'), rows.filter((r) => r.time < chatzot)],
    [tr('צהריים', 'Afternoon'), rows.filter((r) => r.time >= chatzot && r.time < z.sunset)],
    [tr('ערב ולילה', 'Evening & night'), rows.filter((r) => r.time >= z.sunset)],
  ];
  const t = now.getTime();
  const next = isToday ? rows.find((r) => r.time.getTime() > t) : undefined;
  const sh = useMemo(
    () => nextShabbat(selected, city, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey(selected), city, settings.candleMins, settings.havdalah, settings.useElevation],
  );

  return (
    <div className="tab zmanim-tab">
      <header className="tab-head">
        <h1 className="tab-title">{tr('זמני היום', 'Zmanim')}</h1>
      </header>

      <button className="place-row" onClick={onLocation}>
        <Icon name={city.id === 'gps' ? 'locate' : 'pin'} size={18} />
        <span className="pr-text">
          <b>{city.name}</b>
          <small>
            {city.id === 'gps' ? tr('לפי GPS · ', 'GPS · ') : ''}
            <bdi dir="ltr">
              {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
            </bdi>
            {city.elev ? tr(` · גובה ${city.elev} מ׳`, ` · ${city.elev} m`) : ''} · {city.il ? tr('ארץ ישראל', 'Israel') : tr('חו״ל', 'Diaspora')}
          </small>
        </span>
        <span className="pr-link">{tr('שינוי', 'Change')}</span>
      </button>

      <div className="day-switch">
        <button className="icon-btn" onClick={() => onSelect(addDays(selected, -1))} aria-label={tr('היום הקודם', 'Previous day')}>
          <Icon name="prev" />
        </button>
        <button className="ds-mid" onClick={onJump} aria-label={tr('מעבר לתאריך אחר', 'Go to another date')}>
          <b>
            {dayName(selected)}, {hebDateStr(hd, false)}
          </b>
          <small>{isToday ? `${tr('היום', 'Today')} · ${gregDateStr(selected)}` : gregDateStr(selected)}</small>
        </button>
        <button className="icon-btn" onClick={() => onSelect(addDays(selected, 1))} aria-label={tr('היום הבא', 'Next day')}>
          <Icon name="next" />
        </button>
      </div>

      <div className="zmanim-cols">
        <div className="z-table">
          {groups.map(([name, list]) =>
            list.length ? (
              <section key={name} className="z-group" aria-label={name}>
                <h3 className="group-label">{name}</h3>
                <ol className="list">
                  {list.map((r) => {
                    const past = isToday && r.time.getTime() <= t;
                    const isNext = next === r;
                    const mins = r.zmanId ? settings.zmanAlerts[r.zmanId] : undefined;
                    return (
                      <li key={r.key} className={`z-row k-${r.kind} ${past ? 'past' : ''} ${isNext ? 'next' : ''}`}>
                        <span className="z-name">
                          {r.name}
                          {r.hint && <small>{r.hint}</small>}
                          {isNext && <small className="z-count">{inTime(r.time.getTime() - t)}</small>}
                        </span>
                        <time className="z-time">{fmt.format(r.time)}</time>
                        {r.zmanId ? (
                          <button
                            className={`bell ${mins !== undefined ? 'on' : ''}`}
                            onClick={() => onAlerts(r.zmanId)}
                            aria-label={
                              mins !== undefined
                                ? tr(`התראה ${mins === 0 ? 'בזמן' : `${mins} דקות לפני`} ${r.name}. שינוי`, `Alert ${mins === 0 ? 'at' : `${mins} ${plural(mins, 'minute', 'minutes')} before`} ${r.name}. Change`)
                                : tr(`הוספת התראה ל${r.name}`, `Add an alert for ${r.name}`)
                            }
                          >
                            <Icon name="bell" size={18} />
                            {mins !== undefined && <span>{mins === 0 ? tr('בזמן', 'on time') : `${mins}′`}</span>}
                          </button>
                        ) : (
                          <span className="bell-gap" />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null,
          )}
        </div>

        <div className="z-side">
          {sh && (
            <section className="card shabbat-card" aria-label={tr('שבת וחג', 'Shabbat & Yom Tov')}>
              <div className="eyebrow">
                {sh.isChag ? (sh.isShabbat ? tr('שבת וחג', 'Shabbat & Yom Tov') : tr('החג הקרוב', 'Coming Yom Tov')) : tr('שבת הקרובה', 'This Shabbat')}
              </div>
              <h3 className="sc-title">{itemTitle(sh)}</h3>
              <div className="pair">
                <button className="pair-cell" onClick={() => onSelect(sh.candle.d)}>
                  <span className="pc-label">{tr('הדלקת נרות', 'Candle lighting')}</span>
                  <span className="pc-time candle">{fmt.format(sh.candle.it.time!)}</span>
                  <span className="pc-sub">{dayName(sh.candle.d)}</span>
                </button>
                <button className="pair-cell" onClick={() => onSelect(sh.havdalah.d)}>
                  <span className="pc-label">{tr('יציאה', 'Havdalah')}</span>
                  <span className="pc-time">{fmt.format(sh.havdalah.it.time!)}</span>
                  <span className="pc-sub">{sh.havdalah.d.getDay() === 6 ? tr('מוצאי שבת', 'Saturday night') : dayName(sh.havdalah.d)}</span>
                </button>
              </div>
              <ul className="list compact">
                <li>
                  <button className="row-btn" onClick={onSettings}>
                    <span>
                      {tr('הדלקת נרות', 'Candle lighting')}
                      <small>
                        {settings.candleMins == null
                          ? tr(`${candleMins} דק׳ לפני השקיעה, כמנהג ${city.name}`, `${candleMins} min before sunset (${city.name} custom)`)
                          : tr(`${candleMins} דק׳ לפני השקיעה`, `${candleMins} min before sunset`)}
                      </small>
                    </span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
                <li>
                  <button className="row-btn" onClick={onSettings}>
                    <span>
                      {tr('צאת השבת', 'Shabbat ends')}
                      <small>{havdalahName(settings.havdalah)}</small>
                    </span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
                <li>
                  <button className="row-btn" onClick={onFriday}>
                    <span>
                      {tr('התראה בכל יום שישי', 'Friday alert')}
                      <small>{tr(`עם זמני השבת, בשעה ${settings.alertTime}`, `With the Shabbat times, at ${settings.alertTime}`)}</small>
                    </span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
              </ul>
            </section>
          )}

          <button className="link-row" onClick={() => onAlerts()}>
            <Icon name="bell" size={18} />
            <span>
              {tr('התראות לזמנים', 'Zmanim alerts')}
              <small>
                {Object.keys(settings.zmanAlerts).length
                  ? tr(
                      `${Object.keys(settings.zmanAlerts).length} זמנים עם התראה`,
                      `${Object.keys(settings.zmanAlerts).length} ${plural(Object.keys(settings.zmanAlerts).length, 'zman', 'zmanim')} with an alert`,
                    )
                  : tr('התראה לפני כל זמן שתבחרו', 'An alert before any zman you choose')}
              </small>
            </span>
            <Icon name="next" size={16} />
          </button>

          <details className="methods">
            <summary>
              <Icon name="info" size={18} /> {tr('השיטות והחישוב', 'Methods & calculation')}
            </summary>
            {isHe() ? (
            <ul>
              <li>
                <b>עלות השחר</b> 16.1° מתחת לאופק. <b>משיכיר</b> 11.5°.
              </li>
              <li>
                <b>סוף זמן ק״ש ותפילה</b>: לפי הגר״א, שעות זמניות מהנץ עד השקיעה; ולפי מגן אברהם, מעלות השחר עד צאת הכוכבים, 72 דקות לכל צד.
              </li>
              <li>
                <b>חצות</b> הוא הרגע שבו השמש עוברת בקו האורך של המקום. <b>מנחה גדולה, קטנה ופלג</b> לפי הגר״א.
              </li>
              <li>
                <b>צאת הכוכבים</b> 8.5° מתחת לאופק. <b>רבנו תם</b> 72 דקות אחרי השקיעה.
              </li>
              <li>
                <b>עיגול</b>: סוף זמן מעוגל לדקה שלפניו, תחילת זמן לדקה שאחריה, לחומרה.
              </li>
              <li>
                {settings.useElevation ? `הזריחה והשקיעה מחושבות לפי גובה המקום (${city.elev} מ׳).` : 'הזריחה והשקיעה מחושבות לגובה פני הים, לפי האופק המישורי.'} לוחות לפי הנץ
                הנראה עשויים להראות הפרש של דקה או שתיים.
              </li>
              <li>
                החישוב בספריית <b>KosherJava</b>, וכל זמן נבדק מול <b>Hebcal</b>. ההפרש הגדול ביותר שנמצא: שנייה אחת.
              </li>
            </ul>
            ) : (
              <ul>
                <li>
                  <b>Alot HaShachar</b> 16.1° below the horizon. <b>Misheyakir</b> 11.5°.
                </li>
                <li>
                  <b>Latest Shema and Shacharit</b>: per the GRA, in halachic hours from sunrise to sunset; and per the Magen Avraham, from dawn to nightfall, 72 minutes on
                  each side.
                </li>
                <li>
                  <b>Chatzot</b> is the moment the sun crosses the local meridian. <b>Mincha Gedola, Mincha Ketana and Plag</b> per the GRA.
                </li>
                <li>
                  <b>Nightfall (Tzeit)</b> 8.5° below the horizon. <b>Rabbeinu Tam</b> 72 minutes after sunset.
                </li>
                <li>
                  <b>Rounding</b>: a zman that ends is rounded down to the minute before, a zman that begins up to the minute after, to be stringent.
                </li>
                <li>
                  {settings.useElevation
                    ? `Sunrise and sunset are calculated for the local elevation (${city.elev} m).`
                    : 'Sunrise and sunset are calculated at sea level, for a flat horizon.'}{' '}
                  Tables based on the visible sunrise may differ by a minute or two.
                </li>
                <li>
                  Calculated with the <b>KosherJava</b> library, and every zman is checked against <b>Hebcal</b>. The largest difference found: one second.
                </li>
              </ul>
            )}
          </details>
          <p className="fine">
            {tr(`שעה זמנית ${Math.round(z.shaahZmanit)} דק׳`, `Halachic hour ${Math.round(z.shaahZmanit)} min`)} · {city.tz}
          </p>
        </div>
      </div>
    </div>
  );
}
