// server/api/league/[leagueId].get.ts

export type LeagueRow = {
  entry: number
  entry_name: string
  player_name: string
  total: number
  event_total?: number | null
  rank?: number | null
  last_rank?: number | null
}
export type LeaguePayload = { standings: LeagueRow[] }

export default defineEventHandler<Promise<LeaguePayload>>(async (event) => {
  const { leagueId } = getRouterParams(event)
  const cfg = useRuntimeConfig()
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '')

  // helper to normalize any incoming row shape while PRESERVING rank fields
  const normalize = (r: any): LeagueRow => ({
    entry: Number(r?.entry ?? 0),
    entry_name: String(r?.entry_name ?? 'Team'),
    player_name: String(r?.player_name ?? 'Manager'),
    total: Number(r?.total ?? 0),
    event_total: r?.event_total ?? null,
    rank: (typeof r?.rank === 'number') ? r.rank : (r?.rank ?? null),
    last_rank: (typeof r?.last_rank === 'number') ? r.last_rank : (r?.last_rank ?? null),
  })

  // Always return fresh (avoid edge cache for live rank movement)
  setHeader(event, 'cache-control', 'no-store')

  // 1) Try your FastAPI first (support both array and FPL-shaped payloads)
  if (base) {
    try {
      const fromBackend = await $fetch<any>(`${base}/league/${encodeURIComponent(leagueId)}`, {
        cache: 'no-store',
      })

      let rows: any[] = []
      if (Array.isArray(fromBackend?.standings)) {
        rows = fromBackend.standings
      } else if (Array.isArray(fromBackend?.standings?.results)) {
        rows = fromBackend.standings.results
      }

      if (rows.length) {
        return { standings: rows.map(normalize) }
      }
      // fall through if empty
    } catch {
      // fall through to FPL
    }
  }

  // 2) Fallback: official FPL classic league standings (keeps rank/last_rank)
  type FplClassic = {
    standings?: {
      results?: Array<{
        entry?: number
        entry_name?: string
        player_name?: string
        total?: number
        event_total?: number | null
        rank?: number | null
        last_rank?: number | null
      }>
    }
  }

  const url = `https://fantasy.premierleague.com/api/leagues-classic/${encodeURIComponent(
    leagueId
  )}/standings/`

  try {
    const fpl = await $fetch<FplClassic>(url, {
      headers: { referer: 'https://fantasy.premierleague.com/' },
      cache: 'no-store',
    })
    const results = fpl?.standings?.results ?? []
    return { standings: results.map(normalize) }
  } catch {
    return { standings: [] }
  }
})