'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
export const dynamic = 'force-dynamic';


type TeamEntry = {
  entry: number;
  entry_name: string;
  player_name: string;
  total: number;
  event_total?: number | null;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');

function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x);
}
function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
function num(x: unknown, d = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}
function str(x: unknown, d = ''): string {
  return typeof x === 'string' ? x : d;
}

// Coerce whatever the backend sends into TeamEntry[]
function coerceRows(raw: unknown): TeamEntry[] {
  // direct array
  if (isArray<unknown>(raw)) return raw.map(toEntry).filter(Boolean) as TeamEntry[];

  // object with a nested array
  if (isObject(raw)) {
    const obj = raw as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.results,
      obj.entries,
      obj.standings,
      (obj.league as Record<string, unknown> | undefined)?.standings,
      (obj.table as unknown),
    ].filter(Boolean);

    for (const c of candidates) {
      if (isArray<unknown>(c)) return c.map(toEntry).filter(Boolean) as TeamEntry[];
    }
  }

  return [];
}

function toEntry(x: unknown): TeamEntry | null {
  if (!isObject(x)) return null;
  const o = x as Record<string, unknown>;
  const entry = num(o.entry ?? o.id);
  const entry_name = str(o.entry_name ?? o.team_name);
  const player_name = str(o.player_name ?? o.manager_name);
  const total = num(o.total ?? o.points);
  const event_total = o.event_total != null ? num(o.event_total) : null;

  if (!entry_name && !player_name) return null;
  return { entry, entry_name, player_name, total, event_total };
}

export default function HomePage() {
  const [rows, setRows] = useState<TeamEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`${API_BASE}/league/1391467`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to fetch league: ${res.status}`);
        const data: unknown = await res.json();

        // Accept shapes:
        // { standings: [...] } | { standings: { results: [...] } } | array of rows, etc.
        const arr = isObject(data)
          ? coerceRows((data as Record<string, unknown>).standings ?? data)
          : coerceRows(data);

        if (!cancelled) setRows(arr);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ——— CDG-ish minimal styles ———
  const hairline = '1px solid rgba(0,0,0,0.08)';
  const page: React.CSSProperties = {
    fontFamily: 'Helvetica, Arial, sans-serif',
    background: '#fff',
    color: '#111',
    padding: '28px 20px 40px',
    lineHeight: 1.35,
    letterSpacing: '0.005em',
  };
  const shell: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
  const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, letterSpacing: '0.01em', marginBottom: 6 };
  const sub: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7 };
  const tableWrap: React.CSSProperties = { marginTop: 16, background: '#fff', border: hairline, borderRadius: 12, overflow: 'hidden' };
  const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', borderBottom: hairline, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.10em', opacity: 0.8 };
  const thRight: React.CSSProperties = { ...th, textAlign: 'right' as const };
  const td: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px dashed rgba(0,0,0,0.06)', fontSize: 14 };
  const tdRight: React.CSSProperties = { ...td, textAlign: 'right' as const };
  const linkTeam: React.CSSProperties = { textDecoration: 'underline', textUnderlineOffset: 3 };

  return (
    <main style={page}>
      <div style={shell}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={h1}>League Table</h1>
          <div style={sub}>ID 1391467</div>
        </div>

        <div style={{ borderTop: hairline, marginTop: 8, marginBottom: 14 }} />

        {loading ? (
          <p>Loading…</p>
        ) : err ? (
          <p style={{ opacity: 0.75 }}>
            {`Uh oh, you\u2019ve gotten ahead of yourself — no league data yet.`}
            <br />
            <small>{err}</small>
          </p>
        ) : rows.length === 0 ? (
          <p style={{ opacity: 0.75 }}>
            {`Uh oh, you\u2019ve gotten ahead of yourself — no league data yet.`}
            <br />
            <small>Make sure your backend is awake and returning /league/1391467.</small>
          </p>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <colgroup>
                <col style={{ width: '7ch' }} />
                <col style={{ width: '44%' }} />
                <col style={{ width: '33%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Team</th>
                  <th style={th}>Manager</th>
                  <th style={thRight}>Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={t.entry || `${t.entry_name}-${i}`}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}>
                      <Link href={`/team/${t.entry}`} style={linkTeam}>{t.entry_name}</Link>
                    </td>
                    <td style={{ ...td, opacity: 0.8 }}>{t.player_name}</td>
                    <td style={tdRight}>{t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Link className="btn" href="/history" style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 12 }}>History</Link>
          <Link className="btn" href="/bonus" style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 12 }}>Bonus</Link>
        </nav>
      </div>
    </main>
  );
}
