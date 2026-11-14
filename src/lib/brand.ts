import { Capacitor } from '@capacitor/core';

/**
 * The app's name. On Android and on the web it is "לוח יהודי"; on the App Store it is
 * published as "לוח עברי", and Apple asks that the name on the device match the store.
 * (`?brand=ios` in the URL forces the iPhone name, for store screenshots.)
 */
const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('brand') : null;
export const APP_NAME = Capacitor.getPlatform() === 'ios' || forced === 'ios' ? 'לוח עברי' : 'לוח יהודי';
