/**
 * The seasons engine: times of the year that get their own experience in the app (Sefirat HaOmer,
 * Chanukah, and more to come: the Ten Days of Repentance, fasts, Kiddush Levana…).
 *
 * A season is pure logic here (no React, no Capacitor), so it can be unit-tested:
 *   - when it shows (`activeOn`), and when to announce it beforehand (`announce`)
 *   - its notifications, in the 'season' id range, slots `slot0`..`slot0 + 19` per day
 *   - its own preferences, stored under settings.seasons[id] (any JSON the season defines)
 *   - its own state (e.g. "counted tonight"), stored by the season in localStorage under SEASON_STATE_KEY(id)
 * Its card on היום (and any screen of its own) lives in src/components/seasons/ and is registered in
 * src/components/seasons/index.ts by the same id. The live sky can show a season's touch through
 * `skyDecor` (e.g. the lit Chanukah candles in a window).
 *
 * To add a season: write src/lib/seasons/<id>.ts exporting a Season, add it to SEASONS below, and its
 * card to src/components/seasons/index.ts.
 */
import type { City } from './cities';
import type { Settings } from './store';
import type { PlannedNotification } from './alerts';

export type SeasonId = 'omer' | 'chanukah';

export interface SeasonContext {
  city: City;
  settings: Settings;
  /** the season's own preferences (settings.seasons[id]), merged with its defaults */
  prefs: Record<string, unknown>;
}

/** What the live sky draws for a season at a moment (all optional) */
export interface SkyDecor {
  /** Chanukah: how many candles burn tonight (1–8), the shamash included separately */
  chanukahCandles?: number;
}

export interface Season {
  id: SeasonId;
  /** short name, in the interface language (call at render time) */
  name(): string;
  /** default preferences, merged under settings.seasons[id] */
  defaults: Record<string, unknown>;
  /** the season shows on this (local, noon-pinned) day */
  activeOn(day: Date, ctx: SeasonContext): boolean;
  /** notifications from `from` for `days` days, after `now` (the planner adds them in the 'season' group) */
  notifications?(from: Date, days: number, now: Date, ctx: SeasonContext): Omit<PlannedNotification, 'group' | 'channel'>[];
  /** the moment the season wants in the sky (e.g. candles lit), if any */
  skyDecor?(at: Date, ctx: SeasonContext): SkyDecor | null;
}

/** id range per season for notifications: base + days since 2000-01-01 × 100 + slot; each season owns 20 slots */
export const SEASON_SLOTS: Record<SeasonId, number> = { omer: 0, chanukah: 20 };

export const SEASON_STATE_KEY = (id: SeasonId) => `luach.season.${id}.v1`;

/** The registered seasons (filled by registerSeason from each season module, imported in seasons/all.ts) */
export const SEASONS: Season[] = [];
export function registerSeason(s: Season) {
  if (!SEASONS.some((x) => x.id === s.id)) SEASONS.push(s);
}

export function seasonContext(id: SeasonId, city: City, settings: Settings): SeasonContext {
  const s = SEASONS.find((x) => x.id === id);
  const stored = (settings.seasons?.[id] ?? {}) as Record<string, unknown>;
  return { city, settings, prefs: { ...(s?.defaults ?? {}), ...stored } };
}

/** The seasons showing on a day, in registry order */
export function activeSeasons(day: Date, city: City, settings: Settings): Season[] {
  return SEASONS.filter((s) => s.activeOn(day, seasonContext(s.id, city, settings)));
}

/** Everything the sky should draw at a moment, merged across seasons */
export function skyDecor(at: Date, city: City, settings: Settings): SkyDecor {
  const out: SkyDecor = {};
  for (const s of SEASONS) Object.assign(out, s.skyDecor?.(at, seasonContext(s.id, city, settings)) ?? {});
  return out;
}

/** Read / write a season's own state (localStorage; safe when storage is unavailable) */
export function loadSeasonState<T>(id: SeasonId, fallback: T): T {
  try {
    const raw = localStorage.getItem(SEASON_STATE_KEY(id));
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveSeasonState<T>(id: SeasonId, v: T) {
  try {
    localStorage.setItem(SEASON_STATE_KEY(id), JSON.stringify(v));
    window.dispatchEvent(new CustomEvent('luachi:season-state', { detail: id }));
  } catch {
    /* storage unavailable */
  }
}
