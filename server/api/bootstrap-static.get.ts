// server/api/bootstrap-static.get.ts
import { defineEventHandler, getRequestURL } from 'h3'

type TEvent = { id: number; is_current?: boolean; finished?: boolean }
type TTeam = { id: number; short_name: string; name: string; code?: number }
type TElement = { id: number; web_name: string; team: number; element_type: 1|2|3|4 }
export type Bootstrap = { events: TEvent[]; teams: TTeam[]; elements: TElement[] }

export default defineEventHandler<Promise<Bootstrap>>(async (event) => {
  const cfg = useRuntimeConfig()
  const rawBase = (cfg.public?.apiBase as string | undefined) || ''
  const base = rawBase.replace(/\/+$/, '')

  // Decide if base is a different origin (to avoid self-calls on Vercel)
  let canUseBackend = false
  try {
    const reqOrigin = getRequestURL(event).origin // e.g. https://fpl-frontend-rouge.vercel.app
    const baseOrigin = base ? new URL(base).origin : ''
    canUseBackend = Boolean(base && baseOrigin && baseOrigin !== reqOrigin)
  } catch {
    canUseBackend = false
  }

  // 1) Try your backend ONLY if it's a different origin
  if (canUseBackend) {
    try {
      return await $fetch<Bootstrap>(`${base}/bootstrap-static`, {
        // don’t pass browser-only fetch options here
        headers: { referer: 'https://fantasy.premierleague.com/' },
      })
    } catch {
      // fall through to FPL
    }
  }

  // 2) Fallback to official FPL
  return await $fetch<Bootstrap>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { headers: { referer: 'https://fantasy.premierleague.com/' } }
  )
})