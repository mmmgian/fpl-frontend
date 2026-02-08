import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const r = (p: string) => {
  const base = dirname(fileURLToPath(import.meta.url))
  return resolve(base, p)
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': r('./'),
      '~': r('./'),
      '#app': r('./tests/stubs/nuxt-app.ts'),
      '#imports': r('./tests/stubs/nuxt-imports.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
