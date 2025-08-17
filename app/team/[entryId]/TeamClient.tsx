'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type PositionId = 1 | 2 | 3 | 4; // 1 GK, 2 DEF, 3 MID, 4 FWD

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

type BootstrapTeam = { id: number; short_name: string; name: string };
type BootstrapEvent = { id: number; is_current: boolean; finished: boolean };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');

function byPointsDesc<T extends { gw_points?: number | null }>(a: T, b: T) {
  const av = a.gw_points ?? -1;
  const bv = b.gw_points ?? -1;
  return bv - av;
}

function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x);
}

// --- Robust normalizer: turn any common pick shape into our Pick ---
function normalizePick(raw: any): Pick | null {
  if (!raw) return null;

  // id
  const id = Number(raw.id ?? raw.element ?? raw.player_id ?? raw.code);
  if (!Number.isFinite(id)) return null;

  // web_name / display name
  const web_name: string =
    (typeof raw.web_name === 'string' && raw.web_name) ||
    (typeof raw.name === 'string' && raw.name) ||
    (typeof raw.player_name === 'string' && raw.player_name) ||
    `Player ${id}`;

  // position: 1..4 (GK/DEF/MID/FWD)
  const posRaw = raw.position ?? raw.element_type ?? raw.pos ?? null;
  let position: PositionId | null = null;
  const posNum = Number(posRaw);
  if ([1, 2, 3, 4].includes(posNum)) position = posNum as PositionId;

  // team id
  const teamCandidate = raw.team ?? raw.team_id ?? raw.team_code;
  const team = Number.isFinite(Number(teamCandidate)) ? Number(teamCandidate) : undefined;

  // gw points
  const ptsRaw = raw.gw_points ?? raw.event_points ?? raw.points;
  const gw_points = ptsRaw == null ? null : Number(ptsRaw);

  // captain flag
  const is_captain = Boolean(raw.is_captain ?? raw.captain);

  if (!position) return null;

  return { id, web_name, position, team, gw_points, is_captain };
}

// Accept multiple payload shapes and normalize to TeamPayload
function coerceTeamPayload(raw: unknown): TeamPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Possible containers that hold the picks array
  const candidates = [
    obj.picks,
    obj.squad,
    obj.results,
    obj.players,
    raw, // sometimes it's just an array
  ].filter(Boolean);

  let picks: Pick[] = [];
  for (const c of candidates) {
    if (isArray<any>(c)) {
      const mapped = c.map(normalizePick).filter(Boolean) as Pick[];
      if (mapped.length) {
        picks = mapped;
        break;
      }
    }
  }

  // If still empty, bail
  if (!picks.length) return null;

  const entry_id = typeof obj.entry_id === 'number' ? obj.entry_id : 0;
  const team_name = typeof obj.team_name === 'string' ? obj.team_name : 'Team';
  const manager_name = typeof obj.manager_name === 'string' ? obj.manager_name : 'Manager';
  const gw = typeof obj.gw === 'number' ? obj.gw : 0;

  return { entry_id, team_name, manager_name, gw, picks };
}

const POS_LABEL: Record<PositionId, string> = {
  1: 'Goalkeepers',
  2: 'Defenders',
  3: 'Midfielders',
  4: 'Forwards',
};

export default function TeamClient({ entryId }: { entryId: string }) {
  const [payload, setPayload] = useState<TeamPayload | null>(null);
  const [gw, setGw] = useState<number | null>(null);
  const [teamsMap, setTeamsMap] = useState<Map<number, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: club short codes + current GW
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/bootstrap-static', { cache: 'no-store' });
        const data = await r.json();
        if (cancelled) return;

        // teams map
        const tMap = new Map<number, string>();
        if (isArray<BootstrapTeam>(data?.teams)) {
          for (const t of data.teams) tMap.set(t.id, t.short_name || t.name);
        }
        setTeamsMap(tMap);

        const events = (data?.events ?? []) as BootstrapEvent[];
        const current = events.find((e) => e.is_current) ?? events.find((e) => !e.finished) ?? events[0];
        setGw(current?.id ?? null);
      } catch {
        if (!cancelled) {
          setTeamsMap(new Map());
          setGw(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Team data from FastAPI
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`${API_BASE}/team/${encodeURIComponent(entryId)}`, { cache: 'no-store' });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
        const data = JSON.parse(text) as unknown;
        const coerced = coerceTeamPayload(data);
        if (!coerced) throw new Error('Unexpected team payload shape (no picks found)');
        if (!cancelled) setPayload(coerced);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  // Group & sort within each position
  const grouped = useMemo(() => {
    const bucket: Record<PositionId, Pick[]> = { 1: [], 2: [], 3: [], 4: [] };
    const picks = payload?.picks ?? [];
    for (const p of picks) {
      const pos = p.position;
      if (pos === 1 || pos === 2 || pos === 3 || pos === 4) bucket[pos].push(p);
    }
    (Object.keys(bucket) as unknown as PositionId[]).forEach((pos) => {
      bucket[pos] = bucket[pos].slice().sort(byPointsDesc);
    });
    return bucket;
  }, [payload]);

  // Consistent column widths for Player | Team | Points (GW)
  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
  const thStyle: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #eee', padding: 6, fontSize: 12 };
  const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
  const tdStyle: React.CSSProperties = { padding: 6 };
  const tdRight: React.CSSProperties = { padding: 6, textAlign: 'right' };

  const picksCount = payload?.picks?.length ?? 0;

  return (
    <main style={{ fontFamily: 'Helvetica, Arial, sans-serif', padding: 20, background: '#fff' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Link href="/" style={{ textDecoration: 'underline' }}>← Back to League Table</Link>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {payload ? `${payload.manager_name} — ${payload.team_name}` : 'Team'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {`GW ${payload?.gw ?? gw ?? '…'}`}
          </div>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : err ? (
        <div>
          <p>{`Uh oh, you've gotten ahead of yourself — no team data yet.`}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fafafa', padding: 10, borderRadius: 8, border: '1px solid #eee' }}>
            {err}
          </pre>
        </div>
      ) : !payload ? (
        <p>{`Uh oh, you've gotten ahead of yourself — no team data yet.`}</p>
      ) : (
        <section>
          {/* tiny, safe hint to confirm we're reading picks */}
          {picksCount === 0 && (
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
              No picks parsed from payload.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16 }}>
            {[1, 2, 3, 4].map((pos) => (
              <div key={pos} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {({ 1: 'Goalkeepers', 2: 'Defenders', 3: 'Midfielders', 4: 'Forwards' } as const)[pos as PositionId]}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <colgroup>
                      <col style={{ width: '52%' }} />
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={thStyle}>Player</th>
                        <th style={thStyle}>Team</th>
                        <th style={thRight}>Points (GW)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[pos as PositionId].length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: 6, opacity: 0.65 }}>—</td></tr>
                      ) : (
                        grouped[pos as PositionId].map((p) => (
                          <tr key={`${pos}-${p.id}`}>
                            <td style={tdStyle}>
                              {p.web_name}
                              {p.is_captain ? (
                                <span title="Captain" style={{ marginLeft: 6, fontSize: 11, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 6 }}>🅒</span>
                              ) : null}
                            </td>
                            <td style={tdStyle}>
                              {p.team ? (teamsMap.get(p.team) ?? `Team ${p.team}`) : '—'}
                            </td>
                            <td style={tdRight}>{p.gw_points ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
