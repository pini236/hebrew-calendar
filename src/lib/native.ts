import { Capacitor } from '@capacitor/core';
import { CHANNELS, IOS_LIMIT, groupOf, type Group, type PlannedNotification } from './alerts';

export const isNative = () => Capacitor.isNativePlatform();

/** One-time native setup: status bar, and a "resume" event the app listens to */
export async function initNative() {
  document.documentElement.classList.add('native');
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: dark ? '#0a0e20' : '#eef0f6' });
  } catch {
    /* status bar plugin unavailable */
  }
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('resume', () => window.dispatchEvent(new Event('luachi:resume')));
  } catch {
    /* ignore */
  }
}

/* ---------------- local notifications ---------------- */

export async function notificationPermission(request: boolean): Promise<'granted' | 'denied' | 'prompt'> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted' && request) p = await LocalNotifications.requestPermissions();
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
}

let channelsMade = false;
async function ensureChannels() {
  if (channelsMade || Capacitor.getPlatform() !== 'android') return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  for (const [id, c] of Object.entries(CHANNELS)) {
    await LocalNotifications.createChannel({ id, name: c.name, description: c.description, importance: 4, visibility: 1 });
  }
  channelsMade = true;
}

/** Cancel the pending notifications of some groups (every group of the app when omitted) */
export async function cancelGroups(groups?: Group[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) => {
    const g = groupOf(n.id);
    return g !== null && (!groups || groups.includes(g));
  });
  if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
}

let syncing: Promise<number> = Promise.resolve(0);

/**
 * Make the pending notifications exactly `list` (already within the iOS budget, see lib/alerts.ts).
 * Does nothing without notification permission: the app asks for it only when the user switches an alert on.
 * Calls run one after another, so two quick changes can't interleave their cancel / schedule steps.
 */
export function syncNotifications(list: PlannedNotification[]): Promise<number> {
  syncing = syncing
    .catch(() => 0)
    .then(async () => {
      if ((await notificationPermission(false)) !== 'granted') return 0;
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await ensureChannels();
      await cancelGroups();
      const now = Date.now();
      const future = list.filter((a) => a.at.getTime() > now + 30000).slice(0, IOS_LIMIT);
      if (!future.length) return 0;
      await LocalNotifications.schedule({
        notifications: future.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          largeBody: a.body,
          channelId: a.channel,
          schedule: { at: a.at, allowWhileIdle: true },
          // inexact on Android: may arrive a few minutes late, but needs no special "alarms" permission
          isExactNotification: false,
        })),
      });
      return future.length;
    });
  return syncing;
}

/* ---------------- location ---------------- */

export async function nativePosition() {
  const { Geolocation } = await import('@capacitor/geolocation');
  const perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] }).catch(() => null);
  if (perm && perm.coarseLocation === 'denied' && perm.location === 'denied') throw new Error('denied');
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  return pos.coords;
}

/* ---------------- sharing a file (backup export) ---------------- */

export async function shareTextFile(filename: string, data: string, title: string) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title, files: [res.uri] });
}
