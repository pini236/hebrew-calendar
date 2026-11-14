import { useCallback, useEffect, useState } from 'react';
import type { City } from './cities';

export type HavdalahOpinion = 'deg8.5' | 'min42' | 'min50' | 'min72';
export type Theme = 'auto' | 'light' | 'dark';

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
  monthMode: 'greg' | 'heb';
  /** Friday alert time HH:MM (phone local time) */
  alertTime: string;
  alertWeeks: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cityId: 'jerusalem',
  gps: null,
  candleMins: null,
  havdalah: 'deg8.5',
  useElevation: false,
  showLearning: true,
  showModern: true,
  theme: 'auto',
  monthMode: 'greg',
  alertTime: '08:00',
  alertWeeks: 52,
};

export type Repeat = 'none' | 'heb-yearly' | 'greg-yearly';

export interface MyEvent {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd of the original Gregorian date */
  date: string;
  repeat: Repeat;
  color: string;
  note?: string;
  time?: string;
}

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

export function mergeSettings(s: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export const EVENT_COLORS = ['#e0793c', '#3f8f6b', '#4a6fd1', '#b5487a', '#8a6ad6', '#c49a2c'];

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
