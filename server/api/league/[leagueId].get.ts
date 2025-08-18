export type LeagueRow = {
  entry: number;
  entry_name: string;
  player_name: string;
  total: number;
  event_total?: number | null;
};
export type LeaguePayload = { standings: LeagueRow[] };

export default defineEventHandler<Promise<LeaguePayload>>(async (event) => {
  const { leagueId } = getRouterParams(event);
  const cfg = useRuntimeConfig();
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '');

  // 1) Try your FastAPI first
  if (base) {
    try {
      const fromBackend = await $fetch<any>(`${base}/league/${encodeURIComponent(leagueId)}`, { cache: 'no-store' });
      const rows: LeagueRow[] = Array.isArray(fromBackend?.standings) ? fromBackend.standings : [];
      if (rows.length) return { standings: rows };
      // fall through if empty
    } catch {
      // fall through to FPL
    }
  }

  // 2) Fallback: official FPL classic league standings
  //    Shape: { standings: { results: [...] } }
  type FplClassic = {
    standings?: {
      results?: Array<{
        entry?: number;
        entry_name?: string;
        player_name?: string;
        total?: number;
        event_total?: number | null;
      }>;
    };
  };

  const url = `https://fantasy.premierleague.com/api/leagues-classic/${encodeURIComponent(
    leagueId
  )}/standings/`;

  try {
    const fpl = await $fetch<FplClassic>(url, {
      headers: { referer: 'https://fantasy.premierleague.com/' },
      cache: 'no-store',
    });

    const results = fpl?.standings?.results ?? [];
    const mapped: LeagueRow[] = results.map((r) => ({
      entry: Number(r.entry ?? 0),
      entry_name: String(r.entry_name ?? 'Team'),
      player_name: String(r.player_name ?? 'Manager'),
      total: Number(r.total ?? 0),
      event_total: r.event_total ?? null,
    }));

    return { standings: mapped };
  } catch {
    // Last resort: empty
    return { standings: [] };
  }
});