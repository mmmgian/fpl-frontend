// server/api/fixtures-live.get.ts
type BonusEntry = { element: number; value: number }
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] }
type Fixture = {
  id: number; event: number | null; kickoff_time: string | null
  started?: boolean; finished: boolean; finished_provisional?: boolean
  team_h: number; team_a: number; team_h_score: number | null; team_a_score: number | null
  team_h_difficulty?: number; team_a_difficulty?: number
  stats?: Stat[]
}

export default defineEventHandler<Promise<Fixture[]>>(async (event) => {
  // 🚫 Force no caching at the edge & browser
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Expires', '0')

  const cfg = useRuntimeConfig()
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '')
  const { event: ev } = getQuery(event)
  const evNum = ev ? Number(ev) : null

  let data: Fixture[]

  if (base) {
    const url = `${base}/fixtures${ev ? `?event=${encodeURIComponent(String(ev))}` : ''}`
    data = await $fetch<Fixture[]>(url, {
      cache: 'no-store', // Nitro/Fetch
    })
  } else {
    data = await $fetch<Fixture[]>(
      `https://fantasy.premierleague.com/api/fixtures/${ev ? `?event=${encodeURIComponent(String(ev))}` : ''}`,
      {
        headers: { referer: 'https://fantasy.premierleague.com/' },
        cache: 'no-store',
      }
    )
  }

  return evNum ? data.filter((f) => f.event === evNum) : data
})