import type { Entry } from "../domain";
import { buildTeamSheet, currentEvent, gameweekPoints, selectGameweek } from "../domain";
import type { LeagueSpot, TeamGameweek, TeamIdentity, TeamModel } from "./models";
import type { AvatarPort, FplPort, MascotPort, ServiceOptions } from "./ports";
import { buildInsights } from "./teamInsights";

const identityOf = (entry: Entry, avatars?: AvatarPort, mascots?: MascotPort): TeamIdentity => ({
  entryId: entry.id,
  teamName: entry.name,
  firstName: entry.player_first_name,
  lastName: entry.player_last_name,
  manager: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
  avatar: avatars?.src(entry.id) ?? null,
  mascot: mascots?.scenes(entry.id) ?? null,
});

/** Use case: one manager's team sheet for a gameweek. */
export function createTeamService(
  fpl: Pick<FplPort, "bootstrap" | "entry" | "picks" | "live" | "fixtures" | "allFixtures" | "history" | "standings">,
  { now = () => new Date(), avatars, mascots, leagueId }: ServiceOptions = {},
) {
  /**
   * Picks (null = FPL has none for that GW), live points and match state (null = unavailable). The last two
   * are nice-to-haves: the team is still shown without them.
   */
  const loadGameweek = (entryId: number, gw: number, settled: boolean) =>
    Promise.all([
      fpl.picks(entryId, gw, settled),
      fpl.live(gw, settled).catch(() => null),
      fpl.fixtures(gw, settled).catch(() => null),
    ]);

  /** The team's place in the league table; null if the league is unknown or unavailable (the page works without it). */
  const leagueSpot = async (entryId: number): Promise<LeagueSpot | null> => {
    if (!leagueId) return null;
    try {
      const rows = [...((await fpl.standings(leagueId()))?.standings.results ?? [])].sort((a, b) => a.rank - b.rank);
      const i = rows.findIndex((r) => r.entry === entryId);
      if (i < 0) return null;
      const at = (r: (typeof rows)[number] | undefined) => (r ? { entryId: r.entry, teamName: r.entry_name, rank: r.rank, points: r.total } : null);
      const me = rows[i];
      return { rank: me.rank, size: rows.length, points: me.total, leader: at(rows[0])!, moved: me.last_rank > 0 ? me.last_rank - me.rank : 0, prev: at(rows[i - 1]), next: at(rows[i + 1]) };
    } catch {
      return null;
    }
  };

  return {
    /** Who the team is, or null if it doesn't exist or FPL can't be reached (used for page titles). */
    async identify(entryId: number): Promise<TeamIdentity | null> {
      return fpl
        .entry(entryId)
        .then((entry) => (entry ? identityOf(entry, avatars, mascots) : null))
        .catch(() => null);
    },

    async load(entryId: number, requestedGw: string | string[] | undefined): Promise<TeamModel> {
      const bootstrapRequest = fpl.bootstrap();
      // Season facts and the schedule don't depend on anything else, so start them now. Both are optional.
      const historyRequest = fpl.history(entryId).catch(() => null);
      const scheduleRequest = fpl.allFixtures().catch(() => null);
      const leagueRequest = leagueSpot(entryId);

      // Speculate: the gameweek only depends on the entry when ?gw= is before the team's first gameweek, so
      // start picks + live as soon as bootstrap is in, instead of waiting for the entry as well (one round trip).
      const speculative = bootstrapRequest.then((bootstrap) => {
        const selection = selectGameweek(bootstrap.events, requestedGw, 1, now());
        return selection && { gw: selection.gw, data: loadGameweek(entryId, selection.gw, selection.status === "final") };
      });
      speculative.then((s) => s?.data.catch(() => {}), () => {}); // consumed below, or deliberately dropped

      const [entry, bootstrap] = await Promise.all([fpl.entry(entryId), bootstrapRequest]);
      if (!entry) return { kind: "not-found" };
      const team = { ...identityOf(entry, avatars, mascots), league: await leagueRequest };

      const latest = currentEvent(bootstrap.events);
      if (!latest) return { kind: "no-season", team };
      if (entry.started_event > latest.id) {
        return { kind: "not-started", team, startedEvent: entry.started_event, deadlineName: latest.name };
      }

      const selection = selectGameweek(bootstrap.events, requestedGw, entry.started_event, now())!;
      const guess = await speculative;
      const [picks, live, gwFixtures] = await (guess && guess.gw === selection.gw
        ? guess.data
        : loadGameweek(entryId, selection.gw, selection.status === "final"));

      const gameweek: TeamGameweek = {
        gw: selection.gw,
        name: selection.event.name,
        status: selection.status,
        min: entry.started_event,
        max: selection.latest.id,
        isLive: selection.status === "live" && selection.gw === selection.latest.id,
      };
      if (!picks) return { kind: "no-picks", team, gameweek };

      const sheet = buildTeamSheet(picks, bootstrap, live);
      const gwHistory = picks.entry_history;
      const { insights, next } = buildInsights({
        sheet,
        picks,
        bootstrap,
        gameweek,
        latest: selection.latest.id,
        history: await historyRequest,
        schedule: await scheduleRequest,
        gwFixtures,
      });
      return {
        kind: "ok",
        team,
        gameweek,
        chip: picks.active_chip,
        summary: {
          gwPoints: gameweekPoints(sheet, gwHistory, Boolean(live)),
          hit: gwHistory.event_transfers_cost,
          total: gwHistory.total_points,
          overallRank: gwHistory.overall_rank,
          transfers: gwHistory.event_transfers,
          value: gwHistory.value,
          bank: gwHistory.bank,
        },
        sheet,
        showPoints: Boolean(live),
        insights,
        next,
      };
    },
  };
}
