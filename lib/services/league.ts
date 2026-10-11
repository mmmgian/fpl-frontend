import { currentEvent, gwStatus, summarizeStandings } from "../domain";
import type { LeagueModel } from "./models";
import type { FplPort, ServiceOptions } from "./ports";

/** Use case: the league table with this gameweek's headline numbers. */
export function createLeagueService(fpl: Pick<FplPort, "standings" | "bootstrap">, { now = () => new Date() }: ServiceOptions = {}) {
  return {
    async load(leagueId: number): Promise<LeagueModel> {
      // Both requests start together; bootstrap is only needed once the league is known to exist.
      const bootstrapRequest = fpl.bootstrap();
      bootstrapRequest.catch(() => {}); // awaited below; avoid an unhandled rejection on the "not found" path

      const standings = await fpl.standings(leagueId);
      if (!standings) return { kind: "not-found", leagueId };

      const { events } = await bootstrapRequest;
      const event = currentEvent(events);
      const rows = standings.standings.results;
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
      };
    },
  };
}
