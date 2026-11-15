/**
 * The seasons' cards on היום (see src/lib/seasons.ts). Each season registers a lazily loaded card here
 * by its id; the card gets the day shown, the live clock, the place, the settings and a way to save
 * its own preferences (settings.seasons[id]).
 */
import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import '../../lib/seasons/all';
import { activeSeasons, type SeasonId } from '../../lib/seasons';
import type { City } from '../../lib/cities';
import type { Settings } from '../../lib/store';
import type { zmanim } from '../../lib/cal';

export interface SeasonCardProps {
  /** the day shown on היום (noon-pinned) */
  day: Date;
  now: Date;
  city: City;
  settings: Settings;
  z: ReturnType<typeof zmanim>;
  /** merge into this season's preferences (settings.seasons[id]) */
  setPrefs: (patch: Record<string, unknown>) => void;
}

type Card = LazyExoticComponent<ComponentType<SeasonCardProps>>;

/** id → card. Seasons add theirs: omer: lazy(() => import('./OmerCard')), … */
export const SEASON_CARDS: Partial<Record<SeasonId, Card>> = {
  omer: lazy(() => import('./OmerCard')),
  chanukah: lazy(() => import('./ChanukahCard')),
};

// keep `lazy` imported for the season cards registered above
void lazy;

/** The cards of the seasons showing on this day, in the engine's order */
export function SeasonCards(p: Omit<SeasonCardProps, 'setPrefs'> & { onSettings: (s: Settings) => void }) {
  const list = activeSeasons(p.day, p.city, p.settings).filter((s) => SEASON_CARDS[s.id]);
  if (!list.length) return null;
  return (
    <div className="season-cards">
      {list.map((s) => {
        const Card = SEASON_CARDS[s.id]!;
        const setPrefs = (patch: Record<string, unknown>) =>
          p.onSettings({ ...p.settings, seasons: { ...(p.settings.seasons ?? {}), [s.id]: { ...(p.settings.seasons?.[s.id] ?? {}), ...patch } } });
        return (
          <Suspense key={s.id} fallback={null}>
            <Card day={p.day} now={p.now} city={p.city} settings={p.settings} z={p.z} setPrefs={setPrefs} />
          </Suspense>
        );
      })}
    </div>
  );
}

/* ---------------- a season's own screens (pushed over the tabs; App.tsx opens them by name) ---------------- */

export interface SeasonScreenProps {
  now: Date;
  city: City;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClose: () => void;
}

/** name → screen. A notification opens one through its extra { screen: name } (lib/native.ts requestOpen) */
export const SEASON_SCREENS: Record<string, LazyExoticComponent<ComponentType<SeasonScreenProps>>> = {
  'omer-intro': lazy(() => import('./OmerIntro')),
};

export function SeasonScreen({ id, ...p }: SeasonScreenProps & { id: string }) {
  const S = SEASON_SCREENS[id];
  if (!S) return null;
  return (
    <Suspense fallback={null}>
      <S {...p} />
    </Suspense>
  );
}
