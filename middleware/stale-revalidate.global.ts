// middleware/stale-revalidate.global.ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server) return

  // TTLs per route (ms)
  const TTL: Record<string, number> = {
    '/': 25_000,   // home gets fresh-ish data quickly
    '/bonus': 0,   // always revalidate on nav
    // 🔴 '/fixtures' intentionally omitted to avoid stale client payloads
  }

  const now = Date.now()
  const match = Object.keys(TTL).find((p) => to.path.startsWith(p))
  if (!match) return

  const key = `stale:ts:${match}`
  const last = Number(sessionStorage.getItem(key) || 0)
  const ttl = TTL[match]

  if (!last || (now - last) > ttl) {
    await refreshNuxtData()
    sessionStorage.setItem(key, String(now))
  }
})
