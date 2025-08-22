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
  },

  routeRules: {
    // Pages
    '/': { isr: 60 },
    '/fixtures': { isr: 600 },
    '/team/**': { isr: 120 },

    // 👇 Make /bonus always server-render fresh HTML so nav → page shows current data
    '/bonus': { isr: false },

    // APIs
    '/api/bootstrap-static': {
      swr: 900,
      headers: { 'cache-control': 's-maxage=900, stale-while-revalidate=86400' },
    },

    // Keep general fixtures reasonably cached…
    '/api/fixtures': {
      swr: 120,
      headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=86400' },
    },

    // …but add a live endpoint with much tighter SWR for the bonus page
    '/api/fixtures-live': {
      swr: 10, // ~10s freshness at the edge
      headers: { 'cache-control': 's-maxage=10, stale-while-revalidate=60' },
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
  vite: { define: { __VRV_ENABLED__: false } },
  devtools: { enabled: false },
})