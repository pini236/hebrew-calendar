import { useMemo } from 'react';
import { HDate } from '@hebcal/core';
import { WEEKDAYS, addDays, dateKey, gregDateStr, hebDateStr, sameDay, zmanim, type DayItem } from '../lib/cal';
import type { City } from '../lib/cities';
import type { Settings } from '../lib/store';
import { Icon } from './Icon';
import { agendaRows, countdown, nextShabbat, type AgendaRow } from './dayinfo';

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

const HAVDALAH_NAMES: Record<Settings['havdalah'], string> = {
  'deg8.5': 'צאת הכוכבים (8.5°)',
  min42: '42 דקות אחרי השקיעה',
  min50: '50 דקות אחרי השקיעה',
  min72: 'רבנו תם (72 דקות)',
};

export function ZmanimTab({ selected, now, city, settings, fmt, items, z, onSelect, onJump, onLocation, onAlerts, onFriday, onSettings }: Props) {
  const isToday = sameDay(selected, now);
  const hd = new HDate(selected);
  const candleMins = settings.candleMins ?? city.candle;
  const rows = agendaRows(z.rows, items, [], selected, () => true, candleMins);
  const chatzot = z.rows.find((r) => r.id === 'chatzot')?.time ?? z.sunrise;
  const groups: [string, AgendaRow[]][] = [
    ['בוקר', rows.filter((r) => r.time < chatzot)],
    ['צהריים', rows.filter((r) => r.time >= chatzot && r.time < z.sunset)],
    ['ערב ולילה', rows.filter((r) => r.time >= z.sunset)],
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
        <h1 className="tab-title">זמני היום</h1>
      </header>

      <button className="place-row" onClick={onLocation}>
        <Icon name="pin" size={18} />
        <span className="pr-text">
          <b>{city.name}</b>
          <small>
            <bdi dir="ltr">
              {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
            </bdi>
            {city.elev ? ` · גובה ${city.elev} מ׳` : ''} · {city.il ? 'ארץ ישראל' : 'חו״ל'}
          </small>
        </span>
        <span className="pr-link">שינוי</span>
      </button>

      <div className="day-switch">
        <button className="icon-btn" onClick={() => onSelect(addDays(selected, -1))} aria-label="היום הקודם">
          <Icon name="prev" />
        </button>
        <button className="ds-mid" onClick={onJump} aria-label="מעבר לתאריך אחר">
          <b>
            יום {WEEKDAYS[selected.getDay()]}, {hebDateStr(hd, false)}
          </b>
          <small>{isToday ? `היום · ${gregDateStr(selected)}` : gregDateStr(selected)}</small>
        </button>
        <button className="icon-btn" onClick={() => onSelect(addDays(selected, 1))} aria-label="היום הבא">
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
                          {isNext && <small className="z-count">בעוד {countdown(r.time.getTime() - t)}</small>}
                        </span>
                        <time className="z-time">{fmt.format(r.time)}</time>
                        {r.zmanId ? (
                          <button
                            className={`bell ${mins !== undefined ? 'on' : ''}`}
                            onClick={() => onAlerts(r.zmanId)}
                            aria-label={mins !== undefined ? `התראה ${mins === 0 ? 'בזמן' : `${mins} דקות לפני`} ${r.name}. שינוי` : `הוספת התראה ל${r.name}`}
                          >
                            <Icon name="bell" size={18} />
                            {mins !== undefined && <span>{mins === 0 ? 'בזמן' : `${mins}′`}</span>}
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
            <section className="card shabbat-card" aria-label="שבת וחג">
              <div className="eyebrow">{sh.isChag ? (sh.isShabbat ? 'שבת וחג' : 'החג הקרוב') : 'שבת הקרובה'}</div>
              <h3 className="sc-title">{sh.title}</h3>
              <div className="pair">
                <button className="pair-cell" onClick={() => onSelect(sh.candle.d)}>
                  <span className="pc-label">הדלקת נרות</span>
                  <span className="pc-time candle">{fmt.format(sh.candle.it.time!)}</span>
                  <span className="pc-sub">יום {WEEKDAYS[sh.candle.d.getDay()]}</span>
                </button>
                <button className="pair-cell" onClick={() => onSelect(sh.havdalah.d)}>
                  <span className="pc-label">יציאה</span>
                  <span className="pc-time">{fmt.format(sh.havdalah.it.time!)}</span>
                  <span className="pc-sub">{sh.havdalah.d.getDay() === 6 ? 'מוצאי שבת' : `יום ${WEEKDAYS[sh.havdalah.d.getDay()]}`}</span>
                </button>
              </div>
              <ul className="list compact">
                <li>
                  <button className="row-btn" onClick={onSettings}>
                    <span>
                      הדלקת נרות
                      <small>{settings.candleMins == null ? `${candleMins} דק׳ לפני השקיעה, כמנהג ${city.name}` : `${candleMins} דק׳ לפני השקיעה`}</small>
                    </span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
                <li>
                  <button className="row-btn" onClick={onSettings}>
                    <span>
                      צאת השבת
                      <small>{HAVDALAH_NAMES[settings.havdalah]}</small>
                    </span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
                <li>
                  <button className="row-btn" onClick={onFriday}>
                    <span>
                      התראה בכל יום שישי
                      <small>עם זמני השבת, בשעה {settings.alertTime}</small>
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
              התראות לזמנים
              <small>
                {Object.keys(settings.zmanAlerts).length
                  ? `${Object.keys(settings.zmanAlerts).length} זמנים עם התראה`
                  : 'התראה לפני כל זמן שתבחרו'}
              </small>
            </span>
            <Icon name="next" size={16} />
          </button>

          <details className="methods">
            <summary>
              <Icon name="info" size={18} /> השיטות והחישוב
            </summary>
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
          </details>
          <p className="fine">
            שעה זמנית {Math.round(z.shaahZmanit)} דק׳ · {city.tz}
          </p>
        </div>
      </div>
    </div>
  );
}
