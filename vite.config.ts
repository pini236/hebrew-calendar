import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "single" builds one self-contained HTML file (used for quick previews);
// the default build is an installable, offline-capable PWA.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const native = mode === 'native'; // web assets bundled into the Android / iOS apps
  return {
    base: process.env.BASE_PATH || './',
    define: { __SINGLE__: JSON.stringify(single), __PWA__: JSON.stringify(!single && !native) },
    build: {
      outDir: single ? 'dist-single' : native ? 'dist-native' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
    plugins: [
      react(),
      single
        ? viteSingleFile()
        : native
          ? null
          : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'לוח עברי',
              short_name: 'לוח עברי',
              description: 'יומן עברי-לועזי עם זמני היום, חגים ואירועים אישיים',
              lang: 'he',
              dir: 'rtl',
              theme_color: '#1F3E9E',
              background_color: '#1F3E9E',
              display: 'standalone',
              start_url: '.',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'google-fonts',
                    expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
    ],
  };
});
