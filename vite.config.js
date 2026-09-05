import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import seo from './vite-plugin-seo.js'

// Served from the root of its own subdomain on Netlify:
// https://pools.thinkdesign.com/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), seo()],
})
