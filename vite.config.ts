import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import paquete from './package.json' with { type: 'json' };

// `--mode android` genera la versión que va dentro del APK: sin service worker,
// porque ahí los archivos ya vienen empaquetados y un caché extra dejaría
// versiones viejas tras actualizar.
export default defineConfig(({ mode }) => ({
  // Rutas relativas: la app funciona igual en la raíz de un dominio
  // o en una subcarpeta (por ejemplo GitHub Pages).
  base: './',
  define: { __VERSION__: JSON.stringify(paquete.version) },
  plugins: [
    react(),
    mode !== 'android' && VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Incluye el lector de PDF (.mjs, ~1.3 MB) para importar estados de cuenta sin conexión.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mis Finanzas',
        short_name: 'Mis Finanzas',
        description: 'Control de ingresos, gastos, tarjetas y préstamos',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f6f5',
        theme_color: '#0f6b54',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
}));
