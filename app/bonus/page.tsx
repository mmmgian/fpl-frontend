// app/bonus/page.tsx
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Event = { id: number; is_current: boolean; finished: boolean };
type Team = { id: number; name: string; short_name: string; code: number };
type Element = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  photo: string; // e.g. "12345.jpg"
};

type BonusEntry = { element: number; value: number }; // 1/2/3
type StatBlock = { identifier: string; a: BonusEntry[]; h: BonusEntry[] };

type Fixture = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  kickoff_time: string | null;
  stats: StatBlock[];
};

type Bootstrap = {
  events: Event[];
  teams: Team[];
  elements: Element[];
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

function playerName(e?: Element) {
  if (!e) return "Unknown";
  return e.web_name || `${e.first_name} ${e.second_name}`.trim();
}

function crestUrl(team?: Team) {
  if (!team) return undefined;
  return `https://resources.premierleague.com/premierleague/badges/t${team.code}.png`;
}

function faceUrl(e?: Element) {
  if (!e?.photo) return undefined;
  // bootstrap gives "12345.jpg" → faces use p{12345}.png at 110x140
  const stem = e.photo.split(".")[0];
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${stem}.png`;
}

export default async function BonusPage() {
  // 1) Bootstrap (server-side)
  let boot: Bootstrap | null = null;
  try {
    boot = await fetchJSON<Bootstrap>("https://fantasy.premierleague.com/api/bootstrap-static/");
  } catch {
    boot = null;
  }

  if (!boot) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <Link href="/" className="btn">Home</Link>
          <div style={{ opacity: 0.75 }}>Bonus Points</div>
        </header>
        <p style={{ opacity: 0.75 }}>Couldn&apos;t load data from FPL.</p>
      </main>
    );
  }

  // Current GW
  const current =
    boot.events.find((e) => e.is_current) ??
    boot.events.find((e) => !e.finished) ??
    boot.events[0];
  const gw = current?.id ?? 1;

  // 2) Fixtures for current GW
  let fixtures: Fixture[] = [];
  try {
    fixtures = await fetchJSON<Fixture[]>(`https://fantasy.premierleague.com/api/fixtures/?event=${gw}`);
  } catch {
    fixtures = [];
  }

  const elementsById = new Map<number, Element>(boot.elements.map((e) => [e.id, e]));
  const teamsById = new Map<number, Team>(boot.teams.map((t) => [t.id, t]));

  const scoreline = (f: Fixture) =>
    f.team_h_score != null && f.team_a_score != null ? `${f.team_h_score}–${f.team_a_score}` : "–";

  const finished = fixtures.filter((f) => f.finished);
  const inProgressOrPending = fixtures.filter((f) => !f.finished);

  // ---- Aggregate Top Bonus (Current GW) ----
  // Sum all bonus points across *all* fixtures this GW
  const bonusTotals = new Map<number, number>(); // elementId -> total bonus
  for (const f of fixtures) {
    const bonus = f.stats.find((s) => s.identifier === "bonus");
    if (!bonus) continue;
    const all = [...(bonus.h ?? []), ...(bonus.a ?? [])];
    for (const b of all) {
      bonusTotals.set(b.element, (bonusTotals.get(b.element) ?? 0) + b.value);
    }
  }
  // Build enriched rows and pick top 15
  const leaderboard = Array.from(bonusTotals.entries())
    .map(([elementId, total]) => {
      const el = elementsById.get(elementId);
      if (!el) return null;
      const team = teamsById.get(el.team);
      return {
        id: elementId,
        name: playerName(el),
        teamShort: team?.short_name ?? "—",
        crest: crestUrl(team),
        face: faceUrl(el),
        total,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.total - a!.total))
    .slice(0, 15) as Array<{
      id: number;
      name: string;
      teamShort: string;
      crest?: string;
      face?: string;
      total: number;
    }>;

  return (
    <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif", maxWidth: 1300, margin: "0 auto" }}>
      {/* Minimal top nav */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link href="/" className="btn">Home</Link>
      </header>

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(320px, 380px)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* LEFT: existing content */}
        <div>
          {/* CdG-style hero */}
          <div style={{ textAlign: "center", margin: "28px 0 16px 0" }}>
            <h1 style={{ fontSize: "2.25rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Bonus Points
            </h1>
            <p
              style={{
                marginTop: 8,
                fontSize: "0.8rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#666",
              }}
            >
              Gameweek {gw}
            </p>
          </div>

          {/* Fixture ribbon: all finished fixtures */}
          <div
            style={{
              display: "flex",
              gap: 14,
              overflowX: "auto",
              padding: "8px 4px 16px",
              marginBottom: 16,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {finished.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>No finished fixtures yet.</div>
            ) : (
              finished.map((f) => {
                const home = teamsById.get(f.team_h);
                const away = teamsById.get(f.team_a);
                return (
                  <div
                    key={`ribbon-${f.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #eee",
                      borderRadius: 999,
                      padding: "6px 10px",
                      background: "#fff",
                    }}
                  >
                    {home && (
                      <Image
                        src={crestUrl(home) ?? ""}
                        alt={`${home.name} crest`}
                        width={22}
                        height={22}
                        style={{ objectFit: "contain" }}
                      />
                    )}
                    <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{home?.short_name ?? "Home"}</span>
                    <span style={{ opacity: 0.55, fontSize: 12 }}> {scoreline(f)} </span>
                    <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{away?.short_name ?? "Away"}</span>
                    {away && (
                      <Image
                        src={crestUrl(away) ?? ""}
                        alt={`${away.name} crest`}
                        width={22}
                        height={22}
                        style={{ objectFit: "contain" }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Matches list */}
          <div style={{ display: "grid", gap: 12 }}>
            {[...inProgressOrPending, ...finished].map((f) => {
              const home = teamsById.get(f.team_h);
              const away = teamsById.get(f.team_a);
              const bonus = f.stats.find((s) => s.identifier === "bonus");
              const homeBonus = (bonus?.h ?? []).slice().sort((a, b) => b.value - a.value);
              const awayBonus = (bonus?.a ?? []).slice().sort((a, b) => b.value - a.value);

              return (
                <section
                  key={f.id}
                  style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}
                >
                  {/* Match header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {home && (
                        <Image
                          src={crestUrl(home) ?? ""}
                          alt={`${home.name} crest`}
                          width={32}
                          height={32}
                          style={{ marginRight: 8, objectFit: "contain" }}
                        />
                      )}
                      <strong>{home?.name ?? "Home"}</strong>
                    </div>

                    <div style={{ textAlign: "center", minWidth: 140 }}>
                      <div style={{ fontWeight: 700 }}>{scoreline(f)}</div>
                      <div
                        style={{
                          display: "inline-block",
                          marginTop: 4,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #e5e5e5",
                          fontSize: 12,
                          background: f.finished ? "#f4faf6" : "#fafafa",
                          opacity: f.finished ? 1 : 0.8,
                        }}
                      >
                        {f.finished ? "Finished" : "In progress / Pending"}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <strong style={{ marginRight: 8 }}>{away?.name ?? "Away"}</strong>
                      {away && (
                        <Image
                          src={crestUrl(away) ?? ""}
                          alt={`${away.name} crest`}
                          width={32}
                          height={32}
                          style={{ objectFit: "contain" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Bonus lists */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>Home bonus</h3>
                      {homeBonus.length === 0 ? (
                        <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {homeBonus.map((b) => {
                            const e = elementsById.get(b.element);
                            return (
                              <li key={`h-${f.id}-${b.element}`} style={{ lineHeight: 1.8 }}>
                                {playerName(e)} <span style={{ opacity: 0.7 }}>+{b.value}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>Away bonus</h3>
                      {awayBonus.length === 0 ? (
                        <div style={{ opacity: 0.6, fontSize: 13 }}>—</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {awayBonus.map((b) => {
                            const e = elementsById.get(b.element);
                            return (
                              <li key={`a-${f.id}-${b.element}`} style={{ lineHeight: 1.8 }}>
                                {playerName(e)} <span style={{ opacity: 0.7 }}>+{b.value}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Top 15 Bonus leaderboard */}
        <aside
          style={{
            position: "sticky",
            top: 16,
            alignSelf: "start",
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>
            Top Bonus — GW {gw}
          </h3>
          {leaderboard.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>No bonus points yet.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {leaderboard.map((row, idx) => (
                <li
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "6px 4px",
                    borderBottom: "1px solid #f5f5f5",
                  }}
                >
                  <div style={{ width: 32, height: 32, position: "relative" }}>
                    {row.face ? (
                      <Image
                        src={row.face}
                        alt={`${row.name} face`}
                        fill
                        sizes="32px"
                        style={{ objectFit: "cover", borderRadius: 6 }}
                      />
                    ) : row.crest ? (
                      <Image
                        src={row.crest}
                        alt={`${row.teamShort} crest`}
                        fill
                        sizes="32px"
                        style={{ objectFit: "contain" }}
                      />
                    ) : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {idx + 1}. {row.name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{row.teamShort}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    +{row.total}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>
            Faces & crests from the official Premier League CDN.
          </div>
        </aside>
      </div>
    </main>
  );
}
