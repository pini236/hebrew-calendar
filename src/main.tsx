import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css';
import '@fontsource/ibm-plex-sans-hebrew/hebrew-600.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css';
import '@fontsource/ibm-plex-sans-hebrew/latin-600.css';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { initNative } from './lib/native';

declare const __PWA__: boolean;

document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// offline support + installable app (skipped in the single-file preview build)
if (Capacitor.isNativePlatform()) {
  initNative();
} else if (__PWA__ && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
