/**
 * Sefirat HaOmer on היום: the 49 days as a field that fills as they are counted, the day's number
 * large, its sefira, and one action: "ספרתי". The words of the count and the blessing open in a sheet
 * (a tap on the number), the nusach and the reminders behind a quiet control. Before nightfall it
 * shows the day that is ending and when the next count begins, live.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HDate, sameDay, timeFmt } from '../../lib/cal';
import { isHe, tr } from '../../lib/i18n';
import {
  dayNumber,
  loadOmer,
  mark,
  omerCells,
  omerDayOf,
  omerNow,
  omerPrefs,
  omerStatus,
  saveOmer,
  sefira,
  tzeitOn,
  unmark,
  weeksText,
  type OmerNow,
  type OmerPrefs,
  type OmerState,
} from '../../lib/seasons/omer';
import { isNative, notificationPermission } from '../../lib/native';
import { countdown } from '../dayinfo';
import { Icon } from '../Icon';
import type { SeasonCardProps } from './index';
import { OmerField } from './OmerField';
import './omer.css';
import { CountSheet, SettingsSheet } from './OmerSheets';

/** The marks, kept in step with any other screen that changes them */
export function useOmerState() {
  const [st, setSt] = useState<OmerState>(loadOmer);
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent).detail === 'omer' && setSt(loadOmer());
    window.addEventListener('luachi:season-state', on);
    return () => window.removeEventListener('luachi:season-state', on);
  }, []);
  const save = (next: OmerState) => {
    setSt(next);
    saveOmer(next);
  };
  return [st, save] as const;
}

