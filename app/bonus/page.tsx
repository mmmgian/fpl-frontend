// app/bonus/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

type BonusItem = {
  player_id: number;
  bonus: number; // 1, 2, or 3
};

type BonusResponse = {
  gameweek: number;
  bonuses: BonusItem[];
};

async function getBonus(gw: number): Promise<BonusResponse | null> {
  const res = await fetch(
    `https://fpl-backend-poix.onrender.com/bonus/${gw}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function BonusPage() {
  // TODO: wire up current GW detection later; start with GW 1 for now
  const gw = 1;
  const data = await getBonus(gw);

  if (!data) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Bonus Points</h1>
        <p>Couldn&#39;t fetch bonus points.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Bonus Points for GW {data.gameweek}</h1>
      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>
                Player ID
              </th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>
                Bonus
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bonuses.map((b: BonusItem, idx: number) => (
              <tr key={`${b.player_id}-${idx}`}>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                  {b.player_id}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                  +{b.bonus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
