import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CITY, findCity } from './lib/cities';
import { addDays, dateKey, dayItems, eventsOn, sameDay, timeFmt, today, zmanim } from './lib/cal';
import { DEFAULT_SETTINGS, EVENTS_KEY, SETTINGS_KEY, mergeSettings, usePersistent, type MyEvent, type Settings } from './lib/store';
import { DayHero } from './components/DayHero';
import { MonthView, shiftMonth } from './components/MonthView';
import { LearningCard, MyEventsCard, PrayerCard, ShabbatCard, ZmanimCard } from './components/DayDetails';
import { JumpSheet } from './components/JumpSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { EventEditor } from './components/EventEditor';
import { NotifySheet } from './components/NotifySheet';
import { BrandMark, Icon } from './components/Icon';
import { AlertsSheet } from './components/AlertsSheet';
import { LocationSheet } from './components/LocationSheet';
import { isNative, pushWidget, syncNotifications } from './lib/native';
import { buildWidgetData } from './lib/widget';
import { planNotifications } from './lib/alerts';

type SheetName = null | 'jump' | 'settings' | 'event' | 'notify' | 'alerts' | 'location';

export default function App() {
  const [settings, setSettings] = usePersistent<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, mergeSettings);
  const [myEvents, setMyEvents] = usePersistent<MyEvent[]>(EVENTS_KEY, []);
  const [selected, setSelected] = useState(today);
  const [anchor, setAnchor] = useState(today);
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<SheetName>(null);
  const [editing, setEditing] = useState<MyEvent | null>(null);

  // live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // theme, text size, contrast
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    if (settings.textSize === 'normal') root.removeAttribute('data-text');
    else root.setAttribute('data-text', settings.textSize);
    if (settings.highContrast) root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');
  }, [settings.theme, settings.textSize, settings.highContrast]);

  const city = settings.gps ?? settings.place ?? findCity(settings.cityId) ?? DEFAULT_CITY;

  // native apps: replace the pending notifications (Friday alerts, zmanim, candle lighting, fasts, my events)
  // on every open / resume and whenever the location, the settings or the events change
  useEffect(() => {
    if (!isNative()) return;
    const run = () => {
      const plan = planNotifications({ now: new Date(), city, settings, events: myEvents });
      syncNotifications(plan.list).catch(() => {});
    };
    const t = setTimeout(run, 600);
    window.addEventListener('luachi:resume', run);
    return () => {
      clearTimeout(t);
      window.removeEventListener('luachi:resume', run);
    };
  }, [
    city,
    myEvents,
    settings.nativeAlerts,
    settings.alertTime,
    settings.candleMins,
    settings.havdalah,
    settings.useElevation,
    settings.showModern,
    settings.zmanAlerts,
    settings.candleAlert,
    settings.candleAlertMins,
    settings.havdalahAlert,
    settings.fastAlerts,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  // native apps: refresh the home-screen widget's data (about two months ahead)
  useEffect(() => {
    if (!isNative()) return;
    const run = () => {
      try {
        pushWidget(JSON.stringify(buildWidgetData(today(), 60, city, settings))).catch(() => {});
      } catch {
        /* never let the widget break the app */
      }
    };
    const t = setTimeout(run, 900);
    window.addEventListener('luachi:resume', run);
    return () => {
      clearTimeout(t);
      window.removeEventListener('luachi:resume', run);
    };
  }, [city, settings.candleMins, settings.havdalah, settings.useElevation, settings.showModern]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);
  const selKey = dateKey(selected);
  const items = useMemo(() => dayItems(selected, city, settings), [selKey, city, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const z = useMemo(() => zmanim(selected, city, settings), [selKey, city, settings.useElevation]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => eventsOn(myEvents, selected), [myEvents, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((d: Date) => {
    setSelected(d);
    setAnchor(d);
    setSheet(null);
  }, []);
  const moveDay = useCallback((n: number) => go(addDays(selected, n)), [go, selected]);

  // keyboard: ← next day (RTL), → previous day, PageUp/PageDown months, t = today, g = jump
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') moveDay(1);
      else if (e.key === 'ArrowRight') moveDay(-1);
      else if (e.key === 'ArrowDown') moveDay(7);
      else if (e.key === 'ArrowUp') moveDay(-7);
      else if (e.key === 'PageDown') setAnchor((a) => shiftMonth(a, 1, settings.monthMode));
      else if (e.key === 'PageUp') setAnchor((a) => shiftMonth(a, -1, settings.monthMode));
      else if (e.key === 't' || e.key === 'א') go(today());
      else if (e.key === 'g' || e.key === 'ע' || e.key === '/') {
        e.preventDefault();
        setSheet('jump');
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, moveDay, go, settings.monthMode]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditing(null);
  }, []);

  const isToday = sameDay(selected, now);
  const zChatzot = z.rows.find((r) => r.id === 'chatzot')?.time ?? z.sunrise;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">לוח עברי</span>
        </div>
        <div className="top-actions">
          <button className="chip-btn" onClick={() => setSheet('location')} aria-label={`מיקום: ${city.name}. שינוי מיקום`}>
            <Icon name="pin" size={16} />
            <span className="city-name">{city.name}</span>
          </button>
          {!isToday && (
            <button className="chip-btn accent" onClick={() => go(today())}>
              <Icon name="today" size={16} /> היום
            </button>
          )}
          <button className="icon-btn" onClick={() => setSheet('jump')} aria-label="קפיצה בזמן">
            <Icon name="jump" />
          </button>
          <button className="icon-btn" onClick={() => setSheet('settings')} aria-label="הגדרות">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="col col-day">
          <div className="o-hero">
            <DayHero
              date={selected}
              now={now}
              items={items}
              times={{ dawn: z.dawn, sunrise: z.sunrise, sunset: z.sunset, dusk: z.dusk, chatzot: zChatzot }}
              fmt={fmt}
              cityName={city.name}
              onDay={moveDay}
              onToday={() => go(today())}
            />
          </div>
          <div className="o-zmanim">
            <ZmanimCard date={selected} now={now} rows={z.rows} items={items} shaahZmanit={z.shaahZmanit} fmt={fmt} city={city} candleMins={settings.candleMins ?? city.candle} onAlerts={() => setSheet('alerts')} />
          </div>
        </div>
        <div className="col col-cal">
          <div className="o-month">
            <MonthView
              anchor={anchor}
              selected={selected}
              now={now}
              mode={settings.monthMode}
              city={city}
              settings={settings}
              myEvents={myEvents}
              onSelect={(d) => setSelected(d)}
              onMonth={(d) => setAnchor((a) => shiftMonth(a, d, settings.monthMode))}
              onMode={(m) => {
                setSettings((s) => ({ ...s, monthMode: m }));
                setAnchor(selected);
              }}
            />
          </div>
          <div className="o-shabbat">
            <ShabbatCard date={selected} city={city} settings={settings} fmt={fmt} onJump={go} onNotify={() => setSheet('notify')} />
          </div>
          <div className="o-mine">
            <MyEventsCard
              date={selected}
              list={mine}
              onAdd={() => {
                setEditing(null);
                setSheet('event');
              }}
              onEdit={(e) => {
                setEditing(e);
                setSheet('event');
              }}
            />
          </div>
          <div className="o-prayer">
            <PrayerCard date={selected} il={city.il} items={items} />
          </div>
          {settings.showLearning && (
            <div className="o-learning">
              <LearningCard items={items} />
            </div>
          )}
        </div>
      </main>

      <footer className="foot">
        לוח עברי · יומן עברי־לועזי ללא פרסומות · מקשי קיצור: ← → ימים, PgUp/PgDn חודשים, T היום, G קפיצה
      </footer>

      {sheet === 'notify' && <NotifySheet city={city} settings={settings} onChange={setSettings} onClose={closeSheet} />}
      {sheet === 'alerts' && (
        <AlertsSheet city={city} settings={settings} myEvents={myEvents} onChange={setSettings} onFriday={() => setSheet('notify')} onClose={closeSheet} />
      )}
      {sheet === 'location' && <LocationSheet city={city} settings={settings} onChange={setSettings} onClose={closeSheet} />}
      {sheet === 'jump' && <JumpSheet selected={selected} city={city} settings={settings} myEvents={myEvents} onGo={go} onClose={closeSheet} />}
      {sheet === 'settings' && (
        <SettingsSheet
          settings={settings}
          city={city}
          myEvents={myEvents}
          onChange={setSettings}
          onImport={(list) =>
            setMyEvents((cur) => {
              const ids = new Set(cur.map((e) => e.id));
              return [...cur, ...list.filter((e) => !ids.has(e.id))];
            })
          }
          onNotify={() => setSheet('notify')}
          onAlerts={() => setSheet('alerts')}
          onLocation={() => setSheet('location')}
          onClose={closeSheet}
        />
      )}
      {sheet === 'event' && (
        <EventEditor
          initial={editing}
          date={selKey}
          onSave={(ev) => {
            setMyEvents((cur) => (cur.some((x) => x.id === ev.id) ? cur.map((x) => (x.id === ev.id ? ev : x)) : [...cur, ev]));
            closeSheet();
          }}
          onDelete={(id) => {
            setMyEvents((cur) => cur.filter((x) => x.id !== id));
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
