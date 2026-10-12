import { currentEvent, gwStatus, leagueStats, matchCounts, MAX_STATS_MANAGERS, squadWeek, summarizeStandings } from "../domain";
import type { SquadWeek } from "../domain";
import type { Bootstrap, EntryHistory, StandingRow } from "../domain/types";
import type { LeagueModel } from "./models";
import { withAvatars } from "./avatars";
import type { FplPort, ServiceOptions } from "./ports";
import { withinDeadline } from "./shared";

export { STATS_DEADLINE_MS } from "./shared";

/** Every manager's season, fetched together. A manager whose history fails or is missing is simply left out. */
async function loadHistories(fpl: Pick<FplPort, "history">, rows: StandingRow[]): Promise<Map<number, EntryHistory>> {
  const found = new Map<number, EntryHistory>();
  await withinDeadline(
    Promise.allSettled(
      rows.map(async (r) => {
        const h = await fpl.history(r.entry);
        if (h) found.set(r.entry, h);
      }),
    ),
  );
  return new Map(found); // a copy: late arrivals after the deadline must not change what this render uses
}

/**
 * What each manager's XI did in a finished gameweek (xG, xA, DefCon): one request for the gameweek's live numbers, one
 * for the schedule (to spot double gameweeks), and one per manager for their picks. These are settled data, so they
 * are cached for an hour; a manager whose picks fail is simply left out, and a failure of the shared requests means none.
 */
async function loadSquads(fpl: Pick<FplPort, "picks" | "live" | "allFixtures">, rows: StandingRow[], gw: number, elements: Bootstrap["elements"]): Promise<Map<number, SquadWeek>> {
  const found = new Map<number, SquadWeek>();
  const [live, schedule] = await Promise.allSettled([fpl.live(gw, true), fpl.allFixtures()]);
  if (live.status !== "fulfilled") return found;
  const matches = schedule.status === "fulfilled" ? matchCounts(schedule.value, gw) : null;
  await withinDeadline(
    Promise.allSettled(
      rows.map(async (r) => {
        const picks = await fpl.picks(r.entry, gw, true);
        if (picks) found.set(r.entry, squadWeek(gw, picks, live.value, elements, matches));
      }),
    ),
  );
  return new Map(found);
}

/** Use case: the league table with this gameweek's headline numbers, and the fun extras when the data is there. */
export function createLeagueService(fpl: Pick<FplPort, "standings" | "bootstrap" | "history" | "picks" | "live" | "allFixtures">, { now = () => new Date(), avatars, replaceBadges }: ServiceOptions = {}) {
  return {
    async load(leagueId: number): Promise<LeagueModel> {
      // Both requests start together; bootstrap is only needed once the league is known to exist.
      const bootstrapRequest = fpl.bootstrap();
      bootstrapRequest.catch(() => {}); // awaited below; avoid an unhandled rejection on the "not found" path

      const standings = await fpl.standings(leagueId);
      if (!standings) return { kind: "not-found", leagueId };

      const rows = withAvatars(standings.standings.results, avatars, { replaceBadges });
      // Only for leagues of a size where one request per manager is reasonable; bigger ones get the plain table.
      const withExtras = rows.length > 0 && rows.length <= MAX_STATS_MANAGERS;
      // Everything runs through the last finished gameweek: the one in progress is half-played.
      const settledThrough = (events: Bootstrap["events"]) => Math.max(0, ...events.filter((e) => e.finished).map((e) => e.id));
      // The squads need only the gameweek number, so they load alongside the histories, not after them.
      const squadsRequest: Promise<Map<number, SquadWeek>> = bootstrapRequest
        .then(({ events, elements }) => (withExtras && settledThrough(events) > 0 ? loadSquads(fpl, rows, settledThrough(events), elements) : new Map<number, SquadWeek>()))
        .catch(() => new Map<number, SquadWeek>());
      const [{ events }, histories, squads] = await Promise.all([
        bootstrapRequest,
        withExtras ? loadHistories(fpl, rows) : Promise.resolve(new Map<number, EntryHistory>()),
        squadsRequest,
      ]);
      const event = currentEvent(events);
      const summary = summarizeStandings(rows);
      const stats = leagueStats(rows, histories, settledThrough(events));

      return {
        kind: "ok",
        leagueId,
        name: standings.league.name,
        gameweek: event ? { name: event.name, status: gwStatus(event, now()) } : null,
        rows,
        truncated: Boolean(standings.standings.has_next),
        newEntries: standings.new_entries?.results.length ?? 0,
        summary: summary && { leader: summary.leader, best: event ? summary.best : null, managers: summary.managers },
        stats: stats && (squads.size ? { ...stats, squad: Object.fromEntries(squads) } : stats),
      };
    },
  };
}
