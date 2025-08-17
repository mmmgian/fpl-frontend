// app/team/[entryId]/page.tsx
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Event = { id: number; is_current: boolean; finished: boolean };
type Team = { id: number; name: string; short_name: string; code: number };
type Element = {
  id: number;
  web_name: string;           // FPL short name (what you're used to seeing in FPL)
  first_name: string;
  second_name: string;
  team: number;               // Team.id
  element_type: number;       // 1 GK, 2 DEF, 3 MID, 4 FWD
};

type Bootstrap = {
  events: Event[];
  teams: Team[];
  elements: Element[];
};

type Pick = {
  element: number;            // player id
  position: number;
  multiplier: number;         // 2 if captain (or 3 if triple captain), etc.
  is_captain: boolean;
  is_vice_captain: boolean;
};

type EntryPicks = { picks: Pick[] };

type LiveElement = { id: number; stats: { total_points: number } };
type LiveGW = { elements: LiveElement[] };

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

function crestUrl(team?: Team) {
  if (!team) return "";
  // team.code comes from bootstrap and is correct for 25/26
  return `https://resources.premierleague.com/premierleague/badges/t${team.code}.png`;
}

function bandIcon(p: Pick) {
  if (p.is_captain) return " ⓒ";
  if (p.is_vice_captain) return " Ⓥ";
  return "";
}

function sectionTitle(et: number) {
  return et === 1 ? "Goalkeeper" : et === 2 ? "Defenders" : et === 3 ? "Midfielders" : "Forwards";
}

export default async function TeamPage(props: { params: Promise<{ entryId: string }> }) {
  // IMPORTANT: await params because your project's PageProps treats params as a Promise
  const { entryId } = await props.params;

  // 1) Bootstrap (teams, elements, events)
  const boot = await fetchJSON<Bootstrap>("https://fantasy.premierleague.com/api/bootstrap-static/");

  // Determine current GW
  const current =
    boot.events.find((e) => e.is_current) ??
    boot.events.find((e) => !e.finished) ??
    boot.events[0];
  const gw = current?.id ?? 1;

  // 2) Entry picks for current GW
  const picksData = await fetchJSON<EntryPicks>(
    `https://fantasy.premierleague.com/api/entry/${entryId}/event/${gw}/picks/`
  );

  // 3) Live GW points
  const live = await fetchJSON<LiveGW>(`https://fantasy.premierleague.com/api/event/${gw}/live/`);

  // Indexes
  const elementsById = new Map<number, Element>(boot.elements.map((e) => [e.id, e]));
  const teamsById = new Map<number, Team>(boot.teams.map((t) => [t.id, t]));
  const livePoints = new Map<number, number>(live.elements.map((le) => [le.id, le.stats.total_points]));

  // Build rows enriched with names, crests, and points
  const enriched = picksData.picks
    .map((p) => {
      const el = elementsById.get(p.element);
      if (!el) return null;
      const team = teamsById.get(el.team);
      const rawPoints = livePoints.get(el.id) ?? 0;
      const effectivePoints = rawPoints * (p.multiplier || 1); // includes captaincy multiplier

      return {
        pick: p,
        el,
        team,
        crest: crestUrl(team),
        webName: el.web_name, // FPL short name
        elementType: el.element_type,
        rawPoints,
        effectivePoints,
      };
    })
    .filter(Boolean) as Array<{
      pick: Pick;
      el: Element;
      team?: Team;
      crest: string;
      webName: string;
      elementType: number;
      rawPoints: number;
      effectivePoints: number;
    }>;

  // Group by element_type
  const groups: Record<number, typeof enriched> = { 1: [], 2: [], 3: [], 4: [] };
  for (const row of enriched) groups[row.elementType].push(row);

  const section = (et: 1 | 2 | 3 | 4) => {
    const rows = groups[et] ?? [];
    if (rows.length === 0) return null;

    return (
      <section key={et} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 16 }}>{sectionTitle(et)}</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Player</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Team</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Points (GW)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.el.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" }}>
                    {/* Crest + player web_name + captain/vice marker */}
                    {r.crest && (
                      <Image
                        src={r.crest}
                        alt={`${r.team?.name ?? "Team"} crest`}
                        width={20}
                        height={20}
                        style={{ verticalAlign: "middle", marginRight: 8, objectFit: "contain" }}
                      />
                    )}
                    <span style={{ verticalAlign: "middle" }}>
                      {r.webName}
                      <span style={{ opacity: 0.7 }}>{bandIcon(r.pick)}</span>
                    </span>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    {r.team?.short_name ?? "—"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    {/* Show effective points (includes captaincy multiplier); hover shows raw */}
                    <span title={`Raw: ${r.rawPoints}`}>{r.effectivePoints}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" className="btn">Back to League Table</Link>
        <div style={{ opacity: 0.75 }}>Team — Entry {entryId} (GW {gw})</div>
      </header>

      {section(1)}
      {section(2)}
      {section(3)}
      {section(4)}

      <p style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
        Names use FPL short names. Points reflect current gameweek, including captaincy multipliers.
      </p>
    </main>
  );
}
