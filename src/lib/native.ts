import { Capacitor } from '@capacitor/core';

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

/* ---------------- Friday Shabbat notifications ---------------- */

export interface NativeAlert {
  id: number;
  at: Date;
  title: string;
  body: string;
}

const CHANNEL = 'shabbat';
// iOS keeps at most 64 pending local notifications per app
const MAX_PENDING = 60;

export async function notificationPermission(request: boolean): Promise<'granted' | 'denied' | 'prompt'> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted' && request) p = await LocalNotifications.requestPermissions();
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
}

/** Replace every pending Shabbat alert with `alerts` (future ones only) */
export async function scheduleAlerts(alerts: NativeAlert[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'זמני שבת',
      description: 'התראה בבוקר יום שישי עם זמני כניסת השבת ויציאתה',
      importance: 4,
      visibility: 1,
    });
  }
  await cancelAlerts();
  const now = Date.now();
  const list = alerts.filter((a) => a.at.getTime() > now + 30000).slice(0, MAX_PENDING);
  if (!list.length) return 0;
  await LocalNotifications.schedule({
    notifications: list.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      largeBody: a.body,
      channelId: CHANNEL,
      schedule: { at: a.at, allowWhileIdle: true },
      // inexact on Android: may arrive a few minutes late, but needs no special "alarms" permission
      isExactNotification: false,
    })),
  });
  return list.length;
}

export async function cancelAlerts() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
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
