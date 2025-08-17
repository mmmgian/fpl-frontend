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

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');
const LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID || '1391467';

async function fetchWithRetry(url: string, attempts = 3, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { standings: Standing[] };
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // unreachable
  return { standings: [] };
}

export default function HomePage() {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithRetry(`${API_BASE}/league/${encodeURIComponent(LEAGUE_ID)}`);
        if (!cancelled) setRows(data.standings ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ fontFamily: 'Helvetica, Arial, sans-serif', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>🦞 The Lobster League</h1>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link href="/history">History</Link>
          <Link href="/bonus">Bonus</Link>
        </nav>
      </header>

      <section style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>League Table</span>
          <span style={{ fontSize: 12, opacity: 0.65 }}>ID {LEAGUE_ID}</span>
        </div>

        {err ? (
          <div>
            <p>{`Uh oh, you've gotten ahead of yourself — no league data yet.`}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fafafa', padding: 10, borderRadius: 8, border: '1px solid #eee' }}>
              {String(err)}
            </pre>
          </div>
        ) : rows === null ? (
          <p>Loading…</p>
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
                {rows.map((r) => (
                  <tr key={r.entry}>
                    <td style={{ padding: 8 }}>{r.rank}</td>
                    <td style={{ padding: 8 }}>
                      {/* Only team name is linked */}
                      <Link href={`/team/${r.entry}`} style={{ textDecoration: 'underline' }}>
                        {r.entry_name}
                      </Link>
                    </td>
                    <td style={{ padding: 8, opacity: 0.8 }}>{r.player_name}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{r.event_total ?? '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{r.total}</td>
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
