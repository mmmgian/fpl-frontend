type BonusEntry = { element: number; value: number };
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };
type Fixture = {
  id: number; event: number|null; kickoff_time: string|null;
  started?: boolean; finished: boolean; finished_provisional?: boolean;
  team_h: number; team_a: number; team_h_score: number|null; team_a_score: number|null;
  stats?: any[]
}

export default defineEventHandler<Promise<Fixture[]>>(async (event) => {
  const cfg = useRuntimeConfig()
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '')
  const { event: ev } = getQuery(event)

  if (base) {
    const url = `${base}/fixtures${ev ? `?event=${encodeURIComponent(String(ev))}` : ''}`
    return await $fetch<Fixture[]>(url, { cache: 'no-store' })
  }

  // Local/dev fallback
  const all = await $fetch<Fixture[]>('https://fantasy.premierleague.com/api/fixtures/', {
    headers: { referer: 'https://fantasy.premierleague.com/' }
  })
  return ev ? all.filter(f => f.event === Number(ev)) : all
})