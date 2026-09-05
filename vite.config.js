import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import seo from './vite-plugin-seo.js'

// Served from the root of its own subdomain on Netlify:
// https://pools.thinkdesign.com/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    seo(),
    // Listed after the SEO plugin so the service worker hashes the final
    // index.html — the one carrying the injected JSON-LD and no-JS fallback.
    VitePWA({
      // 'prompt', not 'autoUpdate': swapping the schedule out from under
      // someone mid-read is worse than a stale minute, and the existing
      // staleness banner (48h) already covers a prompt that gets ignored.
      registerType: 'prompt',
      // No includeAssets — globPatterns already matches every icon and the
      // manifest, and listing them twice duplicates the precache entries.
      manifest: {
        name: 'NYC Indoor Pool Finder',
        short_name: 'Pool Finder',
        description:
          "Live lap swim, open swim and family swim schedules for NYC's indoor public pools.",
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0284c7',
        background_color: '#f8fafc',
        categories: ['sports', 'health', 'travel'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The pool data is imported at build time, so the JS bundle *is* the
        // data — precaching the shell gives genuinely useful offline access to
        // full schedules, which is the point at a pool door with no signal.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // dist/nyc_pools_*.json exists only for the mobile app; the website
        // never fetches it. Precaching 150KB nobody reads is pure waste.
        globIgnores: ['**/nyc_pools_*.json'],
        navigateFallback: '/index.html',
        // Without this, an offline visit to /privacy/ misses the precached
        // 'privacy/index.html' and falls through to the app shell.
        directoryIndex: 'index.html',
        cleanupOutdatedCaches: true,
      },
      // `npm run dev` stays a plain dev server — a service worker caching a hot
      // -reloading bundle is a debugging trap.
      devOptions: { enabled: false },
    }),
  ],
})
