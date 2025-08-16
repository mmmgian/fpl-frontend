export const revalidate = 60;

export default async function HistoryList() {
  const base = process.env.API_BASE!;
  const leagueId = process.env.LEAGUE_ID!;
  const res = await fetch(`${base}/history/${leagueId}`, { next: { revalidate: 60 } });
  if (!res.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Uh oh, you&#39;ve gotten ahead of yourself</h1>
      </main>
    );
  }
  const data = await res.json();

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>League History</h1>
      <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
        {data.snapshots.map((s: { gw: number; taken_at: string }) => (
          <li key={s.gw}>
            <a href={`/history/${s.gw}`}>GW {s.gw}</a> — <span style={{ opacity: 0.7 }}>{s.taken_at}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}