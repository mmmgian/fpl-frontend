import type { Entry, ScheduledFixture } from "../domain";
import { buildTeamSheet, entryOfSlug, entrySlugs, currentEvent, gameweekPoints, nextDeadline, refreshPlan, seasonOver, selectGameweek, varietyKey } from "../domain";
import type { LeagueSpot, TeamGameweek, TeamIdentity, TeamModel } from "./models";
import type { AvatarPort, FplPort, MascotPort, ServiceOptions } from "./ports";
import { ifAlreadyIn, pulseOf } from "./shared";
import { buildInsights } from "./teamInsights";

/** FPL sometimes leaves a name out or blank; never let that read as "undefined" or "null". */
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const identityOf = (entry: Entry, avatars?: AvatarPort, mascots?: MascotPort): TeamIdentity => ({
  entryId: entry.id,
  teamName: text(entry.name) || `#${entry.id}`,
  firstName: text(entry.player_first_name),
  lastName: text(entry.player_last_name),
  manager: [text(entry.player_first_name), text(entry.player_last_name)].filter(Boolean).join(" "),
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

  /** The league's table with a readable address for each team; null if the league is unknown or unavailable (the pages work without it). */
  const leagueTable = async () => {
    if (!leagueId) return null;
    try {
      const rows = [...((await fpl.standings(leagueId()))?.standings.results ?? [])].sort((a, b) => a.rank - b.rank);
      return { rows, slugs: entrySlugs(rows.map((r) => ({ id: r.entry, name: r.entry_name }))) };
    } catch {
      return null;
    }
  };

  /** The team's place in the league table, with the managers just above and just below it. */
  const leagueSpot = (table: Awaited<ReturnType<typeof leagueTable>>, entryId: number): LeagueSpot | null => {
    if (!table) return null;
    const { rows, slugs } = table;
    const i = rows.findIndex((r) => r.entry === entryId);
    if (i < 0) return null;
    const at = (r: (typeof rows)[number] | undefined) =>
      r ? { entryId: r.entry, slug: slugs.get(r.entry) ?? String(r.entry), teamName: r.entry_name, rank: r.rank, points: r.total } : null;
    const me = rows[i];
    return { rank: me.rank, size: rows.length, points: me.total, leader: at(rows[0])!, moved: me.last_rank > 0 ? me.last_rank - me.rank : 0, prev: at(rows[i - 1]), next: at(rows[i + 1]) };
  };

  return {
    /**
     * What an address means: a team number ("2379133") or a team's name as written in the address ("gaucho-f-c").
     * `slug` is the team's readable address if there is one, so an address with a number can be sent on to it.
     * Null if nothing in the league has that name and it isn't a number.
     * Throws if a name can't be looked up because the league table is unavailable (FPL updating between gameweeks):
     * that is an outage to retry, not a page that doesn't exist.
     */
    async resolve(param: string): Promise<{ entryId: number; slug: string | null } | null> {
      const table = await leagueTable();
      if (/^[1-9]\d{0,9}$/.test(param)) return { entryId: Number(param), slug: table?.slugs.get(Number(param)) ?? null };
      if (!table && leagueId) throw new Error("The league table is unavailable, so the team's name can't be looked up");
      const id = table ? entryOfSlug(table.slugs, param) : null;
      // The canonical address, so "/team/Gaucho-F-C" is sent on to "/team/gaucho-f-c".
      return id === null ? null : { entryId: id, slug: table!.slugs.get(id) ?? param };
    },

    /** Who the team is, or null if it doesn't exist or FPL can't be reached (used for page titles). */
    async identify(entryId: number): Promise<TeamIdentity | null> {
      return fpl
        .entry(entryId)
        .then((entry) => (entry ? identityOf(entry, avatars, mascots) : null))
        .catch(() => null);
    },

    /** Every team in the league, in table order, with its address: for picking a team when a link leads nowhere. Null if unavailable. */
    async directory(): Promise<{ slug: string; teamName: string; manager: string }[] | null> {
      const table = await leagueTable();
      if (!table || table.rows.length === 0) return null;
      return table.rows.map((r) => ({ slug: table.slugs.get(r.entry) ?? String(r.entry), teamName: text(r.entry_name) || `#${r.entry}`, manager: text(r.player_name) }));
    },

    async load(entryId: number, requestedGw: string | string[] | undefined): Promise<TeamModel> {
      const bootstrapRequest = fpl.bootstrap();
      // Season facts and the schedule don't depend on anything else, so start them now. Both are optional.
      const historyRequest = fpl.history(entryId).catch(() => null);
      const scheduleRequest = fpl.allFixtures().catch(() => null);
      const leagueRequest = leagueTable();

      // Speculate: the gameweek only depends on the entry when ?gw= is before the team's first gameweek, so
      // start picks + live as soon as bootstrap is in, instead of waiting for the entry as well (one round trip).
      const speculative = bootstrapRequest.then((bootstrap) => {
        const selection = selectGameweek(bootstrap.events, requestedGw, 1, now());
        return selection && { gw: selection.gw, data: loadGameweek(entryId, selection.gw, selection.status === "final") };
      });
      speculative.then((s) => s?.data.catch(() => {}), () => {}); // consumed below, or deliberately dropped

      const [entry, bootstrap] = await Promise.all([fpl.entry(entryId), bootstrapRequest]);
      if (!entry) return { kind: "not-found" };
      const table = await leagueRequest;
      const team = { ...identityOf(entry, avatars, mascots), league: leagueSpot(table, entryId), slug: table?.slugs.get(entryId) ?? null };

      const latest = currentEvent(bootstrap.events);
      if (!latest) return { kind: "no-season", team };
      // A missing or junk first gameweek means "from the start of the season".
      const started = Number.isInteger(entry.started_event) && entry.started_event >= 1 ? entry.started_event : 1;
      if (started > latest.id) {
        return { kind: "not-started", team, startedEvent: started, deadlineName: latest.name };
      }

      const selection = selectGameweek(bootstrap.events, requestedGw, started, now())!;
      const guess = await speculative;
      const [picks, live, gwFixtures] = await (guess && guess.gw === selection.gw
        ? guess.data
        : loadGameweek(entryId, selection.gw, selection.status === "final"));

      const gameweek: TeamGameweek = {
        gw: selection.gw,
        name: selection.event.name,
        status: selection.status,
        min: started,
        max: selection.latest.id,
        isLive: selection.status === "live" && selection.gw === selection.latest.id,
        variety: varietyKey(selection.gw, selection.status, now()),
      };
      /**
       * What only the latest gameweek has: how often the page refreshes (from whether a match is on, when the schedule
       * is known), the next deadline once the week has been played, and whether that was the season's last.
       */
      const timed = (schedule: ScheduledFixture[] | null): TeamGameweek => {
        if (selection.gw !== selection.latest.id) return { ...gameweek, refreshMs: null, pulse: null, nextDeadline: null, seasonOver: false };
        const at = now();
        const pulse = selection.status === "live" ? pulseOf(schedule, selection.gw, at) : null;
        const next = nextDeadline(bootstrap.events, at);
        return {
          ...gameweek,
          refreshMs: refreshPlan(selection.status, pulse, at),
          pulse,
          nextDeadline: next && selection.status !== "live" ? { gw: next.gw, at: next.at } : null,
          seasonOver: seasonOver(selection.status, next, bootstrap.events),
        };
      };
      // Picks without a squad list are as good as none. The schedule is only used here if it is already in.
      if (!picks || !Array.isArray(picks.picks)) return { kind: "no-picks", team, gameweek: timed(await ifAlreadyIn(scheduleRequest)) };

      const sheet = buildTeamSheet(picks, bootstrap, live);
      const raw = picks.entry_history ?? ({} as Partial<typeof picks.entry_history>);
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      const gwHistory = {
        ...raw,
        points: n(raw.points),
        event_transfers_cost: n(raw.event_transfers_cost),
        total_points: n(raw.total_points),
        event_transfers: n(raw.event_transfers),
        value: n(raw.value),
        bank: n(raw.bank),
        overall_rank: typeof raw.overall_rank === "number" && raw.overall_rank > 0 ? raw.overall_rank : null,
      } as typeof picks.entry_history;
      const schedule = await scheduleRequest;
      const { insights, next } = buildInsights({
        sheet,
        picks,
        bootstrap,
        gameweek,
        latest: selection.latest.id,
        history: await historyRequest,
        schedule,
        gwFixtures,
      });
      return {
        kind: "ok",
        team,
        gameweek: timed(schedule),
        chip: picks.active_chip,
        summary: {
          gwPoints: gameweekPoints(sheet, gwHistory, Boolean(live)),
          hit: gwHistory.event_transfers_cost,
          total: gwHistory.total_points,
          overallRank: gwHistory.overall_rank,
          fieldSize: bootstrap.total_players ?? null,
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
