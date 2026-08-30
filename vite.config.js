import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import seo from './vite-plugin-seo.js'

// Served from a subpath on WP Engine (thinkdesignprd):
// https://thinkdesign.com/pools/
export default defineConfig({
  base: '/pools/',
  plugins: [react(), tailwindcss(), seo()],
})
