import { cleanStandings, currentEvent, gwStatus, leagueHeadlines, leagueStats, matchCounts, MAX_STATS_MANAGERS, squadWeek, statsPhase, summarizeStandings, varietyKey } from "../domain";
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
 * for the schedule (to spot double gameweeks), and one per manager for their picks. Once FPL has checked the week
 * (`settled`) they are cached for an hour; while it is provisional, bonus points can still change, so they are asked
 * for fresh. A manager whose picks fail is simply left out, and a failure of the shared requests means none.
 */
async function loadSquads(fpl: Pick<FplPort, "picks" | "live" | "allFixtures">, rows: StandingRow[], gw: number, settled: boolean, elements: Bootstrap["elements"]): Promise<Map<number, SquadWeek>> {
  const found = new Map<number, SquadWeek>();
  const [live, schedule] = await Promise.allSettled([fpl.live(gw, settled), fpl.allFixtures()]);
  if (live.status !== "fulfilled") return found;
  const matches = schedule.status === "fulfilled" ? matchCounts(schedule.value, gw) : null;
  await withinDeadline(
    Promise.allSettled(
      rows.map(async (r) => {
        const picks = await fpl.picks(r.entry, gw, settled);
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

      const rows = withAvatars(cleanStandings(standings.standings?.results), avatars, { replaceBadges });
      // Only for leagues of a size where one request per manager is reasonable; bigger ones get the plain table.
      const withExtras = rows.length > 0 && rows.length <= MAX_STATS_MANAGERS;
      // Everything runs through the last finished gameweek: the one in progress is half-played.
      const lastFinished = (events: Bootstrap["events"]) => events.filter((e) => e.finished).reduce<Bootstrap["events"][number] | null>((a, e) => (!a || e.id > a.id ? e : a), null);
      const settledThrough = (events: Bootstrap["events"]) => lastFinished(events)?.id ?? 0;
      // The squads need only the gameweek number, so they load alongside the histories, not after them.
      const squadsRequest: Promise<Map<number, SquadWeek>> = bootstrapRequest
        .then(({ events, elements }) => {
          const done = lastFinished(events);
          return withExtras && done ? loadSquads(fpl, rows, done.id, Boolean(done.data_checked), elements) : new Map<number, SquadWeek>();
        })
        .catch(() => new Map<number, SquadWeek>());
      const [bootstrap, histories, squads] = await Promise.all([
        // FPL's game-info file failing (it does while the game updates) costs the gameweek and the extras, not the table.
        bootstrapRequest.catch(() => null),
        withExtras ? loadHistories(fpl, rows) : Promise.resolve(new Map<number, EntryHistory>()),
        squadsRequest,
      ]);
      const events = bootstrap?.events ?? [];
      const event = currentEvent(events);
      const at = now();
      const status = event ? gwStatus(event, at) : null;
      const summary = summarizeStandings(rows);
      // Without the gameweek list there is no telling which week is half-played, so no extras rather than wrong ones.
      const stats = bootstrap ? leagueStats(rows, histories, settledThrough(events)) : null;

      return {
        kind: "ok",
        leagueId,
        name: typeof standings.league?.name === "string" ? standings.league.name : "",
        gameweek: event && status ? { name: event.name, status } : null,
        gameweekUnavailable: !bootstrap,
        rows,
        truncated: Boolean(standings.standings?.has_next),
        newEntries: Array.isArray(standings.new_entries?.results) ? standings.new_entries.results.length : 0,
        summary: summary && { leader: summary.leader, best: event ? summary.best : null, managers: summary.managers },
        stats: stats && (squads.size ? { ...stats, squad: Object.fromEntries(squads) } : stats),
        currentGw: event?.id ?? null,
        statsPhase: stats ? statsPhase(stats.gw, event && status ? { id: event.id, status } : null) : null,
        headlines: leagueHeadlines(rows, stats),
        // Wording only: redrawn daily, and the moment FPL moves the gameweek on (live -> provisional -> final).
        variety: varietyKey(event?.id ?? 0, status ?? "upcoming", at),
      };
    },
  };
}
