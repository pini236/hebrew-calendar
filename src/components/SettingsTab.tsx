import { useRef, useState } from 'react';
import type { City } from '../lib/cities';
import type { MyEvent, Settings } from '../lib/store';
import { BrandMark, Icon } from './Icon';
import { APP_NAME } from '../lib/brand';
import { isNative, shareTextFile } from '../lib/native';
import { isHe, plural, tr } from '../lib/i18n';

interface Props {
  settings: Settings;
  city: City;
  myEvents: MyEvent[];
  onChange: (s: Settings) => void;
  onImport: (list: MyEvent[]) => void;
  onNotify: () => void;
  onAlerts: () => void;
  onLocation: () => void;
}

export function SettingsTab({ settings, city, myEvents, onChange, onImport, onNotify, onAlerts, onLocation }: Props) {
  const [ioMsg, setIoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const nEvents = (n: number) => `${n} ${plural(n, 'event', 'events')}`;

  const exportEvents = async () => {
    const data = JSON.stringify({ app: 'luach', version: 1, events: myEvents }, null, 2);
    if (isNative()) {
      try {
        await shareTextFile('luach-ivri-backup.json', data, tr('גיבוי האירועים שלי', 'My events backup'));
        setIoMsg(tr(`נשמרו ${myEvents.length} אירועים. שמרו את הקובץ בדרייב, במייל או בוואטסאפ.`, `Saved ${nEvents(myEvents.length)}. Keep the file in Drive, email or WhatsApp.`));
      } catch {
        setIoMsg(tr('הייצוא בוטל.', 'Export canceled.'));
      }
      return;
    }
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'luach-events.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setIoMsg(tr(`יוצאו ${myEvents.length} אירועים לקובץ.`, `Exported ${nEvents(myEvents.length)} to a file.`));
    } catch {
      setIoMsg(tr('הייצוא נכשל.', 'Export failed.'));
    }
  };

  const importEvents = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const evs: MyEvent[] = Array.isArray(j) ? j : j.events;
      if (!Array.isArray(evs)) throw new Error();
      const ok = evs.filter((e) => e && typeof e.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
      onImport(ok);
      setIoMsg(tr(`יובאו ${ok.length} אירועים.`, `Imported ${nEvents(ok.length)}.`));
    } catch {
      setIoMsg(tr('הקובץ לא נקרא. בחרו קובץ גיבוי שנוצר בייצוא מהאפליקציה.', "Couldn't read the file. Choose a backup file exported from the app."));
    }
  };

  return (
    <div className="tab settings-tab">
      <header className="tab-head">
        <h1 className="tab-title">{tr('הגדרות', 'Settings')}</h1>
      </header>

      <div className="settings-cols">
        <div>
          <section className="set-group" aria-labelledby="sg-place">
            <h3 className="group-label" id="sg-place">{tr('מיקום', 'Location')}</h3>
            <ul className="list card-list">
              <li>
                <button className="link-row" onClick={onLocation}>
                  <Icon name={city.id === 'gps' ? 'locate' : 'pin'} size={18} />
                  <span>{city.name}</span>
                  <Icon name="next" size={16} />
                </button>
              </li>
            </ul>
          </section>

          <section className="set-group" aria-labelledby="sg-alerts">
            <h3 className="group-label" id="sg-alerts">{tr('התראות', 'Alerts')}</h3>
            <ul className="list card-list">
              <li>
                <button className="link-row" onClick={onAlerts}>
                  <Icon name="bell" size={18} />
                  <span>{tr('התראות', 'Alerts')}</span>
                  <Icon name="next" size={16} />
                </button>
              </li>
              <li>
                <button className="link-row" onClick={onNotify}>
                  <Icon name="candle" size={18} />
                  <span>{tr('התראה בכל יום שישי', 'Every Friday alert')}</span>
                  <Icon name="next" size={16} />
                </button>
              </li>
            </ul>
          </section>

          <section className="set-group" aria-labelledby="sg-shabbat">
            <h3 className="group-label" id="sg-shabbat">{tr('שבת וחג', 'Shabbat & holidays')}</h3>
            <div className="card-list form-list">
              <label className="field">
                <span>{tr('הדלקת נרות', 'Candle lighting')}</span>
                <select id="set-candle" value={settings.candleMins ?? ''} onChange={(e) => set({ candleMins: e.target.value === '' ? null : +e.target.value })}>
                  <option value="">{tr(`מנהג העיר (${city.candle} דק׳)`, `Local (${city.candle} min)`)}</option>
                  {[15, 18, 20, 22, 24, 30, 40].map((m) => (
                    <option key={m} value={m}>
                      {tr(`${m} דק׳ לפני השקיעה`, `${m} min before sunset`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{tr('צאת שבת', 'End of Shabbat')}</span>
                <select id="set-havdalah" value={settings.havdalah} onChange={(e) => set({ havdalah: e.target.value as Settings['havdalah'] })}>
                  <option value="deg8.5">{tr('צאת הכוכבים (8.5°)', 'Nightfall (8.5°)')}</option>
                  <option value="min42">{tr('42 דקות אחרי השקיעה', '42 min after sunset')}</option>
                  <option value="min50">{tr('50 דקות אחרי השקיעה', '50 min after sunset')}</option>
                  <option value="min72">{tr('רבנו תם (72 דקות)', 'Rabbeinu Tam (72 min)')}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="set-group" aria-labelledby="sg-cal">
            <h3 className="group-label" id="sg-cal">{tr('לוח וזמנים', 'Calendar & zmanim')}</h3>
            <div className="card-list form-list">
              <Toggle
                id="set-elev"
                label={tr('זריחה ושקיעה לפי גובה המקום', 'Sunrise and sunset by elevation')}
                on={settings.useElevation} onChange={(v) => set({ useElevation: v })} />
              <Toggle
                id="set-learn"
                label={tr('לימוד יומי', 'Daily learning')}
                on={settings.showLearning} onChange={(v) => set({ showLearning: v })} />
              <Toggle id="set-modern" label={tr('ימי זיכרון ומועדים ממלכתיים', 'Israeli national days')} on={settings.showModern} onChange={(v) => set({ showModern: v })} />
            </div>
          </section>
        </div>

        <div>
          <section className="set-group" aria-labelledby="sg-look">
            <h3 className="group-label" id="sg-look">{tr('תצוגה וקריאות', 'Display & readability')}</h3>
            <div className="card-list form-list">
              <div className="field stack">
                <span id="lbl-text-size">{tr('גודל טקסט', 'Text size')}</span>
                <div className="seg" role="group" aria-labelledby="lbl-text-size">
                  {(
                    [
                      ['normal', tr('רגיל', 'Normal')],
                      ['large', tr('גדול', 'Large')],
                      ['xlarge', tr('גדול מאוד', 'Extra large')],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} className={settings.textSize === k ? 'on' : ''} aria-pressed={settings.textSize === k} onClick={() => set({ textSize: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field stack">
                <span id="lbl-theme">{tr('ערכת צבעים', 'Color scheme')}</span>
                <div className="seg" role="group" aria-labelledby="lbl-theme">
                  {(
                    [
                      ['light', tr('בהירה', 'Light')],
                      ['dark', tr('כהה', 'Dark')],
                      ['auto', tr('כמו הטלפון', 'Like phone')],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} className={settings.theme === k ? 'on' : ''} aria-pressed={settings.theme === k} onClick={() => set({ theme: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field stack">
                <span id="lbl-lang">{tr('שפה', 'Language')}</span>
                <div className="seg" role="group" aria-labelledby="lbl-lang">
                  {(
                    [
                      ['he', 'עברית'],
                      ['en', 'English'],
                      ['auto', tr('לפי הטלפון', 'Phone language')],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      className={settings.lang === k ? 'on' : ''}
                      aria-pressed={settings.lang === k}
                      lang={k === 'he' ? 'he' : k === 'en' ? 'en' : undefined}
                      onClick={() => set({ lang: k })}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle
                id="set-contrast"
                label={tr('ניגודיות גבוהה', 'High contrast')}
                on={settings.highContrast} onChange={(v) => set({ highContrast: v })} />
            </div>
          </section>

          <section className="set-group" aria-labelledby="sg-backup" id="backup">
            <h3 className="group-label" id="sg-backup">{tr('גיבוי', 'Backup')}</h3>
            <div className="card-list form-list">
              <div className="row-btns">
                <button className="btn" onClick={exportEvents}>
                  <Icon name="download" size={18} /> {tr('ייצוא', 'Export')} ({myEvents.length})
                </button>
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={18} /> {tr('ייבוא מקובץ', 'Import file')}
                </button>
                <input
                  ref={fileRef}
                  id="import-file"
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importEvents(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {ioMsg && (
                <p className="fine" role="status">
                  {ioMsg}
                </p>
              )}
            </div>
          </section>

          <div className="about">
            <BrandMark size={40} />
            <div>
              <b>{APP_NAME}</b>
              <p className="fine keys">
                {isHe() ? (
                  <>
                    מקלדת: <kbd>←</kbd> <kbd>→</kbd> ימים · <kbd>PgUp</kbd> <kbd>PgDn</kbd> חודשים · <kbd>T</kbd> היום · <kbd>G</kbd> מעבר לתאריך · <kbd>1</kbd>–<kbd>5</kbd> לשוניות
                  </>
                ) : (
                  <>
                    Keyboard: <kbd>←</kbd> <kbd>→</kbd> days · <kbd>PgUp</kbd> <kbd>PgDn</kbd> months · <kbd>T</kbd> today · <kbd>G</kbd> go to date · <kbd>1</kbd>–<kbd>5</kbd> tabs
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ id, label, sub, on, onChange }: { id: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        {label}
        {sub && <small className="sub">{sub}</small>}
      </span>
      <input id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
