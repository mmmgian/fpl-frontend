// app/team/[entryId]/page.tsx
export const revalidate = 60;

type PlayerRow = {
  name: string;
  web_name?: string;
  team?: string;
  now_cost?: number; // in 0.1m units (e.g., 55 => 5.5m)
  selected_by_percent?: string;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  multiplier?: number;
};

type TeamPayload = {
  entry_id: number;
  gw: number;
  team: { GK: PlayerRow[]; DEF: PlayerRow[]; MID: PlayerRow[]; FWD: PlayerRow[] };
};

async function getTeam(entryId: string): Promise<TeamPayload> {
  const base = process.env.API_BASE!;
  const res = await fetch(`${base}/team/${entryId}`, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`Failed to load team: ${res.status}`);
  }
  return res.json();
}

function Section({ title, rows }: { title: string; rows: PlayerRow[] }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Player", "Club", "Cost (m)", "Sel%", "C/V", "xMult"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.web_name}-${i}`}>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.name || r.web_name}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.team ?? ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{
                  r.now_cost != null ? (r.now_cost / 10).toFixed(1) : ""
                }</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.selected_by_percent ?? ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{
                  r.is_captain ? "C" : r.is_vice_captain ? "VC" : ""
                }</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.multiplier ?? 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function TeamPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const data = await getTeam(entryId);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Top bar with Home button (placeholder for logo later) */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <a href="/" style={{ textDecoration: "none", fontWeight: 700, fontSize: 18 }}>
          Home
        </a>
        <div style={{ marginLeft: 8, opacity: 0.7 }}>Team for GW {data.gw}</div>
      </header>

      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Entry {data.entry_id}</h1>
      <p style={{ marginBottom: 16, opacity: 0.7 }}>Grouped by position</p>

      <Section title="Goalkeepers" rows={data.team.GK} />
      <Section title="Defenders" rows={data.team.DEF} />
      <Section title="Midfielders" rows={data.team.MID} />
      <Section title="Forwards" rows={data.team.FWD} />

      <footer style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>
        Built with Next.js + FastAPI • Data © Fantasy Premier League
      </footer>
    </main>
  );
}