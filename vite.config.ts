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
    workbox: { navigateFallback: '/index.html', cleanupOutdatedCaches: true }
  })],
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } }
});
