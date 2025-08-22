export default defineNuxtConfig({
  pages: true,

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  runtimeConfig: {
    public: { apiBase: process.env.NUXT_PUBLIC_API_BASE || '' },
  },

  ssr: true,

  nitro: {
    preset: 'vercel',
    compressPublicAssets: true,
    timing: true,
  },

  routeRules: {
    '/': { isr: 60 },
    '/bonus': { isr: 60 },

    // IMPORTANT: render /fixtures fresh each request (no ISR),
    // or set a very small ISR window like 15s if you prefer.
    '/fixtures': { isr: false },

    '/team/**': { isr: 120 },

    '/api/bootstrap-static': {
      swr: 900,
      headers: { 'cache-control': 's-maxage=900, stale-while-revalidate=86400' },
    },
    '/api/fixtures/**': {
      swr: 180,
      headers: { 'cache-control': 's-maxage=180, stale-while-revalidate=86400' },
    },
    '/api/league/**': {
      swr: 120,
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' },
    },
    '/api/team/**': {
      swr: 120,
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' },
    },
    '/api/tenure/**': {
      swr: 21600,
      headers: { 'cache-control': 's-maxage=21600, stale-while-revalidate=86400' },
    },
  },

  app: {
    head: {
      link: [
        { rel: 'dns-prefetch', href: 'https://fantasy.premierleague.com' },
        { rel: 'dns-prefetch', href: 'https://resources.premierleague.com' },
        { rel: 'preconnect', href: 'https://fantasy.premierleague.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://resources.premierleague.com', crossorigin: '' },
      ],
    },
  },

  tailwindcss: { cssPath: '~/assets/css/tailwind.css' },
  postcss: { plugins: { tailwindcss: {}, autoprefixer: {} } },

  experimental: { payloadExtraction: true },

  vite: {
    plugins: process.env.NODE_ENV === 'development' ? [] : [],
    define: { __VRV_ENABLED__: false },
  },

  devtools: { enabled: false },
})