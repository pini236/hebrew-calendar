/**
 * The Omer card's two sheets, rising from the bottom over Today: the count itself (the blessing, the
 * day's count in the chosen nusach, the sefira) and the card's small settings (nusach, reminders).
 * Back gesture, Escape and a tap outside close them.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gematriya } from '@hebcal/core';
import { isHe, tr } from '../../lib/i18n';
import { isNative, notificationPermission, requestOpen } from '../../lib/native';
import {
  BLESSING,
  BLESSING_EN,
  BLESSING_TRANSLIT,
  NUSACH_NAMES,
  OMER_OFFSETS,
  countEnglish,
  countText,
  countTranslit,
  sefiraMeaning,
  sefiraNiqqud,
  type Nusach,
  type OmerPrefs,
} from '../../lib/seasons/omer';
import { Icon } from '../Icon';

/* ---------------- a sheet ---------------- */

type Close = (then?: () => void) => void;

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode | ((close: Close) => ReactNode) }) {
  const ref = useRef<HTMLDivElement>(null);
  const then = useRef<(() => void) | null>(null);
  const done = useRef(() => {
    onClose();
    const t = then.current;
    then.current = null;
    t?.();
  });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    // one history entry, so the phone's back gesture closes the sheet and not the app
    try {
      if (!history.state?.luachSheet) history.pushState({ luachSheet: true }, '');
    } catch {
      /* sandboxed preview */
    }
    const onPop = () => done.current();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close: Close = (after) => {
    then.current = after ?? null;
    setLeaving(true);
    window.setTimeout(() => {
      if (history.state?.luachSheet) history.back();
      else done.current();
    }, 180);
  };
  return (
    <div className={`om-sheet-wrap ${leaving ? 'leaving' : ''}`} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="om-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="om-sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={() => close()} aria-label={tr('סגירה', 'Close')}>
            <Icon name="close" size={20} />
          </button>
        </header>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  );
}

export function NusachPicker({ value, onChange }: { value: Nusach; onChange: (n: Nusach) => void }) {
  return (
    <div className="seg small om-nusach" role="radiogroup" aria-label={tr('נוסח', 'Nusach')}>
      {(['ashkenaz', 'sefard', 'edot'] as Nusach[]).map((n) => (
        <button key={n} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>
          {NUSACH_NAMES[n]()}
        </button>
      ))}
    </div>
  );
}

/* ---------------- the count ---------------- */

export interface CountSheetProps {
  n: number;
  prefs: OmerPrefs;
  setPrefs: (p: Partial<OmerPrefs>) => void;
  /** say the blessing tonight */
  bless: boolean;
  /** the night was missed: count by day */
  byDay: boolean;
  /** the count is due (show the action) */
  due: boolean;
  onCount: () => void;
  onClose: () => void;
}

export function CountSheet({ n, prefs, setPrefs, bless, byDay, due, onCount, onClose }: CountSheetProps) {
  const he = isHe();
  return (
    <Sheet title={tr(`ספירת העומר · ${gematriya(n)}`, `Sefirat HaOmer · day ${n}`)} onClose={onClose}>
      {(close) => (
      <>
      <NusachPicker value={prefs.nusach} onChange={(nusach) => setPrefs({ nusach })} />
      {!bless && (
        <p className="om-why">
          {byDay
            ? tr(
                'לא ספרתם אמש? סופרים היום בלי ברכה, ובלילה ממשיכים לספור בברכה. כך נוהגים, ובכל ספק כדאי לשאול רב.',
                'Missed last night? Count today without a blessing, and tonight continue with one. That is the common practice; ask a rabbi when in doubt.',
              )
            : tr(
                'יום שלם נשאר בלי ספירה, ולכן ממשיכים לספור בלי ברכה. כך נוהגים, ובכל ספק כדאי לשאול רב. ספרתם ביום שלא סימנתם? סמנו אותו בלוח.',
                'A whole day went uncounted, so the count continues without a blessing. That is the common practice; ask a rabbi when in doubt. Counted on a day you did not mark? Mark it on the field.',
              )}
        </p>
      )}
      <div className="om-text" lang="he" dir="rtl">
        {bless && <p className="om-bless">{BLESSING}</p>}
        <p className="om-count">{countText(n, prefs.nusach)}</p>
        <p className="om-sef">{sefiraNiqqud(n)}</p>
      </div>
      {!he && (
        <div className="om-latin">
          {bless && (
            <p>
              <i>{BLESSING_TRANSLIT}</i>
              <span>{BLESSING_EN}</span>
            </p>
          )}
          <p>
            <i>{countTranslit(n, prefs.nusach)}</i>
            <span>{countEnglish(n)}</span>
          </p>
          <p>
            <span>{sefiraMeaning(n)}</span>
          </p>
        </div>
      )}
      {due && (
        <button className="primary om-sheet-act" onClick={() => close(onCount)}>
          {byDay ? tr('ספרתי היום', 'Counted today') : tr('ספרתי', 'Counted')}
        </button>
      )}
      </>
      )}
    </Sheet>
  );
}

