/**
 * The Omer introduction: opened by the notification before Pesach (and from the card's settings).
 * The 49 days as one field, when the count begins (real nightfall for the place), the evening
 * reminder, the nusach, and the home-screen widget: a live preview of it, and on Android a button
 * that asks the launcher to add it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { WEEKDAYS, gregDateStr, timeFmt } from '../../lib/cal';
import { tr } from '../../lib/i18n';
import { canPinOmerWidget, isNative, notificationPermission, pinOmerWidget } from '../../lib/native';
import { dayNumber, firstEve, omerCells, omerNow, omerPrefs, type OmerPrefs } from '../../lib/seasons/omer';
import { omerWidgetModel, widgetOmer, type WidgetData } from '../../lib/widget';
import { Screen } from '../Screen';
import { useOmerState } from './OmerCard';
import { OmerField } from './OmerField';
import { NusachPicker } from './OmerSheets';
import { OmerWidgetMock } from './OmerWidgetMock';
import type { SeasonScreenProps } from './index';
import './omer.css';

/** the platform; under `npm run dev`, ?platform=android|ios shows the other platforms' version (previews) */
function platform() {
  const p = import.meta.env.DEV ? new URLSearchParams(location.search).get('platform') : null;
  return p ?? Capacitor.getPlatform();
}

export default function OmerIntro({ now, city, settings, onSettings, onClose }: SeasonScreenProps) {
  const prefs = omerPrefs(settings.seasons?.omer);
  const set = (p: Partial<OmerPrefs>) => onSettings({ ...settings, seasons: { ...(settings.seasons ?? {}), omer: { ...prefs, ...p } } });
  const [st] = useOmerState();
  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);
  const minute = Math.floor(now.getTime() / 60000);
  const m = useMemo(() => omerNow(now, city, settings), [minute, city]); // eslint-disable-line react-hooks/exhaustive-deps
  const om = useMemo(() => widgetOmer(now, city, settings, st), [minute, city, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const wm = omerWidgetModel({ om } as WidgetData, now);

  // the season shown: this year's while it runs (or until two weeks after it), otherwise the next one
  const inSeason = m.n >= 1 && m.n <= 49 && om.y === m.year;
  const year = om.y;
  const eve = firstEve(year);
  const startAt = new Date(om.t[0]);
  const cells = inSeason ? omerCells(st, m.year, m.n, city.il) : omerCells(st, year, 0, city.il).map((c, i) => (i === 0 ? 'due' : c));

  const plat = platform();
  const [canPin, setCanPin] = useState(import.meta.env.DEV && plat === 'android');
  const [pinned, setPinned] = useState<null | boolean>(null);
  useEffect(() => {
    canPinOmerWidget().then((v) => v && setCanPin(true));
  }, []);
  const native = isNative() || (import.meta.env.DEV && plat !== 'web');

  const when = inSeason
    ? { label: tr('היום בעומר', 'Day of the Omer'), value: dayNumber(m.n), timeLabel: tr('הספירה הבאה', 'Next count'), time: fmt.format(m.next) }
    : {
        label: tr('ליל שני של פסח', 'Second night of Pesach'),
        value: tr(`יום ${WEEKDAYS[eve.getDay()]}, ${gregDateStr(eve, false)}`, `${WEEKDAYS[eve.getDay()]}, ${gregDateStr(eve, false)}`),
        timeLabel: tr('צאת הכוכבים', 'Nightfall'),
        time: fmt.format(startAt),
      };

  return (
    <Screen title={tr('ספירת העומר', 'Sefirat HaOmer')} onClose={onClose}>
      <div className="oi">
        <div className="oi-hero">
          <OmerField cells={cells} current={inSeason ? m.n : 1} week={inSeason ? Math.floor((m.n - 1) / 7) + 1 : 0} size="large" />
          <h1 className="oi-title">{tr('49 ימים עד שבועות', '49 days to Shavuot')}</h1>
          <p className="oi-lead">
            {tr('מליל שני של פסח, בכל ערב בצאת הכוכבים, סופרים עוד יום', 'From the second night of Pesach, each evening at nightfall, one more day is counted')}
          </p>
        </div>

        <div className="plain oi-facts">
          <div className="oi-when">
            <span>
              <small>{when.label}</small>
              <b>{when.value}</b>
            </span>
            <span className="oi-time">
              <small>{when.timeLabel}</small>
              <b>{when.time}</b>
            </span>
          </div>
          {native && (
            <label className="toggle">
              <span>{tr('תזכורת בכל ערב', 'A reminder every evening')}</span>
              <input
                type="checkbox"
                checked={prefs.remind}
                onChange={(e) => {
                  set({ remind: e.target.checked });
                  if (e.target.checked && isNative()) notificationPermission(true).catch(() => {});
                }}
              />
              <i />
            </label>
          )}
          <div className="oi-nusach">
            <span>{tr('נוסח', 'Nusach')}</span>
            <NusachPicker value={prefs.nusach} onChange={(nusach) => set({ nusach })} />
          </div>
        </div>

        {plat !== 'ios' && wm && (
          <section className="oi-widget" aria-label={tr('ווידג׳ט למסך הבית', 'Home-screen widget')}>
            <h2 className="group-label">{tr('על מסך הבית', 'On your home screen')}</h2>
            <div className="oi-plate">
              <OmerWidgetMock m={wm} size="m" />
            </div>
            {plat === 'android' ? (
              canPin ? (
                <>
                  <button
                    className="primary oi-pin"
                    onClick={() =>
                      pinOmerWidget().then((ok) => {
                        setPinned(ok);
                      })
                    }
                  >
                    {tr('הוספה למסך הבית', 'Add to home screen')}
                  </button>
                  {pinned !== null && (
                    <p className="fine oi-note">
                      {pinned ? tr('אשרו במסך הבית שנפתח', 'Confirm on the home screen') : tr('המסך הזה לא מאפשר הוספה מהאפליקציה. לחיצה ארוכה על מסך הבית ← ווידג׳טים ← לוח יהודי', "This launcher can't add it from the app. Long-press the home screen → Widgets → Luach")}
                    </p>
                  )}
                </>
              ) : (
                <p className="fine oi-note">{tr('לחיצה ארוכה על מקום ריק במסך הבית ← ווידג׳טים ← לוח יהודי ← ספירת העומר', 'Long-press the home screen → Widgets → Luach → Sefirat HaOmer')}</p>
              )
            ) : (
              <p className="fine oi-note">{tr('הווידג׳ט נמצא באפליקציה לאנדרואיד', 'The widget comes with the Android app')}</p>
            )}
          </section>
        )}
      </div>
    </Screen>
  );
}
