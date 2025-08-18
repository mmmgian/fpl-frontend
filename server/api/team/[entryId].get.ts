// server/api/team/[entryId].get.ts
type Pos = 1 | 2 | 3 | 4;
type Pick = {
  id: number;
  web_name: string;
  position: Pos | null;
  team?: number;
  gw_points?: number | null;
  is_captain?: boolean;
};
type TeamPayload = {
  entry_id: number;
  team_name: string;
  manager_name: string;
  gw: number;
  picks: Pick[];
};

const num = (x: any, d: number | null = null) =>
  Number.isFinite(Number(x)) ? Number(x) : d;
const str = (x: any, d = "") => (typeof x === "string" ? x : d);

const fetchJSON = async (url: string) =>
  $fetch<any>(url, { headers: { referer: "https://fantasy.premierleague.com/" } });

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const { entryId } = getRouterParams(event);
  const entryIdNum = Number(entryId);
  if (!entryIdNum) {
    throw createError({ statusCode: 400, statusMessage: "Bad entryId" });
  }

  const config = useRuntimeConfig();
  const base = (config.public.apiBase || "http://127.0.0.1:8000").replace(/\/+$/, "");

  // --- Bootstrap for mapping
  let bootstrap: any = null;
  try {
    bootstrap = await $fetch("/api/bootstrap-static", { cache: "no-store" });
  } catch {
    /* noop */
  }
  const elById = new Map<number, any>();
  if (bootstrap?.elements) {
    for (const e of bootstrap.elements) {
      const id = num(e?.id);
      if (id != null) elById.set(id, e);
    }
  }
  const e2pos = (id: number): Pos | null => {
    const et = num(elById.get(id)?.element_type, null);
    return et && [1, 2, 3, 4].includes(et) ? (et as Pos) : null;
  };
  const e2team = (id: number): number | undefined => {
    const t = num(elById.get(id)?.team, null);
    return t == null ? undefined : (t as number);
  };
  const e2name = (id: number): string => str(elById.get(id)?.web_name, `Player ${id}`);

  // --- Prefer your FastAPI (if it already returns normalized picks)
  let upstream: any = null;
  try {
    upstream = await $fetch(`${base}/team/${encodeURIComponent(entryId)}`, { cache: "no-store" });
  } catch {
    upstream = null;
  }

  const normalizeFromBackend = (u: any) => {
    if (!u) return null;
    const raw =
      (Array.isArray(u?.picks) && u.picks) ||
      (Array.isArray(u?.picks?.picks) && u.picks.picks) ||
      null;
    if (!raw) return null;

    const picks = raw
      .map((r: any) => {
        const id = num(r?.id ?? r?.element ?? r?.player_id);
        if (id == null) return null;
        return {
          id,
          web_name: str(r?.web_name) || e2name(id),
          position: e2pos(id),
          team: e2team(id),
          // we'll overwrite gw_points after live lookup
          gw_points: num(r?.gw_points ?? r?.event_points ?? r?.points, null),
          is_captain: Boolean(r?.is_captain ?? r?.captain),
          _mult: num(r?.multiplier ?? 1, 1),
        };
      })
      .filter(Boolean);

    const gw = num(u?.gw ?? u?.event, null) ?? 0;
    const team_name = str(u?.team_name ?? u?.entry_name, "Team");
    const manager_name = str(u?.manager_name ?? u?.player_name, "Manager");
    const entry_id = num(u?.entry_id ?? u?.entry, entryIdNum) || entryIdNum;

    return { gw, picks, team_name, manager_name, entry_id };
  };

  let normalized = normalizeFromBackend(upstream);

  // --- Determine GW if not set
  let gw: number | null = normalized?.gw ?? null;
  let entrySummary: any = null;

  if (!gw) {
    try {
      entrySummary = await fetchJSON(
        `https://fantasy.premierleague.com/api/entry/${entryIdNum}/`
      );
      gw = num(entrySummary?.current_event, null);
    } catch {}
  }
  if (!gw && bootstrap?.events) {
    const cur = bootstrap.events.find((e: any) => e.is_current) ?? bootstrap.events.find((e: any) => !e.finished);
    gw = num(cur?.id, null);
  }
  if (!gw && bootstrap?.events?.length) {
    const finished = (bootstrap.events as any[]).filter((e) => e?.finished);
    if (finished.length) gw = finished.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
  }
  if (!gw) gw = 1;

  // --- If backend gave us picks but gw_points are missing/zero, we'll enrich below
  // If backend didn't provide picks, fetch official picks
  if (!normalized || !normalized.picks.length) {
    let picksJson: any = null;
    const pull = async (g: number) =>
      fetchJSON(`https://fantasy.premierleague.com/api/entry/${entryIdNum}/event/${g}/picks/`);

    try {
      picksJson = await pull(gw);
    } catch {
      if (gw > 1) {
        try {
          picksJson = await pull(gw - 1);
          gw = gw - 1;
        } catch {}
      }
    }

    const picks: (Pick & { _mult?: number })[] = [];
    for (const r of picksJson?.picks ?? []) {
      const id = num(r?.element);
      if (id == null) continue;
      picks.push({
        id,
        web_name: e2name(id),
        position: e2pos(id),
        team: e2team(id),
        gw_points: null, // to fill from live points
        is_captain: Boolean(r?.is_captain),
        _mult: num(r?.multiplier ?? 1, 1),
      });
    }

    // get entry labels if we didn’t already
    if (!entrySummary) {
      try {
        entrySummary = await fetchJSON(
          `https://fantasy.premierleague.com/api/entry/${entryIdNum}/`
        );
      } catch {}
    }
    normalized = {
      entry_id: entryIdNum,
      team_name: str(entrySummary?.name, "Team"),
      manager_name:
        `${str(entrySummary?.player_first_name)} ${str(entrySummary?.player_last_name)}`.trim() || "Manager",
      gw,
      picks,
    };
  } else {
    // ensure GW reflects our final choice
    normalized.gw = gw;
  }

  // --- Enrich with LIVE points (total_points) * multiplier
  //     event/{gw}/live/ → elements[].stats.total_points
  let liveMap = new Map<number, number>();
  try {
    const live = await fetchJSON(
      `https://fantasy.premierleague.com/api/event/${gw}/live/`
    );
    for (const el of live?.elements ?? []) {
      const id = num(el?.id);
      const pts = num(el?.stats?.total_points, null);
      if (id != null && pts != null) liveMap.set(id, pts);
    }
  } catch {
    // if live endpoint fails, leave map empty
  }

  for (const p of normalized.picks as (Pick & { _mult?: number })[]) {
    const base = liveMap.get(p.id);
    if (base != null) {
      const mult = p._mult ?? 1;
      p.gw_points = base * mult;
    } else if (p.gw_points == null) {
      p.gw_points = 0;
    }
    delete (p as any)._mult;
  }

  return <TeamPayload>{
    entry_id: normalized.entry_id,
    team_name: normalized.team_name,
    manager_name: normalized.manager_name,
    gw: normalized.gw,
    picks: normalized.picks,
  };
});