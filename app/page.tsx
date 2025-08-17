'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Standing = {
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  total: number;
  event_total?: number;
};

interface LeagueResponseA { standings?: Standing[] }                    // { standings: [...] }
interface LeagueResponseB { standings?: { results?: Standing[] } }      // { standings: { results: [...] } }
interface LeagueResponseC { results?: Standing[] }                      // { results: [...] }
type LeagueResponse = LeagueResponseA | LeagueResponseB | LeagueResponseC | unknown;

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID || '1391467';

async function fetchJSONWithRetry<T>(url: string, attempts = 3, delayMs = 1200): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function pickStandings(data: LeagueResponse): Standing[] {
  // shape 1: { standings: Standing[] }
  if (typeof data === 'object' && data && 'standings' in data) {
    const s1 = (data as LeagueResponseA).standings;
    if (Array.isArray(s1)) return s1;

    // shape 2: { standings: { results: Standing[] } }
    const s2 = (data as LeagueResponseB).standings;
    if (s2 && typeof s2 === 'object' && 'results' in s2 && Array.isArray(s2.results)) {
      return s2.results as Standing[];
    }
  }
  // shape 3: { results: Standing[] }
  if (typeof data === 'object' && data && 'results' in data) {
    const r = (data as LeagueResponseC).results;
    if (Array.isArray(r)) return r;
  }
  return [];
}

export default function HomePage() {
  const [rows, setRows] = useState<Standing[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchJSONWithRetry<LeagueResponse>(
          `${API_BASE}/league/${encodeURIComponent(LEAGUE_ID)}`
        );
        const list = pickStandings(data);
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ fontFamily: 'Helvetica, Arial, sans-serif', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>🦞 The Lobster League</h1>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link href="/history" style={{ textDecoration: 'underline' }}>History</Link>
          <Link href="/bonus" style={{ textDecoration: 'underline' }}>Bonus</Link>
        </nav>
      </header>

      <section style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>League Table</span>
          <span style={{ fontSize: 12, opacity: 0.65 }}>ID {LEAGUE_ID}</span>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : err ? (
          <div>
            <p>{`Uh oh, you've gotten ahead of yourself — no league data yet.`}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fafafa', padding: 10, borderRadius: 8, border: '1px solid #eee' }}>
              {err}
            </pre>
          </div>
        ) : rows.length === 0 ? (
          <p>{`Uh oh, you've gotten ahead of yourself — no league data yet.`}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', padding: 8, fontSize: 12 }}>#</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', padding: 8, fontSize: 12 }}>Team</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', padding: 8, fontSize: 12 }}>Manager</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e5e5', padding: 8, fontSize: 12 }}>GW</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e5e5', padding: 8, fontSize: 12 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.entry}>
                    <td style={{ padding: 8 }}>{row.rank}</td>
                    <td style={{ padding: 8 }}>
                      <Link href={`/team/${row.entry}`} style={{ textDecoration: 'underline' }}>
                        {row.entry_name}
                      </Link>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{row.player_name}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{row.event_total ?? '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
