// app/page.tsx

import Link from "next/link";

interface StandingRow {
  entry: number;
  rank: number;
  player_name: string;
  entry_name: string;
  event_total: number;
  total: number;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchWithTimeout(url: string, ms = 12000, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HomePage() {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;

  try {
    const res = await fetchWithTimeout(`${base}/league/${leagueId}`);
    if (!res.ok) {
      return (
        <main style={{ padding: 24 }}>
          <h1>Uh oh, you&apos;ve gotten ahead of yourself</h1>
          <p>Couldn&apos;t fetch the live league table. Try again soon.</p>
        </main>
      );
    }

    const data = await res.json();
    const rows: StandingRow[] = data?.standings?.results ?? [];
    const name: string = data?.league?.name ?? "League";

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{name} — Live Standings</h1>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8, marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Rank",
                  "Player",
                  "Team Name",
                  "GW Points",
                  "Total Points",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry}>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.rank}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    <Link href={`/team/${r.entry}`} style={{ textDecoration: "none" }}>
                      {r.player_name}
                    </Link>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    <Link href={`/team/${r.entry}`} style={{ textDecoration: "none" }}>
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
        <p style={{ marginTop: 12 }}>
          Browse <Link href="/history">history</Link> or view a sample team.
        </p>
      </main>
    );
  } catch {
    return (
      <main style={{ padding: 24 }}>
        <h1>Request timed out</h1>
      </main>
    );
  }
}