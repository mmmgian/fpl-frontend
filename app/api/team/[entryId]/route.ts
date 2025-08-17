export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

type PositionId = 1 | 2 | 3 | 4;
type Pick = {
  id: number;
  web_name: string;
  position: PositionId;
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

function getNum(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function getStr(x: unknown): string | null {
  return typeof x === 'string' ? x : null;
}
function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x);
}

type BootstrapElement = { id: number; web_name: string; team: number; element_type: PositionId };

async function fetchBootstrapViaSelf(origin: string): Promise<Map<number, BootstrapElement>> {
  // use our own proxy to avoid FPL 403 / edge quirks
  const r = await fetch(`${origin}/api/bootstrap-static`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`bootstrap proxy ${r.status}`);
  const json: unknown = await r.json();

  const map = new Map<number, BootstrapElement>();
  const elements = (json as { elements?: unknown })?.elements;
  if (isArray<unknown>(elements)) {
    for (const el of elements) {
      if (!el || typeof el !== 'object') continue;
      const rec = el as Record<string, unknown>;
      const id = getNum(rec.id);
      const web_name = getStr(rec.web_name) ?? (id != null ? `Player ${id}` : 'Player ?');
      const team = getNum(rec.team) ?? 0;
      const et = getNum(rec.element_type) as PositionId | null;
      if (id != null && et && [1, 2, 3, 4].includes(et)) {
        map.set(id, { id, web_name, team, element_type: et });
      }
    }
  }
  return map;
}

function normalizePickRaw(raw: unknown, boot: Map<number, BootstrapElement>): Pick | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = getNum(obj.id ?? obj.element ?? obj.player_id ?? obj.code);
  if (id == null) return null;

  const fromBoot = boot.get(id);

  const posNum =
    getNum(obj.position ?? obj.element_type ?? obj.pos) ??
    (fromBoot ? fromBoot.element_type : null);
  const position = posNum && [1, 2, 3, 4].includes(posNum) ? (posNum as PositionId) : null;
  if (!position) return null;

  const team =
    getNum(obj.team ?? obj.team_id ?? obj.team_code) ??
    (fromBoot ? fromBoot.team : undefined);

  const web_name =
    getStr(obj.web_name) ??
    getStr(obj.name) ??
    getStr(obj.player_name) ??
    (fromBoot ? fromBoot.web_name : `Player ${id}`);

  const pts = obj.gw_points ?? obj.event_points ?? obj.points;
  const gw_points = pts == null ? null : getNum(pts);

  const is_captain = Boolean((obj.is_captain ?? obj.captain) as unknown);

  return { id, web_name: web_name!, position, team, gw_points: gw_points ?? null, is_captain };
}

function coerceTeamContainer(
  raw: unknown
): { picksLike: unknown[]; meta: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const teamMaybe = obj.team;
  const nestedPicks =
    teamMaybe && typeof teamMaybe === 'object'
      ? (teamMaybe as Record<string, unknown>).picks
      : undefined;

  const candidates: unknown[] = [
    obj.picks,
    obj.squad,
    obj.results,
    obj.players,
    obj.data,
    nestedPicks,
    raw,
  ].filter(Boolean);

  for (const c of candidates) {
    if (isArray<unknown>(c)) {
      return { picksLike: c, meta: obj };
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await context.params;
  const origin = new URL(req.url).origin;

  const BACKEND = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');
  const url = `${BACKEND}/team/${encodeURIComponent(entryId)}`;

  // tiny timeout so Route Handler doesn’t hang if Render is cold
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000); // 12s

  try {
    // 1) Fetch backend team JSON (Render may be cold)
    const r = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        accept: 'application/json,text/plain,*/*',
      },
    });
    const text = await r.text();
    if (!r.ok) {
      clearTimeout(tid);
      return NextResponse.json(
        { error: `Upstream ${r.status}`, body: text.slice(0, 500) },
        { status: 502 } // surface as 502 to the page
      );
    }

    const upstream: unknown = JSON.parse(text);

    // 2) Find picks
    const container = coerceTeamContainer(upstream);
    if (!container) {
      clearTimeout(tid);
      return NextResponse.json({ error: 'No picks array in upstream' }, { status: 502 });
    }

    // 3) Bootstrap via our own proxy to avoid 403
    const boot = await fetchBootstrapViaSelf(origin);

    // 4) Enrich picks
    const picks: Pick[] = [];
    for (const raw of container.picksLike) {
      const p = normalizePickRaw(raw, boot);
      if (p) picks.push(p);
    }
    if (picks.length === 0) {
      clearTimeout(tid);
      return NextResponse.json(
        { error: 'Could not normalize picks (missing element_type/position?)' },
        { status: 502 }
      );
    }

    // 5) Build payload
    const meta = container.meta;
    const entry_id =
      getNum(meta.entry_id) ?? getNum((meta as Record<string, unknown>).entry) ?? 0;
    const team_name =
      getStr(meta.team_name) ?? getStr((meta as Record<string, unknown>).entry_name) ?? 'Team';
    const manager_name =
      getStr(meta.manager_name) ??
      getStr((meta as Record<string, unknown>).player_name) ??
      'Manager';
    const gw = getNum(meta.gw) ?? getNum((meta as Record<string, unknown>).event) ?? 0;

    const payload: TeamPayload = { entry_id, team_name, manager_name, gw, picks };

    clearTimeout(tid);
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    clearTimeout(tid);
    // If it was an abort, tell the client explicitly
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `team proxy failed: ${msg}` }, { status: 502 });
  }
}
