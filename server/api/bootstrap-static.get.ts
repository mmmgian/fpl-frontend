// server/api/bootstrap-static.get.ts
import { defineEventHandler, getRequestURL } from 'h3'

type TEvent = { id: number; is_current?: boolean; finished?: boolean }
type TTeam = { id: number; short_name: string; name: string; code?: number }
type TElement = { id: number; web_name: string; team: number; element_type: 1|2|3|4 }
export type Bootstrap = { events: TEvent[]; teams: TTeam[]; elements: TElement[] }

export default defineEventHandler<Promise<Bootstrap>>(async (event) => {
  const cfg = useRuntimeConfig()
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '')

  // If a backend is configured, use it exclusively (prod-safe).
  if (base) {
    return await $fetch<Bootstrap>(`${base}/bootstrap-static`, { cache: 'no-store' })
  }

  // Local/dev fallback only
  return await $fetch<Bootstrap>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { headers: { referer: 'https://fantasy.premierleague.com/' } }
  )
})