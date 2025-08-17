'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type BonusEntry = { element: number; value: number };
type BonusStat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };

type Fixture = {
  id: number;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  kickoff_time: string | null;
  started?: boolean;
  finished?: boolean;
  stats: BonusStat[];
};

type Player = { id: number; web_name: string };
type Event = { id: number; is_current: boolean; finished: boolean };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://fpl-backend-poix.onrender.com').replace(/\/+$/, '');

const teamCrests: Record<number, string> = {
  1: "https://resources.premierleague.com/premierleague/badges/t3.png",
  2: "https://resources.premierleague.com/premierleague/badges/t7.png",
  3: "https://resources.premierleague.com/premierleague/badges/t91.png",
  4: "https://resources.premierleague.com/premierleague/badges/t94.png",
  5: "https://resources.premierleague.com/premierleague/badges/t36.png",
  6: "https://resources.premierleague.com/premierleague/badges/t8.png",
  7: "https://resources.premierleague.com/premierleague/badges/t31.png",
  8: "https://resources.premierleague.com/premierleague/badges/t11.png",
  9: "https://resources.premierleague.com/premierleague/badges/t54.png",
  10: "https://resources.premierleague.com/premierleague/badges/t40.png",
  11: "https://resources.premierleague.com/premierleague/badges/t13.png",
  12: "https://resources.premierleague.com/premierleague/badges/t14.png",
  13: "https://resources.premierleague.com/premierleague/badges/t43.png",
  14: "https://resources.premierleague.com/premierleague/badges/t1.png",
  15: "https://resources.premierleague.com/premierleague/badges/t4.png",
  16: "https://resources.premierleague.com/premierleague/badges/t17.png",
  17: "https://resources.premierleague.com/premierleague/badges/t20.png",
  18: "https://resources.premierleague.com/premierleague/badges/t6.png",
  19: "https://resources.premierleague.com/premierleague/badges/t21.png",
  20: "https://resources.premierleague.com/premierleague/badges/t39.png",
};

function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x);
}

export default function BonusPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [gw, setGw] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Bootstrap: events + players -> current GW
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/bootstrap-static`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        const elems = data?.elements;
        const evs = data?.events;
        if (isArray<Player>(elems)) setPlayers(elems);
        if (isArray<Event>(evs)) {
          setEvents(evs);
          const current = evs.find(e => e.is_current) ?? evs.find(e => !e.finished) ?? evs[0];
          setGw(current?.id ?? 1);
        } else {
          setGw(1);
        }
      } catch {
        if (!cancelled) {
          setPlayers([]);
          setEvents([]);
          setGw(1);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fixtures for selected GW
  useEffect(() => {
    if (gw == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/fixtures?event=${gw}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setFixtures(isArray<Fixture>(data) ? data : []);
      } catch {
        if (!cancelled) setFixtures([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gw]);

  // Sort: upcoming → live → finished
  const sortedFixtures = useMemo(() => {
    const stage = (f: Fixture) => (f.finished ? 2 : f.started ? 1 : 0);
    return [...fixtures].sort((a, b) => {
      const s = stage(a) - stage(b);
      if (s !== 0) return s;
      const ka = a.kickoff_time ? Date.parse(a.kickoff_time) : 0;
      const kb = b.kickoff_time ? Date.parse(b.kickoff_time) : 0;
      return ka - kb;
    });
  }, [fixtures]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  const status = (f: Fixture) => (f.finished ? 'FT' : f.started ? 'LIVE' : fmtTime(f.kickoff_time));

  return (
    <main style={{ fontFamily: 'Helvetica, Arial, sans-serif', padding: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{`Bonus — GW ${gw ?? '…'}`}</h1>

        <select
          value={gw ?? ''}
          onChange={(ev) => setGw(Number(ev.target.value))}
          style={{ borderRadius: 999, padding: '6px 10px', border: '1px solid #e5e5e5', background: '#fff' }}
        >
          {(events.length ? events.map((ev) => ev.id) : Array.from({ length: 38 }, (_, i) => i + 1)).map((id) => (
            <option key={id} value={id}>{`GW ${id}`}</option>
          ))}
        </select>

        {loading && <span style={{ fontSize: 12, opacity: 0.7 }}>loading…</span>}
      </header>

      {sortedFixtures.length === 0 ? (
        <p>{`No bonus data available yet.`}</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {sortedFixtures.map((f) => {
            const bonus = f.stats?.find((s) => s.identifier === 'bonus');
            const homeRows = isArray<BonusEntry>(bonus?.h) ? bonus!.h : [];
            const awayRows = isArray<BonusEntry>(bonus?.a) ? bonus!.a : [];
            const score =
              f.team_h_score != null && f.team_a_score != null ? `${f.team_h_score}–${f.team_a_score}` : 'vs';

            return (
              <section key={f.id} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, background: '#fff' }}>
                {/* Match pill */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid #eee', borderRadius: 999, background: '#fff', marginBottom: 10 }}>
                  <Image src={teamCrests[f.team_h]} alt="home" width={18} height={18} />
                  <strong style={{ fontSize: 13 }}>{score}</strong>
                  <Image src={teamCrests[f.team_a]} alt="away" width={18} height={18} />
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{status(f)}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Home bonus</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #eee' }}>Player</th>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #eee' }}>Bonus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {homeRows.length === 0 ? (
                          <tr><td colSpan={2} style={{ padding: 6, opacity: 0.65 }}>—</td></tr>
                        ) : (
                          homeRows.map((p) => {
                            const pl = players.find((x) => x.id === p.element);
                            return (
                              <tr key={`h-${f.id}-${p.element}`}>
                                <td style={{ padding: 6 }}>{pl?.web_name ?? `Player ${p.element}`}</td>
                                <td style={{ padding: 6 }}>+{p.value}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Away bonus</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #eee' }}>Player</th>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #eee' }}>Bonus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {awayRows.length === 0 ? (
                          <tr><td colSpan={2} style={{ padding: 6, opacity: 0.65 }}>—</td></tr>
                        ) : (
                          awayRows.map((p) => {
                            const pl = players.find((x) => x.id === p.element);
                            return (
                              <tr key={`a-${f.id}-${p.element}`}>
                                <td style={{ padding: 6 }}>{pl?.web_name ?? `Player ${p.element}`}</td>
                                <td style={{ padding: 6 }}>+{p.value}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
