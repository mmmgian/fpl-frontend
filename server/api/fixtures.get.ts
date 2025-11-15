// server/api/fixtures.get.ts
import { defineEventHandler, getQuery, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from '#imports'

type BonusEntry = { element: number; value: number }
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] }

type Fixture = {
  id: number
  event: number | null
  kickoff_time: string | null
  started?: boolean
  finished: boolean
  finished_provisional?: boolean
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  team_h_difficulty?: number
  team_a_difficulty?: number
  stats?: Stat[]
}

export default defineEventHandler<Promise<Fixture[]>>(async (event) => {
  const cfg = useRuntimeConfig()
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '')
  const { event: ev } = getQuery(event)
  const evNum = ev ? Number(ev) : null

  // 🔴 Force no caching
  setResponseHeaders(event, {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    'pragma': 'no-cache',
    'expires': '0',
  })

  let data: Fixture[]

  if (base) {
    // Your FastAPI backend
    const url = `${base}/fixtures${ev ? `?event=${encodeURIComponent(String(ev))}` : ''}`
    data = await $fetch<Fixture[]>(url, { cache: 'no-store' })
  } else {
    // Direct FPL fallback
    data = await $fetch<Fixture[]>(
      'https://fantasy.premierleague.com/api/fixtures/',
      {
        headers: { referer: 'https://fantasy.premierleague.com/' },
      }
    )
  }

  return evNum ? data.filter((f) => f.event === evNum) : data
})
