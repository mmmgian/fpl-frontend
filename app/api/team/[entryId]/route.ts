export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

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

function normalizePick(raw: unknown): Pick | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = getNum(obj.id ?? obj.element ?? obj.player_id ?? obj.code);
  if (id == null) return null;

  const web_name =
    getStr(obj.web_name) ||
    getStr(obj.name) ||
    getStr(obj.player_name) ||
    `Player ${id}`;

  const posNum = getNum(obj.position ?? obj.element_type ?? obj.pos);
  const position = posNum && [1,2,3,4].includes(posNum) ? (posNum as PositionId) : null;
  if (!position) return null;

  const teamNum = getNum(obj.team ?? obj.team_id ?? obj.team_code) ?? undefined;

  const pts = obj.gw_points ?? obj.event_points ?? obj.points;
  const gw_points = pts == null ? null : getNum(pts);

  const is_captain = Boolean((obj.is_captain ?? obj.captain) as unknown);

  return { id, web_name: web_name || `Player ${id}`, position, team: teamNum, gw_points: gw_points ?? null, is_captain };
}

function coerceTeamPayload(raw: unknown): TeamPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const candidates: unknown[] = [
    obj.picks,
    obj.squad,
    obj.results,
    obj.players,
    raw, // sometimes it's just an array
  ].filter(Boolean);

  let picks: Pick[] = [];
  for (const c of candidates) {
    if (isArray<unknown>(c)) {
      const mapped = c.map(normalizePick).filter(Boolean) as Pick[];
      if (mapped.length) { picks = mapped; break; }
    }
  }
  if (!picks.length) return null;

  const entry_id = getNum(obj.entry_id) ?? 0;
  const team_name = getStr(obj.team_name) ?? 'Team';
  const manager_name = getStr(obj.manager_name) ?? 'Manager';
  const gw = getNum(obj.gw) ?? 0;

  return { entry_id, team_name, manager_name, gw, picks };
}

export async function GET(
  _req: Request,
  { params }: { params: { entryId: string } }
) {
  const entryId = params.entryId;
  const BACKEND = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');
  const url = `${BACKEND}/team/${encodeURIComponent(entryId)}`;

  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'accept': 'application/json,text/plain,*/*',
      },
    });

    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json({ error: `Upstream ${r.status}`, body: text.slice(0, 500) }, { status: r.status });
    }

    const raw = JSON.parse(text);
    const normalized = coerceTeamPayload(raw);
    if (!normalized) {
      return NextResponse.json({ error: 'Could not normalize team payload' }, { status: 502 });
    }

    return NextResponse.json(normalized, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('team proxy error', err);
    return NextResponse.json({ error: 'team proxy failed' }, { status: 502 });
  }
}
