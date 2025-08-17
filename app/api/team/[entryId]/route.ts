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
function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

type BootstrapEvent = { id: number; is_current: boolean; finished: boolean };
type BootstrapElement = { id: number; web_name: string; team: number; element_type: PositionId };

async function fetchBootstrapViaSelf(origin: string): Promise<{
  map: Map<number, BootstrapElement>;
  currentGw: number | null;
}> {
  const r = await fetch(`${origin}/api/bootstrap-static`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`bootstrap proxy ${r.status}`);
  const json: unknown = await r.json();

  const map = new Map<number, BootstrapElement>();
  const elements = (json as { elements?: unknown })?.elements;
  if (isArray<unknown>(elements)) {
    for (const el of elements) {
      if (!isObject(el)) continue;
      const id = getNum(el.id);
      const web_name = getStr(el.web_name) ?? (id != null ? `Player ${id}` : 'Player ?');
      const team = getNum(el.team) ?? 0;
      const et = getNum(el.element_type) as PositionId | null;
      if (id != null && et && [1, 2, 3, 4].includes(et)) {
        map.set(id, { id, web_name, team, element_type: et });
      }
    }
  }

  let currentGw: number | null = null;
  const events = (json as { events?: unknown })?.events;
  if (isArray<unknown>(events)) {
    const evs = events as BootstrapEvent[];
    const current = evs.find(e => e.is_current) ?? evs.find(e => !e.finished) ?? evs[0];
    currentGw = current?.id ?? null;
  }

  return { map, currentGw };
}

function normalizePickRaw(raw: unknown, boot: Map<number, BootstrapElement>): Pick | null {
  if (!isObject(raw)) return null;
  const id = getNum(raw.id ?? raw.element ?? raw.player_id ?? raw.code);
  if (id == null) return null;

  const fromBoot = boot.get(id);
  const posNum = getNum(raw.position ?? raw.element_type ?? raw.pos) ?? (fromBoot ? fromBoot.element_type : null);
  const position = posNum && [1, 2, 3, 4].includes(posNum) ? (posNum as PositionId) : null;
  if (!position) return null;

  const team = getNum(raw.team ?? raw.team_id ?? raw.team_code) ?? (fromBoot ? fromBoot.team : undefined);
  const web_name =
    getStr(raw.web_name) ??
    getStr(raw.name) ??
    getStr(raw.player_name) ??
    (fromBoot ? fromBoot.web_name : `Player ${id}`);

  const pts = (raw as Record<string, unknown>).gw_points ?? (raw as Record<string, unknown>).event_points ?? (raw as Record<string, unknown>).points;
  const gw_points = pts == null ? null : getNum(pts);
  const is_captain = Boolean(((raw as Record<string, unknown>).is_captain ?? (raw as Record<string, unknown>).captain) as unknown);

  return { id, web_name: web_name!, position, team, gw_points: gw_points ?? null, is_captain };
}

