// app/team/[entryId]/page.tsx
import Link from "next/link";

type PlayerRow = {
  name: string;
  web_name?: string;
  team?: string;
  now_cost?: number;
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchWithTimeout(url: string, ms = 12000, init?: RequestInit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params; // 👈 your project expects Promise params

  const base = process.env.API_BASE;
  if (!base) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Team</h1>
        <p style={{ marginTop: 8 }}>
          Missing <code>API_BASE</code> on Vercel. Set it to{" "}
          <code>https://fpl-backend-poix.onrender.com</code> and redeploy.
        </p>
        <p style={{ marginTop: 8 }}>
          <Link href="/">← Back Home</Link>
        </p>
      </main>
    );
  }

  try {
    const res = await fetchWithTimeout(`${base}/team/${entryId}`);
    if (!res.ok) {
      return (
        <main style={{ padding: 24 }}>
          <h1>Team</h1>
          <p style={{ marginTop: 8 }}>
            Couldn&#39;t load team {entryId}. Backend responded {res.status}.
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href="/">← Back Home</Link>
          </p>
        </main>
      );
    }

    const data = (await res.json()) as TeamPayload;

    const Section = ({ title, rows }: { title: string; rows: PlayerRow[] }) => (
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Player", "Club", "Cost (m)", "Sel%", "C/V", "xMult"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.web_name ?? r.name}-${i}`}>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.name || r.web_name}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.team ?? ""}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    {r.now_cost != null ? (r.now_cost / 10).toFixed(1) : ""}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.selected_by_percent ?? ""}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    {r.is_captain ? "C" : r.is_vice_captain ? "VC" : ""}
                  </td>
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
          <Link href="/" style={{ textDecoration: "none", fontWeight: 700, fontSize: 18 }}>
            Home
          </Link>
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
  } catch {
    return (
      <main style={{ padding: 24 }}>
        <h1>Request timed out</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/">← Back Home</Link>
        </p>
      </main>
    );
  }
}
