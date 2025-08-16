// app/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StandingRow = {
  entry: number;         // team id (entryId)
  rank: number;
  player_name: string;   // manager name
  entry_name: string;    // team name
  event_total: number;   // GW points
  total: number;         // total points
};

type LeaguePayload = {
  league?: { name?: string };
  standings?: { results?: StandingRow[] };
};

async function fetchWithTimeout(url: string, ms = 12000, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HomePage() {
  const base = process.env.API_BASE ?? "https://fpl-backend-poix.onrender.com";
  const leagueId = process.env.LEAGUE_ID ?? "1391467";

  let data: LeaguePayload | null = null;
  try {
    const res = await fetchWithTimeout(`${base}/league/${leagueId}`);
    if (res.ok) data = await res.json();
  } catch {
    // ignore; we render a friendly fallback below
  }

  const rows: StandingRow[] = data?.standings?.results ?? [];
  const leagueName = data?.league?.name ?? "League";

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      {/* Top navigation */}
      <nav style={{ marginBottom: 16 }}>
        <ul
          style={{
            display: "flex",
            gap: 16,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
        </ul>
      </nav>

      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{leagueName} — Live Standings</h1>

      {rows.length === 0 ? (
        <>
          <p style={{ marginTop: 12, opacity: 0.75 }}>
            Couldn&#39;t load the league table right now. Your backend may be cold or busy.
          </p>
          <p style={{ marginTop: 6 }}>
            Try again shortly, or view{" "}
            <Link href="/history" style={{ textDecoration: "underline" }}>
              saved history
            </Link>
            .
          </p>
        </>
      ) : (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid #eee",
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Rank", "Player", "Team Name", "GW Points", "Total Points"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry}>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.rank}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    <Link
                      href={`/team/${r.entry}`}
                      style={{ textDecoration: "underline" }}
                      title={`View team for ${r.player_name}`}
                    >
                      {r.player_name}
                    </Link>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    <Link
                      href={`/team/${r.entry}`}
                      style={{ textDecoration: "underline" }}
                      title={`View ${r.entry_name}`}
                    >
                      {r.entry_name}
                    </Link>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.event_total}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
        Tip: Click a team or manager name to open their squad view.
      </p>
    </main>
  );
}
