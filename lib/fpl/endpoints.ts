/** One function per FPL endpoint, each with its own cache lifetime. */
import type { Entry, EntryHistory, EntryPicks, EventLive, Fixture, LeagueStandings, ScheduledFixture } from "../domain/types";
import { FplError, fplGet } from "./http";

/** FPL answered 200 but not with the list we expected: fail loudly instead of passing junk inward. */
function expectList<T>(value: unknown, path: string): T[] {
  if (!Array.isArray(value)) throw new FplError(`Unexpected response from FPL for ${path}`, 502);
  return value as T[];
}

/** All pages of a classic league (50 per page), capped to protect against runaway paging. */
export async function getLeagueStandings(leagueId: number, maxPages = 10): Promise<LeagueStandings> {
  const first = await fplGet<LeagueStandings>(`/leagues-classic/${leagueId}/standings/`, { revalidate: 60 });
  let page = 1;
  let last = first;
  while (last.standings.has_next && page < maxPages) {
    page += 1;
    last = await fplGet<LeagueStandings>(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`, {
      revalidate: 60,
    });
    first.standings.results.push(...last.standings.results);
  }
  return first;
}

export const getEntry = (entryId: number) => fplGet<Entry>(`/entry/${entryId}/`, { revalidate: 300 });

export async function getEntryPicks(entryId: number, gw: number, finished: boolean): Promise<EntryPicks> {
  const path = `/entry/${entryId}/event/${gw}/picks/`;
  const raw = await fplGet<Partial<EntryPicks> | null>(path, { revalidate: finished ? 3600 : 60 });
  if (!raw || !Array.isArray(raw.picks) || !raw.entry_history) throw new FplError(`Unexpected response from FPL for ${path}`, 502);
  return raw as EntryPicks;
}

export async function getEventLive(gw: number, finished: boolean): Promise<EventLive> {
  const path = `/event/${gw}/live/`;
  const raw = await fplGet<Partial<EventLive> | null>(path, { revalidate: finished ? 3600 : 60 });
  if (!raw || !Array.isArray(raw.elements)) throw new FplError(`Unexpected response from FPL for ${path}`, 502);
  return raw as EventLive;
}

export const getFixtures = async (gw: number, finished: boolean): Promise<Fixture[]> =>
  expectList<Fixture>(await fplGet<unknown>(`/fixtures/?event=${gw}`, { revalidate: finished ? 3600 : 60 }), `/fixtures/?event=${gw}`);

/**
 * A manager's whole season so far: gameweek results, chips played and past seasons. Changes once a gameweek.
 * Normalised here, at the boundary, so a partial or odd response degrades to "no history" and never reaches
 * the domain as undefined.
 */
export async function getEntryHistory(entryId: number): Promise<EntryHistory> {
  const raw = await fplGet<Partial<EntryHistory> | null>(`/entry/${entryId}/history/`, { revalidate: 600 });
  const list = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);
  return { current: list(raw?.current), past: list(raw?.past), chips: list(raw?.chips) };
}

/**
 * The season schedule with difficulty ratings. Only the schedule fields are kept (the raw feed carries
 * match stats for every fixture), and it is cached for an hour: kick-off changes are rare and live match
 * state comes from getFixtures(gw) instead.
 */
export async function getAllFixtures(): Promise<ScheduledFixture[]> {
  const raw = expectList<ScheduledFixture>(await fplGet<unknown>("/fixtures/", { revalidate: 3600 }), "/fixtures/");
  return raw.map((f) => ({
    id: f.id,
    event: f.event,
    team_h: f.team_h,
    team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty,
    team_a_difficulty: f.team_a_difficulty,
    kickoff_time: f.kickoff_time,
    started: f.started,
    finished: f.finished,
    finished_provisional: f.finished_provisional,
    team_h_score: f.team_h_score ?? null,
    team_a_score: f.team_a_score ?? null,
  }));
}