const Check = () => (
  <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export default function OmerCard({ day, now, city, settings, setPrefs }: SeasonCardProps) {
  const prefs = omerPrefs(settings.seasons?.omer);
  const set = (p: Partial<OmerPrefs>) => setPrefs(p as Record<string, unknown>);
  const [st, save] = useOmerState();
  const [sheet, setSheet] = useState<null | 'count' | 'settings'>(null);
  const [just, setJust] = useState(0); // the moment of the last count: the cell fills, the ribbon settles
  const fmt = useMemo(() => timeFmt(city.tz), [city.tz]);
  const il = city.il;

  // the count of this moment (it turns at nightfall), recomputed once a minute
  const minute = Math.floor(now.getTime() / 60000);
  const real = useMemo(() => omerNow(now, city, settings), [minute, city, settings.useElevation]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = sameDay(day, now);
  // another day: that day's own count (15 Nisan: the count begins that evening)
  const shown: OmerNow = useMemo(
    () => (live ? real : { year: new HDate(day).getFullYear(), n: omerDayOf(day), phase: 'day', next: tzeitOn(day, city, settings) }),
    [live, real, day.getTime(), city, settings.useElevation], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const status = omerStatus(st, shown, il);
  // the field is always as of now (what was counted so far), with the ribbon on the day shown
  const sameSeason = shown.year === real.year;
  const cells = sameSeason ? omerCells(st, real.year, real.n, il) : omerCells(st, shown.year, shown.n, il);
  const n = shown.n === 50 ? 49 : shown.n;

  const count = () => {
    if (real.n < 1 || real.n > 49) return;
    save(mark(st, real.year, real.n, real.phase, Date.now()));
    setJust(Date.now());
    // a phone with reminders on and no answer yet about notifications: ask, once, at the moment it makes sense
    if (isNative() && prefs.remind)
      notificationPermission(false)
        .then((p) => (p === 'prompt' ? notificationPermission(true) : p))
        .catch(() => {});
  };
  const toggle = (k: number) => {
    const counted = cells[k - 1] === 'counted' || cells[k - 1] === 'byDay';
    save(counted ? unmark(st, real.year, k) : mark(st, real.year, k, 'night', Date.now()));
    if (!counted) setJust(Date.now());
  };
  const undo = () => {
    save(unmark(st, real.year, real.n));
    setJust(0);
  };
  const recent = just > 0 && now.getTime() - just < 8000;

  /* ----- the day ----- */
  const before = status.kind === 'before';
  const big = dayNumber(before ? 1 : n);
  const line1 = sefira(before ? 1 : n);
  const line2 = before ? tr('הלילה, ליל שני של פסח', 'Tonight, the second night of Pesach') : weeksText(n);

  /* ----- what to do now ----- */
  const t = now.getTime();
  // the next count hours away: a live countdown; tomorrow evening: just its time
  const nextIn = (at: Date) => {
    const ms = at.getTime() - t;
    return ms > 12 * 3600000 ? tr(`מחר בערב, ${fmt.format(at)}`, `tomorrow evening, ${fmt.format(at)}`) : tr(`בעוד ${countdown(ms)}`, `in ${countdown(ms)}`);
  };

  let foot: ReactNode = null;
  if (!live) foot = null;
  else if (status.kind === 'before')
    foot = (
      <p className="om-when">
        {tr(`הספירה הראשונה ${nextIn(status.at)}`, `The first count ${nextIn(status.at)}`)} · {fmt.format(status.at)}
      </p>
    );
  else if (status.kind === 'due')
    foot = (
      <>
        {status.byDay && <p className="om-hint">{tr('לא ספרתם אמש? אפשר לספור עכשיו, בלי ברכה', 'Missed last night? Count now, without a blessing')}</p>}
        {!status.byDay && !status.bless && <p className="om-hint">{tr('הלילה ממשיכים לספור בלי ברכה', 'Tonight, continue without a blessing')}</p>}
        <div className="om-acts">
          <button className="primary om-go" onClick={count}>
            {status.byDay ? tr('ספרתי היום', 'Counted today') : tr('ספרתי', 'Counted')}
          </button>
          <button className="text-btn" onClick={() => setSheet('count')}>
            {status.bless ? tr('הברכה והנוסח', 'Blessing & text') : tr('הנוסח', 'The text')}
          </button>
        </div>
        {status.byDay && <p className="om-when">{tr(`הספירה הבאה ${nextIn(real.next)}, בברכה`, `Next count ${nextIn(real.next)}, with a blessing`)}</p>}
      </>
    );
  else if (status.kind === 'done')
    foot = (
      <>
        <div className="om-acts">
          <p className="om-done">
            <Check />
            {status.how === 'day' ? tr('ספרתם היום', 'Counted today') : tr('ספרתם', 'Counted')}
          </p>
          {recent ? (
            <button className="text-btn" onClick={undo}>
              {tr('ביטול', 'Undo')}
            </button>
          ) : (
            <button className="text-btn" onClick={() => setSheet('count')}>
              {tr('הנוסח', 'The text')}
            </button>
          )}
        </div>
        {status.next && (
          <p className="om-when">
            {tr(`הספירה הבאה ${nextIn(status.next)}`, `Next count ${nextIn(status.next)}`)}
            {!status.blessNext && tr(', בלי ברכה', ', without a blessing')}
          </p>
        )}
      </>
    );
  else
    foot = (
      <p className="om-when">
        {status.tracked ? tr(`ספרתם ${status.counted} מתוך 49 ימים`, `You counted ${status.counted} of 49 days`) : tr('49 ימים, עד שבועות', '49 days, to Shavuot')}
      </p>
    );

  const due = live && status.kind === 'due';
  const fieldCells = before && sameSeason ? cells.map((c, i) => (i === 0 ? 'due' : c)) : cells;
  return (
    <section className={`omer card ${due ? 'is-due' : ''}`} aria-label={tr('ספירת העומר', 'Sefirat HaOmer')}>
      <header className="om-head">
        <span className="eyebrow">{tr('ספירת העומר', 'Sefirat HaOmer')}</span>
        <button className="icon-btn sm om-more" onClick={() => setSheet('settings')} aria-label={tr('נוסח ותזכורות', 'Nusach & reminders')}>
          <Icon name="tabSettings" size={18} />
        </button>
      </header>

      <div className="om-body">
        <button className="om-day" onClick={() => setSheet('count')} disabled={before} aria-label={tr(`${line1}. הנוסח המלא`, `${line1}. The full text`)}>
          <span className={`om-num ${isHe() ? 'heb' : ''}`} key={big}>
            {big}
          </span>
          <span className="om-sefira">{line1}</span>
          <span className="om-weeks">{line2}</span>
        </button>
        <OmerField
          cells={fieldCells}
          current={status.kind === 'after' ? 0 : before ? 1 : n}
          week={before || status.kind === 'after' ? 0 : Math.floor((n - 1) / 7) + 1}
          onCell={sameSeason && real.n >= 1 ? toggle : undefined}
          nudge={just}
          live={live}
        />
      </div>

      {foot && <footer className="om-foot">{foot}</footer>}

      {sheet === 'count' && n >= 1 && (
        <CountSheet
          n={n}
          prefs={prefs}
          setPrefs={set}
          bless={status.kind === 'due' ? status.bless : status.kind === 'done' ? status.how === 'night' && status.blessNext : true}
          byDay={status.kind === 'due' && status.byDay}
          due={due}
          onCount={count}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && <SettingsSheet prefs={prefs} setPrefs={set} onClose={() => setSheet(null)} />}
    </section>
  );
}
