import { currentEvent, gwStatus, leagueStats, MAX_STATS_MANAGERS, summarizeStandings } from "../domain";
import type { EntryHistory, StandingRow } from "../domain/types";
import type { LeagueModel } from "./models";
import { withAvatars } from "./avatars";
import type { FplPort, ServiceOptions } from "./ports";

/** How long the table waits for the extras before showing itself without them. The requests keep going and fill the cache. */
export const STATS_DEADLINE_MS = 6000;

/** Every manager's season, fetched together. A manager whose history fails or is missing is simply left out. */
async function loadHistories(fpl: Pick<FplPort, "history">, rows: StandingRow[]): Promise<Map<number, EntryHistory>> {
  const found = new Map<number, EntryHistory>();
  const all = Promise.allSettled(
    rows.map(async (r) => {
      const h = await fpl.history(r.entry);
      if (h) found.set(r.entry, h);
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, STATS_DEADLINE_MS)));
  await Promise.race([all, deadline]);
  clearTimeout(timer);
  return new Map(found); // a copy: late arrivals after the deadline must not change what this render uses
}

/** Use case: the league table with this gameweek's headline numbers, and the fun extras when the data is there. */
export function createLeagueService(fpl: Pick<FplPort, "standings" | "bootstrap" | "history">, { now = () => new Date(), avatars }: ServiceOptions = {}) {
  return {
    async load(leagueId: number): Promise<LeagueModel> {
      // Both requests start together; bootstrap is only needed once the league is known to exist.
      const bootstrapRequest = fpl.bootstrap();
      bootstrapRequest.catch(() => {}); // awaited below; avoid an unhandled rejection on the "not found" path

      const standings = await fpl.standings(leagueId);
      if (!standings) return { kind: "not-found", leagueId };

      const rows = withAvatars(standings.standings.results, avatars);
      const [{ events }, histories] = await Promise.all([
        bootstrapRequest,
        // Only for leagues of a size where one request per manager is reasonable; bigger ones get the plain table.
        rows.length > 0 && rows.length <= MAX_STATS_MANAGERS ? loadHistories(fpl, rows) : Promise.resolve(new Map<number, EntryHistory>()),
      ]);
      const event = currentEvent(events);
      const summary = summarizeStandings(rows);

      return {
        kind: "ok",
        leagueId,
        name: standings.league.name,
        gameweek: event ? { name: event.name, status: gwStatus(event, now()) } : null,
        rows,
        truncated: Boolean(standings.standings.has_next),
        newEntries: standings.new_entries?.results.length ?? 0,
        summary: summary && { leader: summary.leader, best: event ? summary.best : null, managers: summary.managers },
        // Through the last finished gameweek: the one in progress is half-played.
        stats: leagueStats(rows, histories, Math.max(0, ...events.filter((e) => e.finished).map((e) => e.id))),
      };
    },
  };
}
