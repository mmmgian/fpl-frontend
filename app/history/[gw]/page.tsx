interface StandingRow {
  entry: number; rank: number; player_name: string; entry_name: string; event_total: number; total: number;
}

export default async function HistoryGW({
  params,
}: {
  params: Promise<{ gw: string }>;
}) {
  const { gw } = await params;               // 👈 await the promised params

  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;

  const res = await fetch(`${base}/history/${leagueId}/${gw}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Uh oh, you&#39;ve gotten ahead of yourself</h1>
        <p style={{ marginTop: 12 }}>
          Don&#39;t worry, a snapshot for GW {gw} hasn&#39;t been taken yet. Try again after the Gameweek ends.
        </p>
      </main>
    );
  }

  const data = await res.json();
  const rows: StandingRow[] = data?.standings?.results ?? [];
  const name = data?.league?.name ?? "League";

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{name} — GW {gw} Standings</h1>
      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8, marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Rank","Player","Team Name","GW Points","Total Points"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>{h}</th>
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
      <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
        Snapshot saved at time of capture; may differ from current live table.
      </p>
    </main>
  );
}