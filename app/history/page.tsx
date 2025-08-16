import Link from "next/link";

export default async function HistoryPage() {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;

  const res = await fetch(`${base}/history/${leagueId}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Uh oh, you&apos;ve gotten ahead of yourself</h1>
      </main>
    );
  }

  const snapshots: { gw: number; created_at: string }[] = await res.json();

  return (
    <main style={{ padding: 24 }}>
      <h1>History</h1>
      <ul>
        {snapshots.map((s) => (
          <li key={s.gw}>
            <Link href={`/history/${s.gw}`}>Gameweek {s.gw}</Link> — saved at {s.created_at}
          </li>
        ))}
      </ul>
    </main>
  );
}