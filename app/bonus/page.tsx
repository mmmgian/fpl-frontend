'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

type Event = { id: number; is_current: boolean; finished: boolean };
type Team = { id: number; name: string; short_name: string; code: number };
type Element = { id: number; web_name: string; first_name: string; second_name: string; team: number };

type BonusEntry = { element: number; value: number };                // value is 1/2/3
type StatBlock = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };

type Fixture = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  kickoff_time: string | null;
  stats: StatBlock[];
};

type Bootstrap = {
  events: Event[];
  teams: Team[];
  elements: Element[];
};

export default function BonusPage() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 1) Get bootstrap (teams, players, events)
        const bootRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', { cache: 'no-store' });
        const bootJson: Bootstrap = await bootRes.json();
        if (cancelled) return;
        setBoot(bootJson);

        // Determine the current GW for 25/26 based on flags in bootstrap
        const current =
          bootJson.events.find((e) => e.is_current) ??
          bootJson.events.find((e) => !e.finished) ??
          bootJson.events[0];
        const gw = current?.id ?? 1;

        // 2) Pull fixtures for that GW (contains bonus in stats when finished)
        const fxRes = await fetch(`https://fantasy.premierleague.com/api/fixtures/?event=${gw}`, { cache: 'no-store' });
        const fxJson: Fixture[] = await fxRes.json();
        if (cancelled) return;
        setFixtures(fxJson);
      } catch (err) {
        console.error('Bonus page load failed', err);
        if (!cancelled) {
          setBoot(null);
          setFixtures([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- helpers ----
  const elementsById = new Map<number, Element>(boot?.elements.map((e) => [e.id, e]) ?? []);
  const teamsById = new Map<number, Team>(boot?.teams.map((t) => [t.id, t]) ?? []);

  const playerName = (id: number) => {
    const e = elementsById.get(id);
    if (!e) return 'Unknown';
    return e.web_name || `${e.first_name} ${e.second_name}`.trim();
  };

  // Use official PL crest for THIS season via team.code (season-agnostic endpoint, code stays correct via bootstrap)
  const crestUrl = (teamId: number) => {
    const t = teamsById.get(teamId);
    if (!t) return undefined;
    return `https://resources.premierleague.com/premierleague/badges/t${t.code}.png`;
  };

  const scoreline = (f: Fixture) =>
    f.team_h_score != null && f.team_a_score != null ? `${f.team_h_score}–${f.team_a_score}` : '–';

  // ---- render ----
  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Bonus Points</h1>
        <p style={{ opacity: 0.75 }}>Loading…</p>
      </main>
    );
  }

  if (!boot) {
    return (
      <main style={{ padding: 24, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Bonus Points</h1>
        <p style={{ opacity: 0.75 }}>Couldn&apos;t load data from FPL.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: 'Helvetica, Arial, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/" className="btn">Home</Link>
        <div style={{ opacity: 0.75 }}>Bonus Points — Current Gameweek</div>
      </header>

      {fixtures.length === 0 ? (
        <p style={{ opacity: 0.75 }}>No fixtures for this gameweek yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {fixtures.map((f) => {
            const home = teamsById.get(f.team_h);
            const away = teamsById.get(f.team_a);
            const bonus = f.stats.find((s) => s.identifier === 'bonus');
            const homeBonus = (bonus?.h ?? []).slice().sort((a, b) => b.value - a.value);
            const awayBonus = (bonus?.a ?? []).slice().sort((a, b) => b.value - a.value);

            return (
              <section key={f.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                {/* Match header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {home && (
                      <Image
                        src={crestUrl(f.team_h) ?? ''}
                        alt={`${home.name} crest`}
                        width={32}
                        height={32}
                        style={{ marginRight: 8, objectFit: 'contain' }}
                      />
                    )}
                    <strong>{home?.name ?? 'Home'}</strong>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div style={{ fontWeight: 700 }}>{scoreline(f)}</div>
                    <div
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid #e5e5e5',
                        fontSize: 12,
                        background: f.finished ? '#f4faf6' : '#fafafa',
                        opacity: f.finished ? 1 : 0.8,
                      }}
                    >
                      {f.finished ? 'Finished' : 'In progress / Pending'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <strong style={{ marginRight: 8 }}>{away?.name ?? 'Away'}</strong>
                    {away && (
                      <Image
                        src={crestUrl(f.team_a) ?? ''}
                        alt={`${away.name} crest`}
                        width={32}
                        height={32}
                        style={{ objectFit: 'contain' }}
                      />
                    )}
                  </div>
                </div>

                {/* Bonus lists */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px 0' }}>Home bonus</h3>
                    {homeBonus.length === 0 ? (
                      <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {homeBonus.map((b) => (
                          <li key={`h-${f.id}-${b.element}`} style={{ lineHeight: 1.8 }}>
                            {playerName(b.element)} <span style={{ opacity: 0.7 }}>+{b.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px 0' }}>Away bonus</h3>
                    {awayBonus.length === 0 ? (
                      <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {awayBonus.map((b) => (
                          <li key={`a-${f.id}-${b.element}`} style={{ lineHeight: 1.8 }}>
                            {playerName(b.element)} <span style={{ opacity: 0.7 }}>+{b.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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
