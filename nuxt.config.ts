export default defineNuxtConfig({
  pages: true,
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  runtimeConfig: {
    public: { apiBase: process.env.NUXT_PUBLIC_BASE || '' },
  },

  ssr: true,

  nitro: {
    preset: 'vercel',
    compress: true,
    timing: true,

    staticAssets: {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      }
    }
  },

  routeRules: {
    '/': { isr: 15 },
    '/fixtures': { ssr: true, isr: false }, // Disable ISR - always fresh SSR for rapid updates
    '/team/**': { isr: 120 },
    '/bonus': { isr: false },

    // Cache for APIs with stale-while-revalidate
    '/api/bootstrap-static': {
      swr: 900,
      headers: { 'cache-control': 's-maxage=900, stale-while-revalidate=86400' }
    },

    '/api/fixtures': {
      swr: 120,
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' }
    },

    '/api/fixtures/**': {
      swr: false,
      headers: { 'cache-control': 'no-store' }
    },

    '/api/league/**': {
      swr: 30,
      headers: { 'cache-control': 's-maxage=30, stale-while-revalidate=300' }
    },

    '/api/team/**': {
      swr: 120,
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' }
    },

    '/api/tenure/**': {
      swr: 21600,
      headers: { 'cache-control': 's-maxage=21600, stale-while-revalidate=86400' }
    },
  },

  app: {
    head: {
      link: [
        { rel: 'dns-prefetch', href: 'https://fantasy.premierleague.com' },
        { rel: 'dns-prefetch', href: 'https://resources.premierleague.com' },
        { rel: 'preconnect', href: 'https://fantasy.premierleague.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://resources.premierleague.com', crossorigin: '' },
      ]
    }
  },

  tailwindcss: { cssPath: '~/assets/css/tailwind.css' },
  postcss: { plugins: { tailwindcss: {}, autoprefixer: {} } },

  experimental: { payloadExtraction: true },

  vite: { define: { __VRV_ENABLED__: false } },

  devtools: { enabled: false }
})