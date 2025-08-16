// app/history/page.tsx

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

interface Snapshot { gw: number; taken_at: string; }

export default async function HistoryList() {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;

  try {
    const res = await fetchWithTimeout(`${base}/history/${leagueId}`);
    if (!res.ok) {
      return (
        <main style={{ padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            Uh oh, you&#39;ve gotten ahead of yourself
          </h1>
          <p style={{ marginTop: 12 }}>
            No snapshots found yet. Don&#39;t worry, once a Gameweek ends and you autosnapshot, they&#39;ll appear here.
          </p>
        </main>
      );
    }

    const data: { league_id: number; snapshots: Snapshot[] } = await res.json();

    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>League History</h1>
        <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
          {data.snapshots.map((s) => (
            <li key={s.gw}>
              <a href={`/history/${s.gw}`}>GW {s.gw}</a> — <span style={{ opacity: 0.7 }}>{s.taken_at}</span>
            </li>
          ))}
        </ul>
      </main>
    );
  } catch (e) {
    void e; // satisfy no-unused-vars
    return (
      <main style={{ padding: 24 }}>
        <h1>Request timed out</h1>
      </main>
    );
  }
}
