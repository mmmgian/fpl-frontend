// server/api/fixtures.get.ts
type BonusEntry = { element: number; value: number };
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };

type Fixture = {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  started?: boolean;
  finished: boolean;
  finished_provisional?: boolean;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  // NEW: FDR values (1–5)
  team_h_difficulty?: number;
  team_a_difficulty?: number;
  stats?: Stat[];
};

export default defineEventHandler<Promise<Fixture[]>>(async (event) => {
  const cfg = useRuntimeConfig();
  const base = (cfg.public.apiBase || "").replace(/\/+$/, "");
  const q = getQuery(event);
  const ev = typeof q.event === "string" && q.event.trim() ? q.event.trim() : null;

  // 1) Try your backend first (if configured)
  if (base) {
    const url = ev ? `${base}/fixtures?event=${encodeURIComponent(ev)}` : `${base}/fixtures`;
    try {
      return await $fetch<Fixture[]>(url, { cache: "no-store" });
    } catch {
      // fall through to FPL
    }
  }

  // 2) Fallback: official FPL
  // If ?event is provided, we can either ask FPL for that GW only or fetch all and filter.
  // Use server-side filter to keep behavior consistent with your original code.
  const all = await $fetch<Fixture[]>("https://fantasy.premierleague.com/api/fixtures/", {
    headers: { referer: "https://fantasy.premierleague.com/" },
    cache: "no-store",
  });

  return ev ? all.filter((f) => f.event === Number(ev)) : all;
});