import { cleanStandings, currentEvent, gwStatus, leagueHeadlines, leagueStats, matchCounts, MAX_STATS_MANAGERS, nextDeadline, refreshPlan, seasonOver, squadWeek, statsPhase, summarizeStandings, varietyKey } from "../domain";
import type { SquadWeek } from "../domain";
import type { Bootstrap, EntryHistory, StandingRow } from "../domain/types";
import type { LeagueExtras, LeagueModel, LeagueStream, LeagueTable } from "./models";
import { withAvatars } from "./avatars";
import type { FplPort, ServiceOptions } from "./ports";
import { ifAlreadyIn, pulseOf, withinDeadline } from "./shared";

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
  /**
   * The table as soon as the standings and the game file are in (the game file is small and cached), and the extras
   * that need one request per manager (histories, squads) as a promise behind it. Only the standings failing rejects.
   */
  async function loadStreaming(leagueId: number): Promise<LeagueStream> {
    // Both requests start together; bootstrap is only needed once the league is known to exist.
    const bootstrapRequest = fpl.bootstrap();
    bootstrapRequest.catch(() => {}); // awaited below; avoid an unhandled rejection on the "not found" path
    // The schedule (cached for an hour) tells a match in play from a quiet day, for the refresh rate and the phase line.
    // Optional: used only if it is in by the time the table is ready, never waited for.
    const scheduleRequest = fpl.allFixtures().catch(() => null);

    const standings = await fpl.standings(leagueId);
    if (!standings) return { model: { kind: "not-found", leagueId }, extras: Promise.resolve({ stats: null, statsPhase: null, headlines: [] }), pending: false };

    const rows = withAvatars(cleanStandings(standings.standings?.results), avatars, { replaceBadges });
    // Only for leagues of a size where one request per manager is reasonable; bigger ones get the plain table.
    const withExtras = rows.length > 0 && rows.length <= MAX_STATS_MANAGERS;
    // Everything runs through the last finished gameweek: the one in progress is half-played.
    const lastFinished = (events: Bootstrap["events"]) => events.filter((e) => e.finished).reduce<Bootstrap["events"][number] | null>((a, e) => (!a || e.id > a.id ? e : a), null);
    const settledThrough = (events: Bootstrap["events"]) => lastFinished(events)?.id ?? 0;
    // The per-manager requests start now, before the game file is back, and are not waited for here. Neither rejects.
    const historiesRequest = withExtras ? loadHistories(fpl, rows).catch(() => new Map<number, EntryHistory>()) : Promise.resolve(new Map<number, EntryHistory>());
    // The squads need only the gameweek number, so they load alongside the histories, not after them.
    const squadsRequest: Promise<Map<number, SquadWeek>> = bootstrapRequest
      .then(({ events, elements }) => {
        const done = lastFinished(events);
        return withExtras && done ? loadSquads(fpl, rows, done.id, Boolean(done.data_checked), elements) : new Map<number, SquadWeek>();
      })
      .catch(() => new Map<number, SquadWeek>());

    // FPL's game-info file failing (it does while the game updates) costs the gameweek and the extras, not the table.
    const bootstrap = await bootstrapRequest.catch(() => null);
    const events = bootstrap?.events ?? [];
    const event = currentEvent(events);
    const at = now();
    const status = event ? gwStatus(event, at) : null;
    const summary = summarizeStandings(rows);
    const schedule = bootstrap ? await ifAlreadyIn(scheduleRequest) : null;
    const pulse = event && status === "live" ? pulseOf(schedule, event.id, at) : null;
    const next = bootstrap ? nextDeadline(events, at) : null;
    const tableOnly: LeagueExtras = { stats: null, statsPhase: null, headlines: leagueHeadlines(rows, null) };

    const model: LeagueTable = {
      kind: "ok",
      leagueId,
      name: typeof standings.league?.name === "string" ? standings.league.name : "",
      gameweek: event && status ? { name: event.name, status } : null,
      gameweekUnavailable: !bootstrap,
      rows,
      truncated: Boolean(standings.standings?.has_next),
      newEntries: Array.isArray(standings.new_entries?.results) ? standings.new_entries.results.length : 0,
      summary: summary && { leader: summary.leader, best: event ? summary.best : null, managers: summary.managers },
      currentGw: event?.id ?? null,
      // Wording only: redrawn daily, and the moment FPL moves the gameweek on (live -> provisional -> final).
      variety: varietyKey(event?.id ?? 0, status ?? "upcoming", at),
      // An unreadable gameweek (FPL's game file failing while the game updates) is retried slowly, like provisional.
      refreshMs: !bootstrap ? refreshPlan("provisional", null, at) : status ? refreshPlan(status, pulse, at) : null,
      pulse,
      // Only once the latest week is played (or before the season): while it is live, the next deadline is noise.
      nextDeadline: next && status !== "live" ? { gw: next.gw, at: next.at } : null,
      seasonOver: seasonOver(status, next, events),
      ...tableOnly,
    };

    // Without the gameweek list there is no telling which week is half-played, so no extras rather than wrong ones;
    // and a league too big (or empty) has none to wait for. Either way the table is the whole page.
    if (!bootstrap || !withExtras) return { model, extras: Promise.resolve(tableOnly), pending: false };

    const extras = Promise.all([historiesRequest, squadsRequest])
      .then(([histories, squads]): LeagueExtras => {
        const stats = leagueStats(rows, histories, settledThrough(events), event?.id);
        return {
          stats: stats && (squads.size ? { ...stats, squad: Object.fromEntries(squads) } : stats),
          statsPhase: stats ? statsPhase(stats.gw, event && status ? { id: event.id, status } : null) : null,
          headlines: leagueHeadlines(rows, stats),
        };
      })
      // Odd data that trips the arithmetic costs the extras, never the page.
      .catch(() => tableOnly);
    return { model, extras, pending: true };
  }

  return {
    loadStreaming,
    /** The whole page in one go: the table and its extras, waiting for both. */
    async load(leagueId: number): Promise<LeagueModel> {
      const { model, extras } = await loadStreaming(leagueId);
      return model.kind === "ok" ? { ...model, ...(await extras) } : model;
    },
  };
}
