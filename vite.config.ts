import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // The one version (semver) in package.json, shown in Help and Settings.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Extra hostnames for the dev server go in .env.local (gitignored):
    //   DEV_ALLOWED_HOSTS=my.host.example,other.host
    allowedHosts: [
      'compy.internal',
      ...(loadEnv(mode, '.', 'DEV_').DEV_ALLOWED_HOSTS ?? '').split(',').map(h => h.trim()).filter(Boolean),
    ],
  },
  plugins: [
    react(),
    VitePWA({
      // The page decides when a new version takes over (services/pwaUpdate.ts registers the worker).
      registerType: 'prompt',
      injectRegister: false,
      // Icons are generated from public/logo.svg: `npm run generate-pwa-assets`
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: 'Timeline Clock',
        short_name: 'Timeline',
        description: 'A timeline-centric clock: stopwatch, timer, alarm and world clock on one zoomable timeline.',
        theme_color: '#0c1838',
        background_color: '#02040c',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Notification clicks and the update hand-over (public/sw-extras.js).
        importScripts: ['sw-extras.js'],
      },
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Agent worktrees under .claude/ hold copies of the tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}))
