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

  // Team data via our Next proxy (already normalized)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/team/${encodeURIComponent(entryId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const data = (await res.json()) as TeamPayload;
        setPayload(data);

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

  // Table styles
  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
  const thStyle: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #eee', padding: 6, fontSize: 12 };
  const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
  const tdStyle: React.CSSProperties = { padding: 6 };
  const tdRight: React.CSSProperties = { padding: 6, textAlign: 'right' };

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
                            <td style={tdStyle}>{p.team ? (teamsMap.get(p.team) ?? `Team ${p.team}`) : '—'}</td>
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