// Deep scan for any array that looks like picks (fallback if backend shape is unknown)
function looksLikePick(o: unknown): boolean {
  if (!isObject(o)) return false;
  const idish = 'element' in o || 'id' in o || 'player_id' in o || 'code' in o;
  const hasCaptain = 'is_captain' in o || 'captain' in o;
  const hasPoints = 'gw_points' in o || 'event_points' in o || 'points' in o;
  return idish || hasCaptain || hasPoints;
}
function findPicksArrayDeep(root: unknown, maxDepth = 4): unknown[] | null {
  type Node = { v: unknown; depth: number };
  const queue: Node[] = [{ v: root, depth: 0 }];
  while (queue.length) {
    const { v, depth } = queue.shift() as Node;
    if (isArray<unknown>(v)) {
      if (v.length && v.every(x => isObject(x)) && v.some(x => looksLikePick(x))) return v;
      if (depth < maxDepth) for (const x of v) queue.push({ v: x, depth: depth + 1 });
      continue;
    }
    if (isObject(v) && depth < maxDepth) {
      for (const val of Object.values(v)) queue.push({ v: val, depth: depth + 1 });
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
  const teamURL = `${BACKEND}/team/${encodeURIComponent(entryId)}`;

  // small timeout so we don’t hang if Render is cold
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);

  try {
    // Bootstrap map + current GW
    const { map: boot, currentGw } = await fetchBootstrapViaSelf(origin);

    // Try the backend first
    const r = await fetch(teamURL, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        accept: 'application/json,text/plain,*/*',
      },
    });
    const text = await r.text();

    if (r.ok) {
      const upstream: unknown = JSON.parse(text);
      const picksLike = findPicksArrayDeep(upstream);
      if (picksLike) {
        const picks: Pick[] = [];
        for (const raw of picksLike) {
          const p = normalizePickRaw(raw, boot);
          if (p) picks.push(p);
        }
        if (picks.length) {
          // best-effort meta
          const metaObj = isObject(upstream) ? upstream : {};
          const entry_id = getNum((metaObj as Record<string, unknown>).entry_id) ?? getNum((metaObj as Record<string, unknown>).entry) ?? Number(entryId);
          const team_name = getStr((metaObj as Record<string, unknown>).team_name) ?? getStr((metaObj as Record<string, unknown>).entry_name) ?? 'Team';
          const manager_name = getStr((metaObj as Record<string, unknown>).manager_name) ?? getStr((metaObj as Record<string, unknown>).player_name) ?? 'Manager';
          const gw = getNum((metaObj as Record<string, unknown>).gw) ?? getNum((metaObj as Record<string, unknown>).event) ?? (currentGw ?? 0);
          clearTimeout(tid);
          return NextResponse.json({ entry_id, team_name, manager_name, gw, picks } satisfies TeamPayload, {
            status: 200,
            headers: { 'cache-control': 'no-store' },
          });
        }
      }
      // If backend responded but without usable picks, fall through to direct FPL.
    }

    // Fallback: fetch direct from official FPL API (server-side)
    if (!currentGw) throw new Error('No current GW from bootstrap');

    const entrySummaryURL = `https://fantasy.premierleague.com/api/entry/${encodeURIComponent(entryId)}/`;
    const entryPicksURL = `https://fantasy.premierleague.com/api/entry/${encodeURIComponent(entryId)}/event/${currentGw}/picks/`;

    const headers = {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      accept: 'application/json,text/plain,*/*',
      referer: 'https://fantasy.premierleague.com/',
    };

    const [entryRes, picksRes] = await Promise.all([
      fetch(entrySummaryURL, { cache: 'no-store', headers }),
      fetch(entryPicksURL, { cache: 'no-store', headers }),
    ]);

    if (!entryRes.ok) throw new Error(`entry ${entryRes.status}`);
    if (!picksRes.ok) throw new Error(`picks ${picksRes.status}`);

    const entryJson: unknown = await entryRes.json();
    const picksJson: unknown = await picksRes.json();

    // From entry summary
    const team_name =
      (isObject(entryJson) && getStr((entryJson as Record<string, unknown>).name)) || 'Team';
    const manager_name =
      (isObject(entryJson) &&
        `${getStr((entryJson as Record<string, unknown>).player_first_name) ?? ''} ${
          getStr((entryJson as Record<string, unknown>).player_last_name) ?? ''
        }`.trim()) ||
      'Manager';

    // From picks endpoint: picks[]
    const picksArr = isObject(picksJson)
      ? ((picksJson as Record<string, unknown>).picks as unknown)
      : undefined;
    if (!isArray<unknown>(picksArr)) throw new Error('no picks[] from FPL');

    // Enrich each pick from bootstrap
    const picks: Pick[] = [];
    for (const raw of picksArr) {
      if (!isObject(raw)) continue;
      const elementId = getNum(raw.element);
      if (elementId == null) continue;

      const bootEl = boot.get(elementId);
      if (!bootEl) continue;

      const is_captain = Boolean(raw.is_captain as unknown);
      const gw_points = null; // FPL picks API doesn’t include per-pick gw points; keep null

      picks.push({
        id: elementId,
        web_name: bootEl.web_name,
        position: bootEl.element_type,
        team: bootEl.team,
        gw_points,
        is_captain,
      });
    }

    clearTimeout(tid);
    return NextResponse.json(
      {
        entry_id: Number(entryId),
        team_name,
        manager_name,
        gw: currentGw ?? 0,
        picks,
      } satisfies TeamPayload,
      { status: 200, headers: { 'cache-control': 'no-store' } }
    );
  } catch (err) {
    clearTimeout(tid);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `team proxy failed: ${msg}` }, { status: 502 });
  }
}
