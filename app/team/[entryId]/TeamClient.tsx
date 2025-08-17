'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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

type BootstrapTeam = { id: number; short_name: string; name: string };
type BootstrapEvent = { id: number; is_current: boolean; finished: boolean };

function byPointsDesc<T extends { gw_points?: number | null }>(a: T, b: T) {
  const av = a.gw_points ?? -1;
  const bv = b.gw_points ?? -1;
  return bv - av;
}
function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x);
}

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
    return () => { cancelled = true; };
  }, []);

  // Team data via our Next proxy (already normalized + gw_points via live)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/team/${encodeURIComponent(entryId)}`, { cache: 'no-store' });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
        const data = JSON.parse(text) as TeamPayload;
        if (!cancelled) setPayload(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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

  // ——— CDG-ish minimal styles ———
  const pageStyle: React.CSSProperties = {
    fontFamily: 'Helvetica, Arial, sans-serif',
    background: '#fff',
    color: '#111',
    padding: '28px 20px 40px',
    lineHeight: 1.35,
    letterSpacing: '0.005em',
  };

  const shellStyle: React.CSSProperties = {
    maxWidth: 1100,
    margin: '0 auto',
  };

  const hairline = '1px solid rgba(0,0,0,0.08)';

  const pillStyle: React.CSSProperties = {
    display: 'inline-block',
    border: hairline,
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const headerTopStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  };

  const backStyle: React.CSSProperties = {
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    fontSize: 12,
  };

  const titleBlock: React.CSSProperties = {
    display: 'grid',
    gap: 2,
    textAlign: 'right',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.01em',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    opacity: 0.7,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
    gap: 18,
    marginTop: 18,
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: hairline,
    borderRadius: 12,
    padding: 14,
  };

  const sectionLabelStyle: React.CSSProperties = {
    ...pillStyle,
    padding: '5px 10px',
    marginBottom: 10,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  };

  const headCellBase: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: hairline,
    padding: '8px 4px',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.10em',
    opacity: 0.8,
  };

  const headCellRight: React.CSSProperties = { ...headCellBase, textAlign: 'right' };
  const cell: React.CSSProperties = { padding: '8px 4px', borderBottom: '1px dashed rgba(0,0,0,0.06)' };
  const cellRight: React.CSSProperties = { ...cell, textAlign: 'right' };

  const capBadge: React.CSSProperties = {
    marginLeft: 6,
    fontSize: 10,
    padding: '1px 5px',
    border: hairline,
    borderRadius: 6,
    verticalAlign: '1px',
  };

  const teamMuted: React.CSSProperties = { opacity: 0.7 };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        {/* Top bar */}
        <div style={headerTopStyle}>
          <Link href="/" style={backStyle}>← Back to League Table</Link>
          <div style={titleBlock}>
            <div style={titleStyle}>
              {payload ? `${payload.manager_name} — ${payload.team_name}` : 'Team'}
            </div>
            <div style={subtitleStyle}>Gameweek {payload?.gw ?? gw ?? '…'}</div>
          </div>
        </div>

        {/* Thin divider */}
        <div style={{ borderTop: hairline, marginTop: 8, marginBottom: 14 }} />

        {loading ? (
          <p style={{ marginTop: 20 }}>Loading…</p>
        ) : err ? (
          <div style={{ marginTop: 16 }}>
            <p>{`Uh oh, you've gotten ahead of yourself — no team data yet.`}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fafafa', padding: 10, borderRadius: 8, border: hairline }}>
              {err}
            </pre>
          </div>
        ) : !payload ? (
          <p style={{ marginTop: 20 }}>{`Uh oh, you've gotten ahead of yourself — no team data yet.`}</p>
        ) : (
          <section>
            <div style={gridStyle}>
              {[1, 2, 3, 4].map((pos) => (
                <div key={pos} style={cardStyle}>
                  <div style={sectionLabelStyle}>
                    {({ 1: 'Goalkeepers', 2: 'Defenders', 3: 'Midfielders', 4: 'Forwards' } as const)[pos as PositionId]}
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <colgroup>
                        <col style={{ width: '54%' }} />
                        <col style={{ width: '26%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={headCellBase}>Player</th>
                          <th style={headCellBase}>Team</th>
                          <th style={headCellRight}>Points (GW)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[pos as PositionId].length === 0 ? (
                          <tr><td colSpan={3} style={{ padding: 8, opacity: 0.5 }}>—</td></tr>
                        ) : (
                          grouped[pos as PositionId].map((p) => (
                            <tr key={`${pos}-${p.id}`}>
                              <td style={cell}>
                                {p.web_name}
                                {p.is_captain ? <span title="Captain" style={capBadge}>🅒</span> : null}
                              </td>
                              <td style={{ ...cell, ...teamMuted }}>
                                {p.team ? (teamsMap.get(p.team) ?? `Team ${p.team}`) : '—'}
                              </td>
                              <td style={cellRight}>{p.gw_points ?? '—'}</td>
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
      </div>
    </main>
  );
}
