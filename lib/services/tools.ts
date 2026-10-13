import type { Pick as FplPick, PositionId, StandingRow } from "../domain";
import { bestXI, buildLab, upsidePicks, currentEvent, effectiveOwnership, eoTiers, filterPrices, gwPhase, matchPulse, nextDeadline, opponentsIn, priceRows, transferPulse } from "../domain";
import type { Bootstrap, FplEvent } from "../domain/types";
import { MAX_STATS_MANAGERS } from "../domain";
import { attempt, buildPlanning, clip, saneBootstrap, sanePicks, saneSchedule, saneStandings } from "../domain/planning";
import { LAB_TRIALS } from "../domain/lab";
import { parseVs } from "../domain/leagueTools";
import { withAvatars } from "./avatars";
import type { ToolsDeferred, ToolsEoRow, ToolsKept, ToolsModel, ToolsTeam } from "./models";
import type { FplPort, ServiceOptions } from "./ports";
import { LEAGUE_TOOLS_CAP, startLeagueTools, type LeagueToolsRun } from "./leagueTools";
import { withinDeadline } from "./shared";

/** The most price rows the page lists at once: the filters narrow the rest. */
export const PRICE_ROWS = 40;
/** The most effective-ownership rows shown. */
export const EO_ROWS = 15;

/** What the page's links and forms ask for, as the raw query values. Anything unusable falls back to a default. */
export interface ToolsQuery {
  q?: string | string[];
  pos?: string | string[];
  team?: string | string[];
  moving?: string | string[];
  eo?: string | string[];
  by?: string | string[];
  /** Head to head: two managers' entry ids, `A,B` (see parseVs). */
  vs?: string | string[];
}

