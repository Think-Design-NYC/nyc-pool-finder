import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import seo from './vite-plugin-seo.js'

// Served from a GitHub Pages project subpath:
// https://think-design-nyc.github.io/nyc-pool-finder/
export default defineConfig({
  base: '/nyc-pool-finder/',
  plugins: [react(), tailwindcss(), seo()],
})
