'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface Player {
  id: number;
  web_name: string;
}

interface BonusStatEntry {
  element: number;
  value: number;
}

interface BonusStat {
  identifier: string;
  a: BonusStatEntry[];
  h: BonusStatEntry[];
}

interface Fixture {
  id: number;
  team_h: number;
  team_a: number;
  stats: BonusStat[];
}

// Static crest mapping
const teamCrests: { [key: number]: { name: string; url: string } } = {
  1:  { name: "Arsenal",         url: "https://resources.premierleague.com/premierleague/badges/t3.png" },
  2:  { name: "Aston Villa",     url: "https://resources.premierleague.com/premierleague/badges/t7.png" },
  3:  { name: "Bournemouth",     url: "https://resources.premierleague.com/premierleague/badges/t91.png" },
  4:  { name: "Brentford",       url: "https://resources.premierleague.com/premierleague/badges/t94.png" },
  5:  { name: "Brighton",        url: "https://resources.premierleague.com/premierleague/badges/t36.png" },
  6:  { name: "Chelsea",         url: "https://resources.premierleague.com/premierleague/badges/t8.png" },
  7:  { name: "Crystal Palace",  url: "https://resources.premierleague.com/premierleague/badges/t31.png" },
  8:  { name: "Everton",         url: "https://resources.premierleague.com/premierleague/badges/t11.png" },
  9:  { name: "Fulham",          url: "https://resources.premierleague.com/premierleague/badges/t54.png" },
  10: { name: "Ipswich Town",    url: "https://resources.premierleague.com/premierleague/badges/t40.png" },
  11: { name: "Leicester City",  url: "https://resources.premierleague.com/premierleague/badges/t13.png" },
  12: { name: "Liverpool",       url: "https://resources.premierleague.com/premierleague/badges/t14.png" },
  13: { name: "Man City",        url: "https://resources.premierleague.com/premierleague/badges/t43.png" },
  14: { name: "Man United",      url: "https://resources.premierleague.com/premierleague/badges/t1.png" },
  15: { name: "Newcastle",       url: "https://resources.premierleague.com/premierleague/badges/t4.png" },
  16: { name: "Nottingham Forest", url: "https://resources.premierleague.com/premierleague/badges/t17.png" },
  17: { name: "Southampton",     url: "https://resources.premierleague.com/premierleague/badges/t20.png" },
  18: { name: "Tottenham",       url: "https://resources.premierleague.com/premierleague/badges/t6.png" },
  19: { name: "West Ham",        url: "https://resources.premierleague.com/premierleague/badges/t21.png" },
  20: { name: "Wolves",          url: "https://resources.premierleague.com/premierleague/badges/t39.png" }
};

export default function BonusPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [bootstrapRes, fixturesRes] = await Promise.all([
          fetch('https://fantasy.premierleague.com/api/bootstrap-static/').then(res => res.json()),
          fetch('https://fantasy.premierleague.com/api/fixtures/').then(res => res.json()),
        ]);

        setPlayers(bootstrapRes.elements);
        setFixtures(fixturesRes);
      } catch (err) {
        console.error(err);
      }
    }
    fetchData();
  }, []);

  const getPlayer = (id: number) => players.find(p => p.id === id);

  return (
    <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Bonus Points by Match</h1>
      {fixtures.length === 0 ? (
        <p>No bonus data available yet.</p>
      ) : (
        fixtures.map((fixture: Fixture) => {
          const home = teamCrests[fixture.team_h];
          const away = teamCrests[fixture.team_a];

          return (
            <div key={fixture.id} style={{ marginBottom: '40px' }}>
              {/* Minimal crest pill */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px' }}>
                {home && (
                  <Image
                    src={home.url}
                    alt={home.name}
                    width={40}
                    height={40}
                    style={{ marginRight: '10px' }}
                  />
                )}
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>vs</span>
                {away && (
                  <Image
                    src={away.url}
                    alt={away.name}
                    width={40}
                    height={40}
                    style={{ marginLeft: '10px' }}
                  />
                )}
              </div>

              {/* Bonus table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: '8px' }}>Player</th>
                    <th style={{ borderBottom: '1px solid #ddd', textAlign: 'left', padding: '8px' }}>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {fixture.stats
                    ?.filter((stat: BonusStat) => stat.identifier === 'bonus')
                    .flatMap((stat: BonusStat) => [...stat.a, ...stat.h])
                    .map((p: BonusStatEntry, idx: number) => (
                      <tr key={idx}>
                        <td style={{ padding: '8px' }}>{getPlayer(p.element)?.web_name || 'Unknown Player'}</td>
                        <td style={{ padding: '8px' }}>{p.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}