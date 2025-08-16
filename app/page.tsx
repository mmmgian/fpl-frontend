// app/page.tsx
export const revalidate = 60; // ISR: refresh data every 60s

async function getLeague() {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;
  const res = await fetch(`${base}/league/${leagueId}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch league: ${res.status}`);
  }
  return res.json();
}

export default async function Home() {
  const data = await getLeague();
  const league = data.league;
  const rows: any[] = data?.standings?.results ?? [];

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        {league?.name ?? "League"} — Standings
      </h1>
      <p style={{ marginBottom: 16, opacity: 0.7 }}>
        Updated every ~60 seconds.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Rank", "Player", "Team Name", "GW Points", "Total Points"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry}>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.rank}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.player_name}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.entry_name}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.event_total}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>
        Built with Next.js + FastAPI • Data © Fantasy Premier League
      </footer>
    </main>
  );
}
