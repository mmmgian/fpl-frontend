// app/bonus/page.tsx  — SERVER COMPONENT (no CORS issues)
import Image from "next/image";

type Player = { id: number; web_name: string; team: number; photo?: string };
type BonusStatEntry = { element: number; value: number };
type BonusStat = { identifier: string; a: BonusStatEntry[]; h: BonusStatEntry[] };
type Fixture = {
  id: number;
  team_h: number;
  team_a: number;
  stats: BonusStat[];
  finished: boolean;
};

type Bootstrap = {
  elements: Player[];
  teams: { id: number; name: string; short_name: string; code: number }[];
  events: { id: number; is_current: boolean; finished: boolean }[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const teamCrests: Record<number, string> = {
  1: "https://resources.premierleague.com/premierleague/badges/t3.png",
  2: "https://resources.premierleague.com/premierleague/badges/t7.png",
  3: "https://resources.premierleague.com/premierleague/badges/t91.png",
  4: "https://resources.premierleague.com/premierleague/badges/t94.png",
  5: "https://resources.premierleague.com/premierleague/badges/t36.png",
  6: "https://resources.premierleague.com/premierleague/badges/t8.png",
  7: "https://resources.premierleague.com/premierleague/badges/t31.png",
  8: "https://resources.premierleague.com/premierleague/badges/t11.png",
  9: "https://resources.premierleague.com/premierleague/badges/t54.png",
  10: "https://resources.premierleague.com/premierleague/badges/t40.png",
  11: "https://resources.premierleague.com/premierleague/badges/t13.png",
  12: "https://resources.premierleague.com/premierleague/badges/t14.png",
  13: "https://resources.premierleague.com/premierleague/badges/t43.png",
  14: "https://resources.premierleague.com/premierleague/badges/t1.png",
  15: "https://resources.premierleague.com/premierleague/badges/t4.png",
  16: "https://resources.premierleague.com/premierleague/badges/t17.png",
  17: "https://resources.premierleague.com/premierleague/badges/t20.png",
  18: "https://resources.premierleague.com/premierleague/badges/t6.png",
  19: "https://resources.premierleague.com/premierleague/badges/t21.png",
  20: "https://resources.premierleague.com/premierleague/badges/t39.png",
};

async function fetchJSON<T>(url: string, ms = 12000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

export default async function BonusPage() {
  // Server-side fetch (avoids CORS)
  const boot = await fetchJSON<Bootstrap>("https://fantasy.premierleague.com/api/bootstrap-static/");
  const current =
    boot.events.find((e) => e.is_current) ??
    boot.events.find((e) => !e.finished) ??
    boot.events[0];
  const gw = current?.id ?? 1;

  const fixtures = await fetchJSON<Fixture[]>(
    `https://fantasy.premierleague.com/api/fixtures/?event=${gw}`
  );

  const playersById = new Map<number, Player>(boot.elements.map((p) => [p.id, p]));

  return (
    <main style={{ fontFamily: "Helvetica, Arial, sans-serif", padding: 20 }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Bonus Points – GW {gw}</h1>

      {/* Pills: finished fixtures, crests only */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginBottom: 16 }}>
        {fixtures.filter((f) => f.finished).map((f) => (
          <div
            key={`pill-${f.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #eee",
              background: "#fff",
            }}
          >
            <Image src={teamCrests[f.team_h]} alt="home" width={20} height={20} style={{ objectFit: "contain" }} />
            <span style={{ fontSize: 12, opacity: 0.7 }}>vs</span>
            <Image src={teamCrests[f.team_a]} alt="away" width={20} height={20} style={{ objectFit: "contain" }} />
          </div>
        ))}
      </div>

      {/* Fixture cards */}
      <div style={{ display: "grid", gap: 16 }}>
        {fixtures.map((fixture) => {
          const bonusStat = fixture.stats.find((s) => s.identifier === "bonus");
          const rows: BonusStatEntry[] = bonusStat ? [...bonusStat.a, ...bonusStat.h] : [];

          return (
            <section
              key={fixture.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 10,
                background: "#fff",
                padding: 12,
              }}
            >
              {/* Match header with hover shimmer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                  borderRadius: 10,
                  padding: "8px 10px",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background =
                    "linear-gradient(90deg, rgba(255,0,255,0.10), rgba(0,255,255,0.10))";
                  el.style.boxShadow = "0 6px 16px rgba(0,255,255,0.20)";
                  el.style.transform = "translateY(-1px)";
                  el.style.border = "1px solid rgba(255,0,255,0.25)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background = "transparent";
                  el.style.boxShadow = "none";
                  el.style.transform = "none";
                  el.style.border = "1px solid transparent";
                }}
              >
                <Image src={teamCrests[fixture.team_h]} alt="home" width={28} height={28} style={{ objectFit: "contain" }} />
                <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "0.02em" }}>vs</span>
                <Image src={teamCrests[fixture.team_a]} alt="away" width={28} height={28} style={{ objectFit: "contain" }} />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Player</th>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ padding: 8, opacity: 0.65 }}>
                          No bonus yet for this fixture.
                        </td>
                      </tr>
                    ) : (
                      rows.map((p) => {
                        const pl = playersById.get(p.element);
                        return (
                          <tr key={`${fixture.id}-${p.element}`}>
                            <td style={{ padding: 8 }}>{pl?.web_name ?? "Unknown Player"}</td>
                            <td style={{ padding: 8 }}>+{p.value}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
