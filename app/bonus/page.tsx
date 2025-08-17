'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
export const dynamic = 'force-dynamic';


type Event = { id: number; is_current: boolean; finished: boolean };
type Team = { id: number; name: string; short_name: string; code?: number };
type Element = { id: number; web_name: string; first_name: string; second_name: string; team: number };

type BonusEntry = { element: number; value: number }; // 1/2/3
type Fixture = {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  finished: boolean;
  provisional_start_time?: boolean;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  stats?: { identifier: string; a: BonusEntry[]; h: BonusEntry[] }[];
};

type FixturesResponse = Fixture[];

const crest = (teamId: number, teamsById: Map<number, Team>) => {
  const t = teamsById.get(teamId);
  // Premier League official asset code is stable across seasons
  const code = t?.code ?? teamId;
  return `https://resources.premierleague.com/premierleague/badges/t${code}.png`;
};

export default function BonusPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [players, setPlayers] = useState<Element[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [gw, setGw] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [bootRes, fixRes] = await Promise.all([
          fetch('/api/bootstrap-static', { cache: 'no-store' }),
          fetch('/api/fixtures', { cache: 'no-store' }),
        ]);
        if (!bootRes.ok) throw new Error(`bootstrap ${bootRes.status}`);
        if (!fixRes.ok) throw new Error(`fixtures ${fixRes.status}`);

        const boot = await bootRes.json();
        const fx: FixturesResponse = await fixRes.json();

        if (cancelled) return;

        const events: Event[] = boot.events ?? [];
        const teamsArr: Team[] = boot.teams ?? [];
        const playersArr: Element[] = boot.elements ?? [];
        const current = events.find((e) => e.is_current) ?? events.find((e) => !e.finished) ?? events[0];

        setGw(current?.id ?? null);
        setTeams(teamsArr);
        setPlayers(playersArr);

        // keep logic the same: show fixtures of current GW (already filtered by backend proxy if you made it),
        // else keep as-is and we’ll filter client-side by gw if present
        const gwId = current?.id ?? null;
        const filtered = gwId ? fx.filter((f) => f.event === gwId) : fx;
        setFixtures(filtered);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setFixtures([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const teamsById = useMemo(() => new Map<number, Team>(teams.map((t) => [t.id, t])), [teams]);
  const playersById = useMemo(() => new Map<number, Element>(players.map((p) => [p.id, p])), [players]);

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
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16, marginTop: 18 };
  const card: React.CSSProperties = { background: '#fff', border: hairline, borderRadius: 12, padding: 14 };
  const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, border: hairline, borderRadius: 999, padding: '6px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' };
  const meta: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginTop: 8 };
  const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 10 };
  const th: React.CSSProperties = { textAlign: 'left', padding: 8, borderBottom: hairline, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.10em', opacity: 0.8 };
  const thRight: React.CSSProperties = { ...th, textAlign: 'right' as const };
  const td: React.CSSProperties = { padding: 8, borderBottom: '1px dashed rgba(0,0,0,0.06)' };
  const tdRight: React.CSSProperties = { ...td, textAlign: 'right' as const };

  const humanKick = (iso: string | null) => {
    if (!iso) return 'TBD';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const gwLabel = gw ? `Gameweek ${gw}` : 'Gameweek …';

  return (
    <main style={page}>
      <div style={shell}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={h1}>Bonus</h1>
          <div style={sub}>{gwLabel}</div>
        </div>
        <div style={{ borderTop: hairline, marginTop: 8, marginBottom: 14 }} />

        {loading ? (
          <p>Loading…</p>
        ) : err ? (
          <p style={{ opacity: 0.75 }}>{`Uh oh, you\u2019ve gotten ahead of yourself — no bonus data yet.`}<br /><small>{err}</small></p>
        ) : fixtures.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No bonus data available yet.</p>
        ) : (
          <div style={grid}>
            {fixtures.map((fx) => {
              const home = teamsById.get(fx.team_h);
              const away = teamsById.get(fx.team_a);

              const score =
                fx.team_h_score != null && fx.team_a_score != null
                  ? `${fx.team_h_score} – ${fx.team_a_score}`
                  : 'vs';

              const bonStat = (fx.stats ?? []).find((s) => s.identifier === 'bps');
              const hBon = (bonStat?.h ?? []).slice().sort((a, b) => b.value - a.value);
              const aBon = (bonStat?.a ?? []).slice().sort((a, b) => b.value - a.value);

              return (
                <section key={fx.id} style={card}>
                  {/* Fixture pill */}
                  <div style={pill} title={home?.name && away?.name ? `${home.name} vs ${away.name}` : 'Fixture'}>
                    {home ? (
                      <Image src={crest(home.id, teamsById)} alt="home" width={20} height={20} />
                    ) : <span style={{ width: 20 }} />}
                    <span>{score}</span>
                    {away ? (
                      <Image src={crest(away.id, teamsById)} alt="away" width={20} height={20} />
                    ) : <span style={{ width: 20 }} />}
                  </div>

                  <div style={meta}>
                    {home?.short_name ?? '—'} vs {away?.short_name ?? '—'} &middot; {humanKick(fx.kickoff_time)} {fx.finished ? '· Final' : ''}
                  </div>

                  {/* Home bonus */}
                  <table style={table}>
                    <colgroup>
                      <col style={{ width: '70%' }} />
                      <col style={{ width: '30%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={th}>{home?.short_name ?? 'Home'} Bonus</th>
                        <th style={thRight}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hBon.length === 0 ? (
                        <tr><td colSpan={2} style={{ padding: 8, opacity: 0.65 }}>No bonus yet for this side.</td></tr>
                      ) : (
                        hBon.map((b) => {
                          const pl = playersById.get(b.element);
                          return (
                            <tr key={`h-${fx.id}-${b.element}`}>
                              <td style={td}>{pl?.web_name ?? `#${b.element}`}</td>
                              <td style={tdRight}>+{b.value}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Away bonus */}
                  <table style={{ ...table, marginTop: 6 }}>
                    <colgroup>
                      <col style={{ width: '70%' }} />
                      <col style={{ width: '30%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={th}>{away?.short_name ?? 'Away'} Bonus</th>
                        <th style={thRight}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aBon.length === 0 ? (
                        <tr><td colSpan={2} style={{ padding: 8, opacity: 0.65 }}>No bonus yet for this side.</td></tr>
                      ) : (
                        aBon.map((b) => {
                          const pl = playersById.get(b.element);
                          return (
                            <tr key={`a-${fx.id}-${b.element}`}>
                              <td style={td}>{pl?.web_name ?? `#${b.element}`}</td>
                              <td style={tdRight}>+{b.value}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
