/**
 * European fixtures from football-data.org (https://www.football-data.org). Needs an API key. On the free tier the
 * only European competition included is the Champions League; Europa League and Conference League need a paid plan,
 * and a club playing only in those simply shows no European fixtures. We show what the key allows and say no more.
 */
import type { EuropeMatch } from "../domain";
import type { EuropePort } from "../services/ports";

const BASE = "https://api.football-data.org/v4";
/** Competitions to show: UEFA's. Domestic matches already have their own place on the page. */
const EUROPEAN = /uefa|champions league|europa|conference/i;

interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
}

/** "Manchester City FC" and "Man City" both become words the other can be found in. */
const ALIASES: [RegExp, string][] = [
  [/\bman utd\b/g, "manchester united"],
  [/\bman city\b/g, "manchester city"],
  [/\bspurs\b/g, "tottenham hotspur"],
  [/\bwolves\b/g, "wolverhampton wanderers"],
  [/\bnott'?m\b/g, "nottingham"],
  [/\bnewcastle\b(?! united)/g, "newcastle united"],
  [/\bwest ham\b(?! united)/g, "west ham united"],
  [/\bbrighton\b(?! (&|and|hove))/g, "brighton hove albion"],
  [/\bleeds\b(?! united)/g, "leeds united"],
  [/\bhull\b(?! city)/g, "hull city"],
  [/\bipswich\b(?! town)/g, "ipswich town"],
  [/\bcoventry\b(?! city)/g, "coventry city"],
  [/\bbournemouth\b/g, "bournemouth"],
];

export function normaliseClub(name: string): string {
  let s = name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ");
  for (const [re, to] of ALIASES) s = s.replace(re, to);
  return s
    .replace(/\band\b/g, " ")
    .replace(/\b(afc|fc|cf|a\.f\.c)\b/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The provider's team for an FPL club: by three-letter code if it agrees, otherwise by name. Null if unsure. */
export function matchClub(teams: FdTeam[], club: { name: string; short: string }): FdTeam | null {
  const byName = normaliseClub(club.name);
  const exact = teams.filter((t) => [t.name, t.shortName].some((n) => n && normaliseClub(n) === byName));
  if (exact.length === 1) return exact[0];
  const contained = teams.filter((t) => [t.name, t.shortName].some((n) => n && (normaliseClub(n).includes(byName) || byName.includes(normaliseClub(n))) && normaliseClub(n) !== ""));
  if (contained.length === 1) return contained[0];
  const tla = teams.filter((t) => t.tla && t.tla.toUpperCase() === club.short.toUpperCase());
  return tla.length === 1 ? tla[0] : null;
}

interface FdMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  competition?: { name?: string };
  homeTeam?: { id?: number; name?: string; shortName?: string };
  awayTeam?: { id?: number; name?: string; shortName?: string };
}

export function mapMatches(matches: unknown, clubId: number, max = 5): EuropeMatch[] {
  if (!Array.isArray(matches)) return [];
  const out: EuropeMatch[] = [];
  const seen = new Set<number>();
  for (const m of matches as (FdMatch | null)[]) {
    if (!m || typeof m !== "object") continue;
    const competition = m.competition?.name;
    // A match the provider repeats (it can, across competitions' listings) is listed once: its id is the list's key.
    if (typeof m.id !== "number" || seen.has(m.id) || !competition || !EUROPEAN.test(competition)) continue;
    seen.add(m.id);
    const date = m.utcDate && !Number.isNaN(Date.parse(m.utcDate)) ? new Date(m.utcDate).toISOString() : null;
    out.push({
      id: m.id,
      competition,
      utcDate: date,
      home: m.homeTeam?.shortName || m.homeTeam?.name || "TBC",
      away: m.awayTeam?.shortName || m.awayTeam?.name || "TBC",
      clubIsHome: m.homeTeam?.id === clubId,
      status: m.status ?? "SCHEDULED",
    });
  }
  // Undated matches last; ties by id, so two undated matches never compare as Infinity - Infinity (NaN).
  const at = (x: EuropeMatch) => (x.utcDate ? Date.parse(x.utcDate) : Infinity);
  return out.sort((a, b) => (at(a) === at(b) ? a.id - b.id : at(a) < at(b) ? -1 : 1)).slice(0, max);
}

/** The port, or null when no API key is configured (the page then says so instead of showing an empty card). */
export function createFootballData(apiKey: string | undefined, fetcher: typeof fetch = fetch): EuropePort | null {
  if (!apiKey) return null;
  const get = async (path: string, revalidate: number) => {
    const res = await fetcher(`${BASE}${path}`, {
      headers: { "X-Auth-Token": apiKey },
      // An optional extra: if it is slow, the page should not wait for it.
      signal: AbortSignal.timeout(3000),
      next: { revalidate },
    } as RequestInit);
    if (!res.ok) throw new Error(`football-data.org answered ${res.status} for ${path.split("?")[0]}`);
    return res.json() as Promise<unknown>;
  };
  return {
    async fixtures(club) {
      // The club list changes once a season; fixtures move a little more often.
      const list = (await get("/competitions/PL/teams", 86_400)) as { teams?: FdTeam[] };
      const team = matchClub(Array.isArray(list.teams) ? list.teams : [], club);
      if (!team) throw new Error(`football-data.org has no club matching "${club.name}"`);
      const data = (await get(`/teams/${team.id}/matches?status=SCHEDULED`, 21_600)) as { matches?: unknown };
      return mapMatches(data.matches, team.id);
    },
  };
}
