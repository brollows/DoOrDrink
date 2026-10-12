import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'DoOrDrink', short_name: 'DoOrDrink', lang: 'nb',
      description: 'Gjett, utfordre og spill sammen.',
      theme_color: '#111218', background_color: '#111218',
      display: 'standalone', start_url: '/', scope: '/', orientation: 'portrait-primary',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      navigateFallback: '/index.html',
      // QR/shared join links always load the latest app from the network,
      // so an outdated cached app can never swallow the code.
      navigateFallbackDenylist: [/^\/join\//],
      cleanupOutdatedCaches: true,
      // Activate a new version as soon as it is downloaded; it is used on the next page load.
      // Open pages are not reloaded, so a running round is never interrupted.
      skipWaiting: true,
      clientsClaim: true
    }
  })],
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } }
});
