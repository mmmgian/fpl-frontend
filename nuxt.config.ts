// nuxt.config.ts
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

    // 🔥 extra: cache headers for static assets (shirts, crests, etc.)
    staticAssets: {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
  },

  routeRules: {
    // ---- Pages ----
    '/': { isr: 15 },           // Home: refresh often (ranks etc.)
    '/fixtures': { isr: 600 },  // Fixture difficulty grid: fine to be slower
    '/team/**': { isr: 120 },   // Individual teams: not too stale
    '/bonus': { isr: false },   // Always fresh server-rendered HTML

    // ---- APIs ----
    '/api/bootstrap-static': {
      swr: 900, // 15m
      headers: { 'cache-control': 's-maxage=900, stale-while-revalidate=86400' },
    },

    '/api/fixtures': {
      swr: 120, // 2m
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' },
    },

    '/api/fixtures-live/**': {
      swr: false, // Always live
      headers: { 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' },
    },

    '/api/league/**': {
      swr: 30, // 30s → fresher ranks
      headers: { 'cache-control': 's-maxage=30, stale-while-revalidate=300' },
    },

    '/api/team/**': {
      swr: 120, // 2m
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' },
    },

    '/api/tenure/**': {
      swr: 21600, // 6h
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
    define: { __VRV_ENABLED__: false },
  },

  devtools: { enabled: false },
})