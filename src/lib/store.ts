import { useCallback, useEffect, useState } from 'react';
import type { City } from './cities';

export type HavdalahOpinion = 'deg8.5' | 'min42' | 'min50' | 'min72';
export type Theme = 'auto' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';

export interface Settings {
  cityId: string;
  /** a location from GPS (overrides cityId when set) */
  gps: City | null;
  /** null = use the city's custom */
  candleMins: number | null;
  havdalah: HavdalahOpinion;
  useElevation: boolean;
  showLearning: boolean;
  showModern: boolean;
  theme: Theme;
  /** 2 = saved after light became the default (an older 'auto' was never a choice) */
  themeV?: number;
  monthMode: 'greg' | 'heb';
  /** Friday alert time HH:MM (phone local time) */
  alertTime: string;
  alertWeeks: number;
  /** native apps: Friday notifications switched on */
  nativeAlerts: boolean;
  /** a place picked from the worldwide search (overrides cityId; GPS overrides it) */
  place: City | null;
  /** the last places picked, newest first (max 5) */
  recentPlaces: City[];
  textSize: TextSize;
  highContrast: boolean;
  /** native apps: zman id → minutes before it to notify (a missing id = off) */
  zmanAlerts: Record<string, number>;
  /** native apps: reminder before candle lighting (Shabbat and Yom Tov) */
  candleAlert: boolean;
  candleAlertMins: number;
  /** native apps: notification at the end of Shabbat / Yom Tov */
  havdalahAlert: boolean;
  /** native apps: notifications for the start and the end of fasts */
  fastAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cityId: 'jerusalem',
  gps: null,
  candleMins: null,
  havdalah: 'deg8.5',
  useElevation: false,
  showLearning: true,
  showModern: true,
  theme: 'light',
  themeV: 2,
  monthMode: 'greg',
  alertTime: '08:00',
  alertWeeks: 52,
  nativeAlerts: false,
  place: null,
  recentPlaces: [],
  textSize: 'normal',
  highContrast: false,
  zmanAlerts: {},
  candleAlert: false,
  candleAlertMins: 30,
  havdalahAlert: false,
  fastAlerts: false,
};

export type Repeat = 'none' | 'heb-yearly' | 'greg-yearly';
/** reminder for a personal event: on the day, the evening before, or a week before */
export type Remind = 'none' | 'day' | 'eve' | 'week';

export interface MyEvent {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd of the original Gregorian date */
  date: string;
  repeat: Repeat;
  color: string;
  note?: string;
  time?: string;
  /** the event happened after sunset, so its Hebrew date is that of the next day */
  afterSunset?: boolean;
  remind?: Remind;
  /** HH:MM, phone local time, for the reminder */
  remindTime?: string;
}

export const REMIND_DEFAULT_TIME: Record<Exclude<Remind, 'none'>, string> = { day: '08:00', eve: '20:00', week: '08:00' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode etc.) — keep working in memory */
  }
}

export function usePersistent<T>(key: string, fallback: T, merge?: (stored: T) => T) {
  const [value, setValue] = useState<T>(() => {
    const v = read(key, fallback);
    return merge ? merge(v) : v;
  });
  useEffect(() => write(key, value), [key, value]);
  const update = useCallback((v: T | ((prev: T) => T)) => setValue(v), []);
  return [value, update] as const;
}

export const SETTINGS_KEY = 'luach.settings.v1';
export const EVENTS_KEY = 'luach.events.v1';

const isCity = (c: unknown): c is City => {
  const x = c as City;
  return !!x && typeof x === 'object' && typeof x.name === 'string' && Number.isFinite(x.lat) && Number.isFinite(x.lon) && typeof x.tz === 'string';
};

/** Saved settings from any earlier version, filled up with the current defaults */
export function mergeSettings(s: Partial<Settings>): Settings {
  const m: Settings = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  // light is the default since themeV 2: an 'auto' saved before then was the old default, not a choice
  if (!(s && typeof s === 'object' && s.themeV === 2)) {
    if (m.theme === 'auto') m.theme = 'light';
    m.themeV = 2;
  }
  if (!['auto', 'light', 'dark'].includes(m.theme)) m.theme = 'light';
  if (!isCity(m.gps)) m.gps = null;
  if (!isCity(m.place)) m.place = null;
  m.recentPlaces = Array.isArray(m.recentPlaces) ? m.recentPlaces.filter(isCity).slice(0, 5) : [];
  if (!['normal', 'large', 'xlarge'].includes(m.textSize)) m.textSize = 'normal';
  if (!m.zmanAlerts || typeof m.zmanAlerts !== 'object' || Array.isArray(m.zmanAlerts)) m.zmanAlerts = {};
  if (!Number.isFinite(m.candleAlertMins)) m.candleAlertMins = DEFAULT_SETTINGS.candleAlertMins;
  return m;
}

export const EVENT_COLORS = ['#e0793c', '#3f8f6b', '#4a6fd1', '#b5487a', '#8a6ad6', '#c49a2c'];

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
