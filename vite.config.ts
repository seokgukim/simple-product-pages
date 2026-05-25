import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Compute base: prefer explicit VITE_BASE_URL or BASE_URL, fall back to inferred repo name on CI
const repo = process.env.GITHUB_REPOSITORY
const inferredBase = repo ? `/${repo.split('/')[1]}/` : '/'
const baseUrl = process.env.VITE_BASE_URL || process.env.BASE_URL || inferredBase

// https://vite.dev/config/
export default defineConfig({
  base: baseUrl,
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
