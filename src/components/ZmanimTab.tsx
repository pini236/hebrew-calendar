import { useMemo } from 'react';
import { HDate } from '@hebcal/core';
import { addDays, dateKey, gregDateStr, hebDateStr, itemTitle, sameDay, zmanim, type DayItem } from '../lib/cal';
import type { City } from '../lib/cities';
import { plural, tr } from '../lib/i18n';
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
            </section>
          )}

          <button className="link-row" onClick={() => onAlerts()}>
            <Icon name="bell" size={18} />
            <span>
              {tr('התראות לזמנים', 'Zmanim alerts')}
            </span>
            <Icon name="next" size={16} />
          </button>

        </div>
      </div>
    </div>
  );
}
