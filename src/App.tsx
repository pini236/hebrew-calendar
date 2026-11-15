import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CITY, cityLabel, findCity } from './lib/cities';
import { isHe, resolveLang, setLang, tr } from './lib/i18n';
import { addDays, dateKey, dayItems, daysBetween, eventsOn, fromKey, sameDay, timeFmt, today, zmanim } from './lib/cal';
import { DEFAULT_SETTINGS, EVENTS_KEY, SETTINGS_KEY, mergeSettings, usePersistent, type MyEvent, type Settings } from './lib/store';
import { TodayTab } from './components/TodayTab';
import { MonthTab, monthBounds, shiftMonth } from './components/MonthTab';
import { ZmanimTab } from './components/ZmanimTab';
import { MineTab } from './components/MineTab';
import { SettingsTab } from './components/SettingsTab';
// pushed screens load on first use, so the first paint only carries the tabs
const JumpScreen = lazy(() => import('./components/JumpScreen').then((m) => ({ default: m.JumpScreen })));
const EventEditor = lazy(() => import('./components/EventEditor').then((m) => ({ default: m.EventEditor })));
const NotifyScreen = lazy(() => import('./components/NotifyScreen').then((m) => ({ default: m.NotifyScreen })));
const AlertsScreen = lazy(() => import('./components/AlertsScreen').then((m) => ({ default: m.AlertsScreen })));
const LocationScreen = lazy(() => import('./components/LocationScreen').then((m) => ({ default: m.LocationScreen })));
import { BrandMark, Icon } from './components/Icon';
import { isNative, pushWidget, setStatusBar, syncNotifications } from './lib/native';
import { buildWidgetData } from './lib/widget';
import { APP_NAME } from './lib/brand';
import { planNotifications } from './lib/alerts';

/** The five destinations, in thumb order (right to left) */
type Tab = 'today' | 'month' | 'zmanim' | 'mine' | 'settings';

/* ---------- where the user was: the tab, the day and the month, kept across a reload or a resume ---------- */
const VIEW_KEY = 'luach.view.v1';
const VIEW_TTL = 30 * 60000; // a short break (a call, the phone closing the app) comes back; later, the app opens on today
interface SavedView {
  tab: Tab;
  selected: string;
  anchor: string;
  /** the selected day was today when saved: it follows the calendar to the new today */
  wasToday: boolean;
  at: number;
}
function loadView(): { tab: Tab; selected: Date; anchor: Date } {
  const t = today();
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null') as SavedView | null;
    if (v && Date.now() - v.at < VIEW_TTL && /^\d{4}-\d{2}-\d{2}$/.test(v.selected) && /^\d{4}-\d{2}-\d{2}$/.test(v.anchor)) {
      const tab = (['today', 'month', 'zmanim', 'mine', 'settings'] as Tab[]).includes(v.tab) ? v.tab : 'today';
      return { tab, selected: v.wasToday ? t : fromKey(v.selected), anchor: fromKey(v.anchor) };
    }
  } catch {
    /* storage unavailable */
  }
  return { tab: 'today', selected: t, anchor: t };
}
const TABS: { id: Tab; icon: string }[] = [
  { id: 'today', icon: 'tabToday' },
  { id: 'month', icon: 'tabMonth' },
  { id: 'zmanim', icon: 'tabZmanim' },
  { id: 'mine', icon: 'tabMine' },
  { id: 'settings', icon: 'tabSettings' },
];
/** A tab's label in the interface language */
const tabLabel = (t: Tab) =>
  ({
    today: tr('היום', 'Today'),
    month: tr('לוח', 'Calendar'),
    zmanim: tr('זמנים', 'Zmanim'),
    mine: tr('שלי', 'Mine'),
    settings: tr('הגדרות', 'Settings'),
  })[t];

/** Screens pushed over the tabs */
type ScreenState = null | { name: 'jump' } | { name: 'event' } | { name: 'notify' } | { name: 'alerts'; focus?: string } | { name: 'location' };

