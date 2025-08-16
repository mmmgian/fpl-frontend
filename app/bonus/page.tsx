// app/bonus/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Event = { id: number; is_current: boolean; finished: boolean };
type Element = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
};
type Team = { id: number; short_name: string; name: string };

type BonusEntry = { element: number; value: number }; // 1,2,3
type StatBlock = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };

type Fixture = {
  id: number;
  event: number | null;
  finished: boolean;
  team_a: number; // away team id
  team_h: number; // home team id
  team_a_score: number | null;
  team_h_score: number | null;
  stats: StatBlock[];
  kickoff_time: string | null;
};

async function fetchJSON<T>(url: string, ms = 12000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getBootstrap() {
  return fetchJSON<{ events: Event[]; elements: Element[]; teams: Team[] }>(
    "https://fantasy.premierleague.com/api/bootstrap-static/"
  );
}

async function getFixtures(gw: number) {
  return fetchJSON<Fixture[]>(
    `https://fantasy.premierleague.com/api/fixtures/?event=${gw}`
  );
}

function playerName(e: Element | undefined) {
  if (!e) return "Unknown";
  return e.web_name || `${e.first_name} ${e.second_name}`.trim();
}

export default async function BonusPage() {
  // 1) Bootstrap for dictionaries + current GW
  const boot = await getBootstrap();
  const current =
    boot.events.find((e) => e.is_current) ??
    boot.events.find((e) => !e.finished) ??
    boot.events[0];
  const gw = current?.id ?? 1;

  // 2) Fixtures for GW
  const fixtures = await getFixtures(gw);

  // 3) Index lookups
  const elementsById = new Map(boot.elements.map((e) => [e.id, e]));
  const teamsById = new Map(boot.teams.map((t) => [t.id, t]));

  // 4) Build rows
  const rows = fixtures.map((fx) => {
    const home = teamsById.get(fx.team_h);
    const away = teamsById.get(fx.team_a);
    const score =
      fx.team_h_score != null && fx.team_a_score != null
        ? `${fx.team_h_score}–${fx.team_a_score}`
        : "–";

    const bonus = fx.stats.find((s) => s.identifier === "bonus");
    const homeBonus = [...(bonus?.h ?? [])].sort((a, b) => b.value - a.value);
    const awayBonus = [...(bonus?.a ?? [])].sort((a, b) => b.value - a.value);

    return {
      id: fx.id,
      finished: fx.finished,
      kickoff: fx.kickoff_time,
      home,
      away,
      score,
      homeBonus: homeBonus.map((b) => ({
        pts: b.value,
        name: playerName(elementsById.get(b.element)),
      })),
      awayBonus: awayBonus.map((b) => ({
        pts: b.value,
        name: playerName(elementsById.get(b.element)),
      })),
    };
  });

  // Tiny “logo chip” using team short code
  const logoChip: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "1px solid #e5e5e5",
    background: "#fafafa",
    fontSize: 12,
    fontWeight: 700,
    marginRight: 8,
    fontFamily: "Helvetica, Arial, sans-serif",
  };

  const pill: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #e5e5e5",
    marginLeft: 8,
    fontSize: 12,
  };

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "underline", fontWeight: 700 }}>
          Home
        </Link>
        <div style={{ opacity: 0.75 }}>Bonus Points — GW {gw}</div>
      </header>

      <p style={{ marginBottom: 12, opacity: 0.75 }}>
        Official 3/2/1 bonus per finished match. Player names shown instead of
        IDs. Logos are simple short-code chips — we can swap to real crests
        later.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => (
          <section
            key={r.id}
            style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}
          >
            {/* Match header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={logoChip}>{r.home?.short_name ?? "H"}</span>
                <strong>{r.home?.name ?? "Home"}</strong>
              </div>

              <div style={{ textAlign: "center", minWidth: 120 }}>
                <div style={{ fontWeight: 700 }}>{r.score}</div>
                <div>
                  <span
                    style={{
                      ...pill,
                      opacity: r.finished ? 1 : 0.7,
                      borderColor: r.finished ? "#d0e7d5" : "#e5e5e5",
                      background: r.finished ? "#f4faf6" : "#fafafa",
                    }}
                  >
                    {r.finished ? "Finished" : "In progress / Pending"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <strong style={{ marginRight: 8 }}>
                  {r.away?.name ?? "Away"}
                </strong>
                <span style={logoChip}>{r.away?.short_name ?? "A"}</span>
              </div>
            </div>

            {/* Bonus lists */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 10,
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>Home bonus</h3>
                {r.homeBonus.length === 0 ? (
                  <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {r.homeBonus.map((b, i) => (
                      <li key={`h-${r.id}-${i}`} style={{ lineHeight: 1.8 }}>
                        {b.name} <span style={{ opacity: 0.7 }}>+{b.pts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>Away bonus</h3>
                {r.awayBonus.length === 0 ? (
                  <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {r.awayBonus.map((b, i) => (
                      <li key={`a-${r.id}-${i}`} style={{ lineHeight: 1.8 }}>
                        {b.name} <span style={{ opacity: 0.7 }}>+{b.pts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.65 }}>
        Tip: Bonus only appears after fixtures finish; during live games or if
        data hasn’t settled yet, the lists may be empty.
      </p>
    </main>
  );
}
