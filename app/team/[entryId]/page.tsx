// app/team/[entryId]/page.tsx
import Link from "next/link";

type PlayerRow = {
  name: string;
  team?: string;
  now_cost?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
};

type TeamPayload = {
  entry_id: number;
  gw: number;
  team: { GK: PlayerRow[]; DEF: PlayerRow[]; MID: PlayerRow[]; FWD: PlayerRow[] };
};

type LeagueRow = { entry: number; entry_name: string; player_name: string };
type LeaguePayload = { standings?: { results?: LeagueRow[] } };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_BASE = "https://fpl-backend-poix.onrender.com";
const LEAGUE_ID = process.env.LEAGUE_ID ?? "1391467";

async function fetchWithTimeout(url: string, ms = 12000, init?: RequestInit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally { clearTimeout(t); }
}

async function getTeam(entryId: string): Promise<TeamPayload | null> {
  const res = await fetchWithTimeout(`${API_BASE}/team/${entryId}`);
  if (!res.ok) return null;
  return res.json();
}

async function getEntryMeta(entryId: string): Promise<{ teamName?: string; managerName?: string } | null> {
  const res = await fetchWithTimeout(`${API_BASE}/league/${LEAGUE_ID}`);
  if (!res.ok) return null;
  const data = (await res.json()) as LeaguePayload;
  const row = data?.standings?.results?.find((r) => String(r.entry) === String(entryId));
  if (!row) return null;
  return { teamName: row.entry_name, managerName: row.player_name };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const [team, meta] = await Promise.all([getTeam(entryId), getEntryMeta(entryId)]);

  if (!team) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Link href="/" style={{ display: "inline-block", marginBottom: 20 }}>
          ← Back to League Table
        </Link>
        <h1>Couldn&#39;t load team {entryId}</h1>
      </main>
    );
  }

  const heading = meta?.teamName || `Entry ${team.entry_id}`;
  const sub = meta?.managerName ? `Manager: ${meta.managerName}` : undefined;

  const Section = ({ title, rows }: { title: string; rows: PlayerRow[] }) => (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Player", "Club", "Cost (m)"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = r.is_captain ? " 🅒" : r.is_vice_captain ? " 🅥" : "";
              return (
                <tr key={`${r.name}-${i}`}>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    {r.name}{badge}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>{r.team ?? ""}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #f3f3f3" }}>
                    {r.now_cost != null ? (r.now_cost / 10).toFixed(1) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
        Legend: <span>🅒 Captain</span> &nbsp;•&nbsp; <span>🅥 Vice-captain</span>
      </div>
    </section>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: 20 }}>
        ← Back to League Table
      </Link>

      <h1 style={{ fontSize: 28, marginBottom: 6 }}>{heading}</h1>
      {sub && <h2 style={{ fontSize: 16, color: "#555", marginTop: 0 }}>{sub}</h2>}
      <div style={{ marginTop: 6, opacity: 0.7 }}>Team for GW {team.gw}</div>

      <Section title="Goalkeepers" rows={team.team.GK} />
      <Section title="Defenders" rows={team.team.DEF} />
      <Section title="Midfielders" rows={team.team.MID} />
      <Section title="Forwards" rows={team.team.FWD} />
    </main>
  );
}
