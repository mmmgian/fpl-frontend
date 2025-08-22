// server/api/fixtures/[event].get.ts
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

  const params = getRouterParams(event) as { event?: string }
  const evStr = params?.event ?? ''
  const evNum = Number(evStr)

  if (!Number.isFinite(evNum)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad event id' })
  }

  // vary by path is already guaranteed; make it explicit:
  setResponseHeader(event, 'Vary', 'Accept-Encoding')

  if (base) {
    const url = `${base}/fixtures?event=${encodeURIComponent(String(evNum))}`
    return await $fetch<Fixture[]>(url, { cache: 'no-store' })
  }

  const all = await $fetch<Fixture[]>('https://fantasy.premierleague.com/api/fixtures/', {
    headers: { referer: 'https://fantasy.premierleague.com/' }
  })

  return all.filter(f => f.event === evNum)
})