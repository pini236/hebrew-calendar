import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "single" builds one self-contained HTML file (used for quick previews);
// the default build is an installable, offline-capable PWA.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: process.env.BASE_PATH || './',
    define: { __SINGLE__: JSON.stringify(single) },
    build: { outDir: single ? 'dist-single' : 'dist' },
    plugins: [
      react(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'לוח — יומן עברי',
              short_name: 'לוח',
              description: 'יומן עברי-לועזי עם זמני היום, חגים ואירועים אישיים',
              lang: 'he',
              dir: 'rtl',
              theme_color: '#0f1630',
              background_color: '#0f1630',
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
