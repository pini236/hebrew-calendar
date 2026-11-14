import { addDays, dateKey, rangeItems, timeFmt, type DayItem } from './cal';
import type { City } from './cities';
import type { Settings } from './store';

export interface ShabbatAlert {
  friday: Date;
  title: string;
  candles: Date;
  havdalah: Date;
  havdalahDay: Date;
}

/** Every Shabbat from `from` for `weeks` weeks, with candle-lighting and the following havdalah */
export function shabbatAlerts(from: Date, weeks: number, city: City, s: Settings): ShabbatAlert[] {
  const firstFri = addDays(from, (5 - from.getDay() + 7) % 7);
  const end = addDays(firstFri, weeks * 7 + 4);
  const map = rangeItems(firstFri, end, city, s, false);
  const get = (d: Date): DayItem[] => map.get(dateKey(d)) ?? [];
  const out: ShabbatAlert[] = [];
  for (let w = 0; w < weeks; w++) {
    const fri = addDays(firstFri, w * 7);
    const sat = addDays(fri, 1);
    const candles = get(fri).find((i) => i.kind === 'candles')?.time;
    if (!candles) continue;
    // havdalah is normally on Shabbat; if a yom tov follows, it comes a day or two later
    let havdalah: Date | undefined;
    let havdalahDay = sat;
    for (let k = 1; k <= 3 && !havdalah; k++) {
      const d = addDays(fri, k);
      havdalah = get(d).find((i) => i.kind === 'havdalah')?.time;
      havdalahDay = d;
    }
    if (!havdalah) continue;
    const satItems = get(sat);
    const name =
      satItems.find((i) => i.kind === 'yomtov')?.title ??
      satItems.find((i) => i.kind === 'cholhamoed')?.title ??
      satItems.find((i) => i.kind === 'parasha')?.title ??
      'שבת';
    out.push({ friday: fri, title: name.startsWith('פרשת') ? `שבת ${name}` : name, candles, havdalah, havdalahDay });
  }
  return out;
}

export function alertText(a: ShabbatAlert, city: City) {
  const f = timeFmt(city.tz);
  const late = a.havdalahDay.getDay() !== 6 ? ` (ביום ${['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][a.havdalahDay.getDay()]})` : '';
  return {
    summary: `🕯️ ${a.title} · כניסה ${f.format(a.candles)} · יציאה ${f.format(a.havdalah)}${late}`,
    body: `${a.title} ב${city.name}\nהדלקת נרות: ${f.format(a.candles)}\nצאת השבת: ${f.format(a.havdalah)}${late}\n\nנשלח מלוח עברי`,
  };
}

/** Notifications for the native apps: Friday at `time` (phone's local time) */
export function nativeAlerts(alerts: ShabbatAlert[], city: City, time: string) {
  const [hh, mm] = time.split(':').map(Number);
  const f = timeFmt(city.tz);
  return alerts.map((a) => {
    const late = a.havdalahDay.getDay() !== 6 ? ` (ביום ${['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][a.havdalahDay.getDay()]})` : '';
    return {
      id: Number(dateKey(a.friday).replace(/-/g, '')),
      at: new Date(a.friday.getFullYear(), a.friday.getMonth(), a.friday.getDate(), hh, mm),
      title: `🕯️ ${a.title}`,
      body: `כניסה ${f.format(a.candles)} · יציאה ${f.format(a.havdalah)}${late} · ${city.name}`,
    };
  });
}

/* ---------- iCalendar ---------- */

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Fold lines at 75 octets (RFC 5545), never splitting a UTF-8 character */
function fold(line: string) {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date, hh: number, mm: number) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * One short calendar event every Friday at `time` (the phone's local time),
 * with an alarm at the event's start, so the phone itself shows the notification.
 */
export function buildShabbatIcs(alerts: ShabbatAlert[], city: City, time: string) {
  const [hh, mm] = time.split(':').map(Number);
  const stamp = utc(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LuachIvri//Shabbat alerts//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:זמני שבת — לוח עברי'];
  for (const a of alerts) {
    const { summary, body } = alertText(a, city);
    const start = local(a.friday, hh, mm);
    const endD = new Date(a.friday.getFullYear(), a.friday.getMonth(), a.friday.getDate(), hh, mm + 15);
    lines.push(
      'BEGIN:VEVENT',
      `UID:luachi-shabbat-${dateKey(a.friday)}@luachi.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${local(endD, endD.getHours(), endD.getMinutes())}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(body)}`,
      `LOCATION:${esc(city.name)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
