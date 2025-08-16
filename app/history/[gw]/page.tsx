import Link from "next/link";

interface StandingRow {
  entry: number;
  rank: number;
  player_name: string;
  entry_name: string;
  event_total: number;
  total: number;
}

export default async function HistoryDetailPage({ params }: { params: { gw: string } }) {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;
  const gw = params.gw;

  const res = await fetch(`${base}/history/${leagueId}/${gw}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Uh oh, you&apos;ve gotten ahead of yourself</h1>
      </main>
    );
  }

  const data = await res.json();
  const rows: StandingRow[] = data?.standings?.results ?? [];

  return (
    <main style={{ padding: 24 }}>
      <h1>History — Gameweek {gw}</h1>
      <p>
        <Link href="/history">← Back to all history</Link>
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Team</th>
            <th>GW Points</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entry}>
              <td>{r.rank}</td>
              <td>
                <Link href={`/team/${r.entry}`}>{r.player_name}</Link>
              </td>
              <td>{r.entry_name}</td>
              <td>{r.event_total}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}