/** The Tools page in two parts, so it can paint before the league fan-out is in (see `loadStreaming`). */
export interface ToolsStream {
  /** Everything but the league-dependent parts: `eo` and `leagueTools` are null here. */
  model: ToolsModel;
  /** The league-dependent parts. Never rejects; settles by the page's deadline for extras. */
  deferred: Promise<ToolsDeferred>;
  /** The query's league-dependent choices, for the links and forms painted before `deferred` settles. */
  kept: ToolsKept;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The first upcoming event: FPL's "next", or failing that the earliest deadline ahead. */
function upcoming(events: FplEvent[], now: Date): FplEvent | null {
  const d = nextDeadline(events, now);
  return events.find((e) => e.is_next) ?? (d ? (events.find((e) => e.id === d.gw) ?? null) : null);
}

/** Use case: the Tools page. Every tool is optional: one that can't be worked out is simply absent. */
export function createToolsService(
  fpl: Pick<FplPort, "bootstrap" | "standings" | "allFixtures" | "picks" | "history">,
  { now = () => new Date(), avatars, replaceBadges }: ServiceOptions = {},
) {
  const eoRows = (bootstrap: Bootstrap, picks: FplPick[][]): ToolsEoRow[] => {
    const players = new Map(bootstrap.elements.map((e) => [e.id, e]));
    const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
    return effectiveOwnership(picks).flatMap((r) => {
      const e = players.get(r.id);
      if (!e) return [];
      const club = clubs.get(e.team);
      return [{ id: r.id, name: e.web_name, club: club?.short_name ?? "—", clubCode: club?.code ?? null, eo: r.eo, started: r.started, captained: r.captained, owned: Number(e.selected_by_percent) || 0 }];
    });
  };

  /** Effective ownership across the league: the current gameweek's picks, for the top of the table or everyone. */
  const ownership = async (bootstrap: Bootstrap, rows: StandingRow[], query: ToolsQuery, picksOf: LeagueToolsRun["picksOf"]): Promise<ToolsModel["eo"]> => {
    const event = currentEvent(bootstrap.events);
    if (!event || rows.length === 0 || rows.length > MAX_STATS_MANAGERS) return null;
    const tiers = eoTiers(rows.length);
    const asked = one(query.eo);
    const tier = tiers.find((t) => t.key === asked) ?? tiers[0];
    const group = tier.size ? rows.slice(0, tier.size) : rows;
    const got = new Map<number, FplPick[]>();
    await withinDeadline(
      Promise.allSettled(
        group.map(async (r) => {
          const p = await picksOf(r.entry); // shared with the league tools: one request per manager
          const picks = sanePicks(p);
          if (picks) got.set(r.entry, picks);
        }),
      ),
    );
    const lists = group.flatMap((r) => (got.has(r.entry) ? [got.get(r.entry)!] : []));
    if (lists.length === 0) return null;
    const by = one(query.by) === "captain" ? "captain" : "eo";
    const all = eoRows(bootstrap, [...lists]);
    const sorted = by === "captain" ? [...all].sort((a, b) => b.captained - a.captained || b.eo - a.eo || a.id - b.id).filter((r) => r.captained > 0) : all;
    return { gw: event.id, managers: lists.length, tier: tier.key, tiers, by, rows: sorted.slice(0, EO_ROWS) };
  };

  /**
   * The query's league-dependent choices (EO group, captain order, head to head), validated against what is known before
   * the league's squads arrive, so the page's links and forms keep them while those parts are still on their way.
   */
  const keptFrom = (bootstrap: Bootstrap, rows: StandingRow[], query: ToolsQuery): ToolsKept => {
    const eligible = Boolean(currentEvent(bootstrap.events)) && rows.length > 0 && rows.length <= MAX_STATS_MANAGERS;
    const tiers = eligible ? eoTiers(rows.length) : [];
    const tier = eligible ? (tiers.find((t) => t.key === one(query.eo)) ?? tiers[0]) : null;
    const covered = new Set(rows.slice(0, LEAGUE_TOOLS_CAP).map((r) => r.entry));
    const pair = parseVs(query.vs);
    return {
      eo: tier?.key ?? null,
      by: tier && one(query.by) === "captain" ? "captain" : null,
      vs: pair && pair.every((e) => covered.has(e)) ? pair.join(",") : null,
    };
  };

  /**
   * The page in two parts: everything that needs only FPL's bootstrap, schedule and the standings (`model`, with `eo` and
   * `leagueTools` left null), and the league fan-out that reads every covered manager's squad and history (`deferred`).
   * The fan-out starts before the cheap work is awaited, so the two overlap. `deferred` never rejects: a part that can't
   * be worked out is null, and it settles by the page's deadline for extras however slow FPL is.
   */
  async function loadStreaming(leagueId: number, query: ToolsQuery = {}): Promise<ToolsStream> {
    const at = now();
    const bootstrapRequest = fpl.bootstrap();
    bootstrapRequest.catch(() => {}); // awaited below
    const scheduleRequest = fpl.allFixtures().catch(() => null);
    const standings = await fpl.standings(leagueId).catch(() => null);
    // Malformed responses are tidied before anything reads them: one odd field must not take the page down.
    const bootstrap = saneBootstrap(await bootstrapRequest);

    const rows: StandingRow[] = withAvatars(saneStandings(standings), avatars, { replaceBadges });
    const teams: ToolsTeam[] = rows.map((r) => ({ entry: r.entry, teamName: r.entry_name, manager: r.player_name, avatar: r.club_badge_src ?? null, rank: r.rank, total: r.total }));

    // Team of the week: the next gameweek's best eleven by FPL's own expected points.
    const next = upcoming(bootstrap.events, at);
    // The league fan-out (EO, chips, injuries, template, head to head): started now so its wait overlaps everything else.
    // Each manager's picks are asked for once (league.picksOf), however many tools read them.
    const league = startLeagueTools(fpl, { bootstrap, rows, nextGw: next?.id ?? null, vs: query.vs });
    const eoPart = ownership(bootstrap, rows, query, league.picksOf).catch(() => null);
    const deferred: Promise<ToolsDeferred> = Promise.all([eoPart, league.ready.catch(() => null)])
      .then(([eo, leagueTools]) => ({ eo, leagueTools }))
      .catch(() => ({ eo: null, leagueTools: null }));
    const schedule = saneSchedule(await scheduleRequest);
    const best = next ? attempt(() => bestXI(bootstrap, opponentsIn(schedule ?? [], bootstrap.teams, next.id))) : null;

    // Price pressure: filtered server-side, so it works without scripts.
    const position = Number(one(query.pos));
    const team = Number(one(query.team));
    const filter = {
      q: clip(one(query.q) ?? "", 40),
      position: ([1, 2, 3, 4] as number[]).includes(position) ? (position as PositionId) : null,
      team: bootstrap.teams.some((t) => t.id === team) ? team : null,
      movingOnly: one(query.moving) === "1",
    };
    const allPrices = priceRows(bootstrap);
    const matching = filterPrices(allPrices, filter);

    // Seeded by the gameweek, not the day: the simulated figures stay put all week and only the words around them change.
    const lab = next && schedule ? attempt(() => buildLab(bootstrap, schedule, opponentsIn(schedule, bootstrap.teams, next.id), next.id, Math.max(1, next.id - 1))) : null;
    // The captain shortlist reuses the lab's simulation rather than running a second one.
    const planning = attempt(() => buildPlanning(bootstrap, schedule, next?.id ?? null, lab ? { lab: lab.captain, trials: LAB_TRIALS } : null));

    const phase = gwPhase(bootstrap.events, at);
    // FPL calls the week live from its deadline to sign-off, quiet days included; the schedule says whether a ball is
    // actually being kicked, so the brief can say "paused until Saturday" rather than "on now".
    const pulse = phase.phase === "live" && phase.gw !== null && schedule ? matchPulse(schedule.map((f) => ({ ...f, finished: f.finished || f.finished_provisional })), phase.gw, at) : null;
    const model: ToolsModel = {
      kind: "ok",
      now: at.toISOString(),
      deadline: nextDeadline(bootstrap.events, at),
      xi: best && next ? { gw: next.id, best } : null,
      prices: {
        rows: matching.slice(0, PRICE_ROWS),
        matching: matching.length,
        clubs: bootstrap.teams.map((t) => ({ id: t.id, short: t.short_name })).sort((a, b) => a.short.localeCompare(b.short)),
        filter,
      },
      eo: null,
      leagueTools: null,
      teams,
      upside: attempt(() => upsidePicks(bootstrap, 8)),
      lab,
      planning,
      phase,
      matches: pulse && pulse.state !== "none" ? { state: pulse.state, nextKickoff: pulse.nextKickoff } : null,
      pulse: transferPulse(bootstrap, allPrices),
    };
    return { model, deferred, kept: keptFrom(bootstrap, rows, query) };
  }

  return {
    loadStreaming,
    /** The whole page at once: the cheap part and the league fan-out, merged. */
    async load(leagueId: number, query: ToolsQuery = {}): Promise<ToolsModel> {
      const { model, deferred } = await loadStreaming(leagueId, query);
      return { ...model, ...(await deferred) };
    },
  };
}