/* ---------------- the card's settings ---------------- */

export function SettingsSheet({ prefs, setPrefs, onClose }: { prefs: OmerPrefs; setPrefs: (p: Partial<OmerPrefs>) => void; onClose: () => void }) {
  const native = isNative();
  // turning a reminder on asks for notification permission (only then, never on its own)
  const turnOn = (p: Partial<OmerPrefs>) => {
    setPrefs(p);
    if (native && Object.values(p).includes(true)) notificationPermission(true).catch(() => {});
  };
  const after = (m: number) => (m === 0 ? tr('בצאת הכוכבים', 'At nightfall') : tr(`${m} דק׳ אחרי צאת הכוכבים`, `${m} min after nightfall`));
  return (
    <Sheet title={tr('ספירת העומר', 'Sefirat HaOmer')} onClose={onClose}>
      {(close) => (
      <div className="om-set">
        <h3>{tr('נוסח', 'Nusach')}</h3>
        <NusachPicker value={prefs.nusach} onChange={(nusach) => setPrefs({ nusach })} />

        <h3>{tr('תזכורות', 'Reminders')}</h3>
        {native ? (
          <div className="plain">
            <div className="om-set-row">
              <label className="toggle">
                <span>{tr('בכל ערב', 'Every evening')}</span>
                <input type="checkbox" checked={prefs.remind} onChange={(e) => turnOn({ remind: e.target.checked })} />
                <i />
              </label>
              <select value={prefs.offset} disabled={!prefs.remind} onChange={(e) => setPrefs({ offset: +e.target.value })} aria-label={tr('מתי', 'When')}>
                {OMER_OFFSETS.map((m) => (
                  <option key={m} value={m}>
                    {after(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="om-set-row">
              <label className="toggle">
                <span>{tr('לפני השינה, אם עוד לא ספרתם', 'At bedtime, if not counted yet')}</span>
                <input type="checkbox" checked={prefs.bedtime} onChange={(e) => turnOn({ bedtime: e.target.checked })} />
                <i />
              </label>
              <input type="time" value={prefs.bedtimeAt} disabled={!prefs.bedtime} onChange={(e) => e.target.value && setPrefs({ bedtimeAt: e.target.value })} aria-label={tr('שעה', 'Time')} />
            </div>
            <div className="om-set-row">
              <label className="toggle">
                <span>{tr('בבוקר, אם הלילה עבר בלי ספירה', 'In the morning, if the night was missed')}</span>
                <input type="checkbox" checked={prefs.morning} onChange={(e) => turnOn({ morning: e.target.checked })} />
                <i />
              </label>
              <input type="time" value={prefs.morningAt} disabled={!prefs.morning} onChange={(e) => e.target.value && setPrefs({ morningAt: e.target.value })} aria-label={tr('שעה', 'Time')} />
            </div>
          </div>
        ) : (
          <p className="fine">{tr('התזכורות נשלחות באפליקציה לאנדרואיד ולאייפון', 'Reminders come with the Android and iPhone apps')}</p>
        )}
        {native && (
          <p className="fine">
            {tr(
              'התזכורת לפני השינה ובבוקר נשלחת רק אם סימנתם כאן ״ספרתי״. אין תזכורות בשבת ובחג.',
              'The bedtime and morning reminders come only if you mark “Counted” here. None on Shabbat and Yom Tov.',
            )}
          </p>
        )}
        <button className="link-row om-set-link" onClick={() => close(() => requestOpen('omer-intro'))}>
          <Icon name="info" />
          <span>{tr('על הספירה, והווידג׳ט למסך הבית', 'About the count, and the home-screen widget')}</span>
          <Icon name="next" size={16} />
        </button>
      </div>
      )}
    </Sheet>
  );
}
