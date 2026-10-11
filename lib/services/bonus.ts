import type { Fixture, FplElement, FplTeam } from "../domain";
import { bpsRanking, compareByKickoff, fixtureState, isFinished, matchBonus, matchEvents, selectGameweek, sideLeaders } from "../domain";
import type { BonusLine, BonusModel, EventLine, FixtureCard } from "./models";
import type { FplPort, ServiceOptions } from "./ports";

/** Early in a match many players tie on BPS (and all take the same bonus); show this many per side. */
export const MAX_LINES_PER_SIDE = 5;

/** Resolve ids to names and decide every fallback, so the card view only prints. */
function toFixtureCard(f: Fixture, teams: Map<number, FplTeam>, players: Map<number, FplElement>): FixtureCard {
  const home = teams.get(f.team_h);
  const away = teams.get(f.team_a);
  const top = bpsRanking(f)[0]?.bps ?? 0;
  const bonus = matchBonus(f);
  const player = (element: number) => players.get(element)?.web_name ?? `Player ${element}`;

  const side = (which: "h" | "a", club: FplTeam | undefined): { lines: BonusLine[]; hidden: number } => {
    const leaders = sideLeaders(f, which, 3, bonus.rows);
    return {
      lines: leaders.slice(0, MAX_LINES_PER_SIDE).map((e) => ({
        key: `${which}-${e.element}`,
        bonus: e.bonus,
        player: player(e.element),
        club: club?.short_name,
        bps: e.bps,
        share: top > 0 ? Math.min(100, Math.max(0, Math.round((e.bps / top) * 100))) : 0, // BPS can be negative
      })),
      hidden: Math.max(0, leaders.length - MAX_LINES_PER_SIDE),
    };
  };
  const homeSide = side("h", home);
  const awaySide = side("a", away);
  const lines = (events: { element: number; count: number }[]): EventLine[] => events.map((e) => ({ player: player(e.element), count: e.count }));
  const events = matchEvents(f);

  return {
    id: f.id,
    state: fixtureState(f),
    minutes: f.minutes,
    home: { id: home?.id ?? null, name: home?.name ?? "Home", short: home?.short_name ?? "HOM", code: home?.code },
    away: { id: away?.id ?? null, name: away?.name ?? "Away", short: away?.short_name ?? "AWY", code: away?.code },
    score: f.team_h_score != null && f.team_a_score != null ? { home: f.team_h_score, away: f.team_a_score } : null,
    kickoff: f.kickoff_time,
    bonus: {
      source: bonus.source,
      home: homeSide.lines,
      away: awaySide.lines,
      hidden: { home: homeSide.hidden, away: awaySide.hidden },
    },
    events: { goals: lines(events.goals), assists: lines(events.assists), redCards: lines(events.redCards) },
  };
}

/** Use case: every fixture of a gameweek with its (confirmed, provisional or projected) bonus points. */
export function createBonusService(fpl: Pick<FplPort, "bootstrap" | "fixtures">, { now = () => new Date() }: ServiceOptions = {}) {
  return {
    async load(requestedGw: string | string[] | undefined): Promise<BonusModel> {
      const bootstrap = await fpl.bootstrap();
      const selection = selectGameweek(bootstrap.events, requestedGw, 1, now());
      if (!selection) return { kind: "no-season" };

      const fixtures = [...(await fpl.fixtures(selection.gw, selection.status === "final"))].sort(compareByKickoff);
      const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
      const players = new Map(bootstrap.elements.map((p) => [p.id, p]));

      const states = fixtures.map(fixtureState);
      return {
        kind: "ok",
        gameweek: { gw: selection.gw, name: selection.event.name, status: selection.status, min: 1, max: selection.latest.id },
        fixtures: fixtures.map((f) => toFixtureCard(f, teams, players)),
        finished: fixtures.filter(isFinished).length,
        anyLive: states.includes("live"),
        counts: {
          live: states.filter((s) => s === "live").length,
          finished: states.filter((s) => s === "final" || s === "provisional").length,
          upcoming: states.filter((s) => s === "upcoming").length,
        },
      };
    },
  };
}