export default function App() {
  const [settings, setSettings] = usePersistent<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, mergeSettings);
  const [myEvents, setMyEvents] = usePersistent<MyEvent[]>(EVENTS_KEY, []);
  // the interface language, set before anything renders text (Hebrew or English, from the phone or the settings)
  const language = resolveLang(settings.lang);
  setLang(language);
  const [initial] = useState(loadView);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [selected, setSelected] = useState(initial.selected);
  const [anchor, setAnchor] = useState(initial.anchor);

  // remember the view, so a reload, or the phone closing the app in the background, comes back to it
  useEffect(() => {
    try {
      const v: SavedView = { tab, selected: dateKey(selected), anchor: dateKey(anchor), wasToday: sameDay(selected, today()), at: Date.now() };
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  }, [tab, selected, anchor]);
  const [now, setNow] = useState(() => new Date());
  const [screen, setScreen] = useState<ScreenState>(null);
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

  // the phone's status bar follows the theme chosen here, not only the phone's own
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'auto' && !!mq?.matches);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#131311' : '#F5F4F0');
      setStatusBar(dark);
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [settings.theme]);

  const baseCity = settings.gps ?? settings.place ?? findCity(settings.cityId) ?? DEFAULT_CITY;
  // the listed cities carry an English name for the English interface
  const city = useMemo(() => {
    const name = cityLabel(baseCity);
    return name === baseCity.name ? baseCity : { ...baseCity, name };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCity, language]);

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
  const z = useMemo(() => zmanim(selected, city, settings), [selKey, city, settings.useElevation, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => eventsOn(myEvents, selected), [myEvents, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- pushed screens: one history entry, so the phone's back gesture closes them ----- */
  const openScreen = useCallback((s: Exclude<ScreenState, null>) => {
    setScreen((cur) => {
      if (!cur) {
        try {
          history.pushState({ luachScreen: true }, '');
        } catch {
          /* sandboxed preview */
        }
      }
      return s;
    });
  }, []);
  const closeScreen = useCallback(() => {
    if (history.state?.luachScreen) history.back();
    else {
      setScreen(null);
      setEditing(null);
    }
  }, []);
  useEffect(() => {
    const onPop = () => {
      setScreen(null);
      setEditing(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // each tab keeps its own scroll position; tapping the open tab again goes back to its top
  const scrolls = useRef<Partial<Record<Tab, number>>>({});
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const showTab = useCallback((t: Tab) => {
    const from = tabRef.current;
    if (t === from) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scrolls.current[from] = window.scrollY;
    setTab(t);
    const y = scrolls.current[t] ?? 0;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, []);

  /** go to a date: from the month and zmanim tabs stay there, from anywhere else open that day's agenda */
  const go = useCallback(
    (d: Date) => {
      setSelected(d);
      setAnchor(d);
      setTab((t) => (t === 'month' || t === 'zmanim' ? t : 'today'));
      closeScreen();
    },
    [closeScreen],
  );
  // a day's full agenda: Today, from its top
  const openDay = useCallback((d: Date) => {
    scrolls.current[tabRef.current] = window.scrollY;
    setSelected(d);
    setAnchor(d);
    setTab('today');
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, []);
  const select = useCallback((d: Date) => {
    setSelected(d);
    setAnchor(d);
  }, []);
  const toToday = useCallback(() => select(today()), [select]);
  const moveDay = useCallback((n: number) => select(addDays(selected, n)), [select, selected]);

  const addEvent = useCallback(() => {
    setEditing(null);
    openScreen({ name: 'event' });
  }, [openScreen]);
  const editEvent = useCallback(
    (e: MyEvent) => {
      setEditing(e);
      openScreen({ name: 'event' });
    },
    [openScreen],
  );

  // keyboard: ← next day in Hebrew (RTL), → next day in English (LTR), PageUp/PageDown months, t = today, g = go to date, 1–5 tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') moveDay(isHe() ? 1 : -1);
      else if (e.key === 'ArrowRight') moveDay(isHe() ? -1 : 1);
      else if (e.key === 'ArrowDown' && tab !== 'settings') {
        e.preventDefault();
        moveDay(7);
      } else if (e.key === 'ArrowUp' && tab !== 'settings') {
        e.preventDefault();
        moveDay(-7);
      } else if (e.key === 'PageDown') setAnchor((a) => shiftMonth(a, 1, settings.monthMode));
      else if (e.key === 'PageUp') setAnchor((a) => shiftMonth(a, -1, settings.monthMode));
      else if (e.key === 't' || e.key === 'א') toToday();
      else if (e.key === 'g' || e.key === 'ע' || e.key === '/') {
        e.preventDefault();
        openScreen({ name: 'jump' });
      } else if (/^[1-5]$/.test(e.key)) showTab(TABS[+e.key - 1].id);
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, tab, moveDay, toToday, openScreen, showTab, settings.monthMode]);

  const jump = () => openScreen({ name: 'jump' });
  const location = () => openScreen({ name: 'location' });

  return (
    <div className={`app tab-${tab} ${screen ? 'has-screen' : ''}`}>
      <nav className="tabbar" aria-label={tr('ניווט ראשי', 'Main navigation')}>
        <div className="rail-brand">
          <BrandMark size={32} />
          <span>{APP_NAME}</span>
        </div>
        {TABS.map((t) => (
          <button key={t.id} className={`tabbtn ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => showTab(t.id)}>
            <Icon name={t.icon} size={24} />
            <span>{tabLabel(t.id)}</span>
          </button>
        ))}
      </nav>

      <main className="main" inert={screen ? true : undefined}>
        {tab === 'today' && (
          <TodayTab
            selected={selected}
            now={now}
            city={city}
            settings={settings}
            myEvents={myEvents}
            fmt={fmt}
            items={items}
            z={z}
            mine={mine}
            onSelect={select}
            onToday={toToday}
            onJump={jump}
            onLocation={location}
            onAddEvent={addEvent}
            onEditEvent={editEvent}
            onAllZmanim={() => showTab('zmanim')}
          />
        )}
        {tab === 'month' && (
          <MonthTab
            anchor={anchor}
            selected={selected}
            now={now}
            mode={settings.monthMode}
            city={city}
            settings={settings}
            myEvents={myEvents}
            fmt={fmt}
            onSelect={setSelected}
            onOpenDay={openDay}
            onMonth={(d) => setAnchor((a) => shiftMonth(a, d, settings.monthMode))}
            onMode={(m) => {
              // keep the month in view: the selected day if it's on this page, otherwise the middle of the page
              const { first, last } = monthBounds(anchor, settings.monthMode);
              const onPage = dateKey(selected) >= dateKey(first) && dateKey(selected) <= dateKey(last);
              setAnchor(onPage ? selected : addDays(first, Math.floor(daysBetween(first, last) / 2)));
              setSettings((s) => ({ ...s, monthMode: m }));
            }}
            onToday={toToday}
            onJump={jump}
          />
        )}
        {tab === 'zmanim' && (
          <ZmanimTab
            selected={selected}
            now={now}
            city={city}
            settings={settings}
            fmt={fmt}
            items={items}
            z={z}
            onSelect={select}
            onJump={jump}
            onLocation={location}
            onAlerts={(focus) => openScreen({ name: 'alerts', focus })}
            onFriday={() => openScreen({ name: 'notify' })}
            onSettings={() => showTab('settings')}
          />
        )}
        {tab === 'mine' && (
          <MineTab
            myEvents={myEvents}
            today={today()}
            onAdd={addEvent}
            onEdit={editEvent}
            onOpenDay={openDay}
            onAlerts={() => openScreen({ name: 'alerts' })}
            onBackup={() => {
              showTab('settings');
              setTimeout(() => document.getElementById('backup')?.scrollIntoView({ block: 'start' }), 50);
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
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
            onNotify={() => openScreen({ name: 'notify' })}
            onAlerts={() => openScreen({ name: 'alerts' })}
            onLocation={location}
          />
        )}
      </main>

      <Suspense fallback={null}>
      {screen?.name === 'notify' && <NotifyScreen city={city} settings={settings} onChange={setSettings} onClose={closeScreen} />}
      {screen?.name === 'alerts' && (
        <AlertsScreen
          city={city}
          settings={settings}
          myEvents={myEvents}
          focus={screen.focus}
          onChange={setSettings}
          onFriday={() => openScreen({ name: 'notify' })}
          onClose={closeScreen}
        />
      )}
      {screen?.name === 'location' && <LocationScreen city={city} settings={settings} onChange={setSettings} onClose={closeScreen} />}
      {screen?.name === 'jump' && <JumpScreen selected={selected} city={city} settings={settings} myEvents={myEvents} onGo={go} onClose={closeScreen} />}
      {screen?.name === 'event' && (
        <EventEditor
          initial={editing}
          date={selKey}
          onSave={(ev) => {
            setMyEvents((cur) => (cur.some((x) => x.id === ev.id) ? cur.map((x) => (x.id === ev.id ? ev : x)) : [...cur, ev]));
            closeScreen();
          }}
          onDelete={(id) => {
            setMyEvents((cur) => cur.filter((x) => x.id !== id));
            closeScreen();
          }}
          onClose={closeScreen}
        />
      )}
      </Suspense>
    </div>
  );
}
