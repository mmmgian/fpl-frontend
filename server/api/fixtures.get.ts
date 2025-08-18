type BonusEntry = { element: number; value: number };
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };
export type Fixture = {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  finished: boolean;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  stats?: Stat[];
};

export default defineEventHandler<Promise<Fixture[]>>(async (event) => {
  const cfg = useRuntimeConfig();
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '');
  const q = getQuery(event);
  const eventParam = typeof q.event === 'string' ? q.event : undefined;

  // 1) Try your backend first
  if (base) {
    try {
      const url = eventParam ? `${base}/fixtures?event=${encodeURIComponent(eventParam)}` : `${base}/fixtures`;
      return await $fetch<Fixture[]>(url, { cache: 'no-store' });
    } catch {
      // fall through
    }
  }

  // 2) Fallback to official FPL
  const u = eventParam
    ? `https://fantasy.premierleague.com/api/fixtures/?event=${encodeURIComponent(eventParam)}`
    : 'https://fantasy.premierleague.com/api/fixtures/';
  return await $fetch<Fixture[]>(u, { headers: { referer: 'https://fantasy.premierleague.com/' } });
});