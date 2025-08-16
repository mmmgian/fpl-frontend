export const revalidate = 60;

type TeamPayload = {
  entry_id: number;
  gw: number;
  team: {
    GK: any[]; DEF: any[]; MID: any[]; FWD: any[];
  };
};

async function getTeam(entryId: string): Promise<TeamPayload | null> {
  const base = process.env.API_BASE;
  if (!base) return null;                         // no env → render a friendly message
  const res = await fetch(`${base}/team/${entryId}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;                       // backend down / 404 → render friendly message
  return res.json();
}

export default async function TeamPage({ params }: { params: { entryId: string } }) {
  const { entryId } = params;                     // 👈 must match [entryId]
  const data = await getTeam(entryId);

  if (!data) {
    return (
      <main style={{ padding: 24 }}>
        <a href="/" style={{ textDecoration: "none", fontWeight: 700, fontSize: 18 }}>Home</a>
        <h1 style={{ marginTop: 12 }}>Couldn&#39;t load team</h1>
        <p style={{ opacity: 0.7 }}>
          Check that <code>API_BASE</code> is set on Vercel and that the backend endpoint
          <br />
          <code>/team/{entryId}</code> returns JSON. Then redeploy.
        </p>
      </main>
    );
  }

  const Section = ({ title, rows }: { title: string; rows: any[] }) => (
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
              <tr key={`${r.web_name ?? r.name}-${i}`}>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.name || r.web_name}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.team ?? ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.now_cost != null ? (r.now_cost / 10).toFixed(1) : ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.selected_by_percent ?? ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.is_captain ? "C" : r.is_vice_captain ? "VC" : ""}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.multiplier ?? 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <a href="/" style={{ textDecoration: "none", fontWeight: 700, fontSize: 18 }}>Home</a>
        <div style={{ marginLeft: 8, opacity: 0.7 }}>Team for GW {data.gw}</div>
      </header>

      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Entry {data.entry_id}</h1>
      <p style={{ marginBottom: 16, opacity: 0.7 }}>Grouped by position</p>

      <Section title="Goalkeepers" rows={data.team.GK} />
      <Section title="Defenders" rows={data.team.DEF} />
      <Section title="Midfielders" rows={data.team.MID} />
      <Section title="Forwards" rows={data.team.FWD} />
    </main>
  );
}
