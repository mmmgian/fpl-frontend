import type { Bootstrap } from '../bootstrap-static.get';
import type { Fixture } from '../fixtures.get';

type Pos = 1|2|3|4;
type Pick = { id:number; web_name:string; position:Pos; team?:number; gw_points?:number|null; is_captain?:boolean };
export type TeamPayload = { entry_id:number; team_name:string; manager_name:string; gw:number|null; picks:Pick[] };

const asNum = (x: unknown, d: number | null = null): number | null => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};
const asStr = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);

async function readBootstrap(event: H3Event): Promise<{ map: Map<number, { web_name:string; team:number; element_type:Pos }>; currentGw: number | null; }> {
  const origin = getRequestURL(event).origin;
  const boot = await $fetch<Bootstrap>('/api/bootstrap-static', { baseURL: origin, cache: 'no-store' });

  const byId = new Map<number, { web_name:string; team:number; element_type:Pos }>();
  for (const el of boot.elements ?? []) {
    const id = asNum(el?.id);
    const et = asNum(el?.element_type) as Pos | null;
    if (id && et && (et === 1 || et === 2 || et === 3 || et === 4)) {
      byId.set(id, { web_name: el.web_name, team: el.team, element_type: et });
    }
  }
  const ev = boot.events ?? [];
  const cur = ev.find(e => e?.is_current) ?? ev.find(e => !e?.finished) ?? ev[0];
  const currentGw = asNum(cur?.id, null);
  return { map: byId, currentGw };
}

async function livePoints(gw: number): Promise<Map<number, number>> {
  const url = `https://fantasy.premierleague.com/api/event/${gw}/live/`;
  const data = await $fetch<{ elements: { id:number; stats: { total_points:number } }[] }>(url, {
    headers: { referer: 'https://fantasy.premierleague.com/' }
  });
  const m = new Map<number, number>();
  for (const el of data.elements ?? []) {
    const id = asNum(el.id);
    const pts = asNum(el.stats?.total_points);
    if (id != null && pts != null) m.set(id, pts);
  }
  return m;
}

export default defineEventHandler(async (event): Promise<TeamPayload> => {
  const { entryId } = getRouterParams(event);
  const cfg = useRuntimeConfig();
  const base = (cfg.public.apiBase || '').replace(/\/+$/, '');
  const { map: boot, currentGw } = await readBootstrap(event);
  
  // 1) Try your backend for normalized team
  if (base) {
    try {
      const upstream = await $fetch<any>(`${base}/team/${encodeURIComponent(entryId)}`, { cache: 'no-store' });
      const gw = (asNum(upstream?.gw ?? upstream?.event ?? currentGw ?? 0, 0) ?? 0);
      const live = gw ? await livePoints(gw) : new Map<number, number>();

      const rawPicks =
        (Array.isArray(upstream?.picks) && upstream.picks) ||
        (Array.isArray(upstream?.picks?.picks) && upstream.picks.picks) ||
        [];

      const picks: Pick[] = [];
      for (const r of rawPicks as unknown[]) {
        const id = asNum((r as any)?.id ?? (r as any)?.element ?? (r as any)?.player_id ?? (r as any)?.code);
        if (id == null) continue;
        const b = boot.get(id);
        if (!b) continue;
        const gw_points = asNum((r as any)?.gw_points ?? (r as any)?.event_points ?? (r as any)?.points, null);
        picks.push({
          id,
          web_name: b.web_name,
          position: b.element_type,
          team: b.team,
          gw_points: gw_points ?? live.get(id) ?? null,
          is_captain: Boolean((r as any)?.is_captain ?? (r as any)?.captain)
        });
      }
      if (picks.length) {
        return {
          entry_id: asNum(upstream?.entry_id ?? upstream?.entry ?? entryId, Number(entryId))!,
          team_name: asStr(upstream?.team_name ?? upstream?.entry_name, 'Team'),
          manager_name: asStr(upstream?.manager_name ?? upstream?.player_name, 'Manager'),
          gw,
          picks
        };
      }
    } catch {
      // fall through to FPL
    }
  }

  // 2) Fallback to official FPL (requires current GW)
  if (!currentGw) {
    throw createError({ statusCode: 502, statusMessage: 'No current GW available from bootstrap.' });
  }

  const [entry, picksJson, live] = await Promise.all([
    $fetch<{ name?:string; player_first_name?:string; player_last_name?:string }>(
      `https://fantasy.premierleague.com/api/entry/${encodeURIComponent(entryId)}/`,
      { headers: { referer: 'https://fantasy.premierleague.com/' } }
    ),
    $fetch<{ picks: { element:number; is_captain:boolean }[] }>(
      `https://fantasy.premierleague.com/api/entry/${encodeURIComponent(entryId)}/event/${currentGw}/picks/`,
      { headers: { referer: 'https://fantasy.premierleague.com/' } }
    ),
    livePoints(currentGw)
  ]);

  const picks: Pick[] = [];
  for (const r of picksJson?.picks ?? []) {
    const id = asNum(r.element);
    if (id == null) continue;
    const b = boot.get(id);
    if (!b) continue;
    picks.push({
      id,
      web_name: b.web_name,
      position: b.element_type,
      team: b.team,
      gw_points: live.get(id) ?? null,
      is_captain: Boolean(r.is_captain)
    });
  }

  return {
    entry_id: Number(entryId),
    team_name: asStr(entry?.name, 'Team'),
    manager_name: `${asStr(entry?.player_first_name)} ${asStr(entry?.player_last_name)}`.trim() || 'Manager',
    gw: currentGw,
    picks
  };
});