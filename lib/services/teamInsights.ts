import type { Bootstrap, EntryHistory, EntryPicks, Fixture, ScheduledFixture, TeamSheet } from "../domain";
import {
  allPlayers, autoSubs, benchInsight, captainInsight, chipContribution, chipStatus, defconProgress, fixtureOutlook, freeTransfers,
  matchCounts, matchesByTeam, ownership, playersRemaining, rotationRisks, seasonCharts, seasonForm, squadFlags, teamStates, tenure, upsidePicks, buildLab, opponentsIn,
} from "../domain";
import type { NextMatch, SeasonInsights, TeamGameweek, TeamInsights } from "./models";

export interface InsightInput {
  sheet: TeamSheet;
  picks: EntryPicks;
  bootstrap: Bootstrap;
  gameweek: TeamGameweek;
  /** The latest gameweek id; forward-looking facts are only produced when the viewed gameweek is this one. */
  latest: number;
  /** null when it couldn't be loaded; the matching facts are then simply absent. */
  history: EntryHistory | null;
  schedule: ScheduledFixture[] | null;
  /** This gameweek's fixtures with live state. */
  gwFixtures: Fixture[] | null;
}

/**
 * One section's facts, or `fallback` if FPL sent something the section can't make sense of. A broken section is left
 * out rather than taking the whole team page down with it.
 */
function safe<T>(build: () => T, fallback: T): T {
  try {
    return build();
  } catch {
    return fallback;
  }
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v.filter((x) => x != null) : []);

/** The manager's history with any row FPL sent without a gameweek or points dropped, so no chart plots NaN. */
function cleanHistory(history: EntryHistory): EntryHistory {
  return {
    ...history,
    current: list(history.current)
      .filter((r) => num(r.event) && num(r.points) && num(r.total_points))
      .map((r) => ({
        ...r,
        rank: num(r.rank) && r.rank > 0 ? r.rank : null,
        overall_rank: num(r.overall_rank) && r.overall_rank > 0 ? r.overall_rank : null,
        bank: num(r.bank) ? r.bank : 0,
        value: num(r.value) ? r.value : 0,
        event_transfers: num(r.event_transfers) ? r.event_transfers : 0,
        event_transfers_cost: num(r.event_transfers_cost) ? r.event_transfers_cost : 0,
        points_on_bench: num(r.points_on_bench) ? r.points_on_bench : 0,
      })),
    past: list(history.past),
    chips: list(history.chips).filter((c) => typeof c.name === "string" && num(c.event)),
  };
}

function seasonInsights({ history: raw, bootstrap, latest }: Pick<InsightInput, "history" | "bootstrap" | "latest">): SeasonInsights | null {
  if (!raw) return null;
  const history = cleanHistory(raw);
  // A gameweek in progress has partial points, so statistics run through the last finished one.
  const current = bootstrap.events.find((e) => e.id === latest);
  const settledThrough = current?.finished ? latest : latest - 1;
  return {
    form: seasonForm(history.current, settledThrough),
    charts: seasonCharts(history.current, bootstrap.events, settledThrough, history.chips),
    seasonEnd: bootstrap.events[bootstrap.events.length - 1]?.id ?? latest,
    tenure: tenure(history.past),
    freeTransfers: freeTransfers(history.current, history.chips),
    chips: chipStatus(bootstrap.chips ?? [], history.chips, latest + 1),
  };
}

/** Turn the squad, live data and the manager's season into the facts the page shows. */
export function buildInsights(input: InsightInput): { insights: TeamInsights; next: Record<number, NextMatch[]> } {
  const { sheet, picks, bootstrap, gameweek, latest, schedule, gwFixtures } = input;
  const isLatest = gameweek.gw === latest;
  const states = gwFixtures ? safe(() => teamStates(gwFixtures, gameweek.gw), null) : null;
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));

  // Next opponents and the outlook only make sense from "now", so not for a past gameweek.
  const upcoming = isLatest && schedule ? safe(() => matchesByTeam(schedule, latest + 1), null) : null;
  const next: Record<number, NextMatch[]> = {};
  if (upcoming) {
    for (const p of allPlayers(sheet)) {
      const matches = p.teamId == null ? undefined : upcoming.get(p.teamId);
      if (matches?.length) next[p.id] = matches.map((m) => ({ opponent: clubs.get(m.opponentId) ?? "?", home: m.home, difficulty: m.difficulty }));
    }
  }

  return {
    next,
    insights: {
      gameweek: {
        captain: safe(() => captainInsight(sheet, states, gameweek.status === "live"), null),
        bench: safe(() => benchInsight(sheet, picks.active_chip), null),
        chip: safe(() => chipContribution(sheet, picks.active_chip), null),
        autoSubs: safe(() => autoSubs(sheet, list(picks.automatic_subs)), []),
        // Availability and ownership are "as of now": not shown against a past gameweek.
        rotation: isLatest && states ? safe(() => rotationRisks(sheet, states, list(picks.automatic_subs).map((s) => s.element_out)), []) : [],
        remaining: states && gameweek.status === "live" ? safe(() => playersRemaining(sheet, states), null) : null,
        defcon: safe(() => defconProgress(sheet, gwFixtures ? matchCounts(gwFixtures, gameweek.gw) : null), []),
        flags: isLatest ? safe(() => squadFlags(sheet), []) : [],
      },
      squad: {
        upside: isLatest ? safe(() => upsidePicks(bootstrap), null) : null,
        lab:
          isLatest && schedule
            ? safe(() => buildLab(bootstrap, schedule, opponentsIn(schedule, bootstrap.teams, latest + 1), latest + 1, latest, allPlayers(sheet).map((p) => p.id)), null)
            : null,
        ownership: isLatest ? safe(() => ownership(sheet), null) : null,
        outlook: isLatest && schedule ? safe(() => fixtureOutlook(sheet, schedule, latest + 1, 3), null) : null,
      },
      season: safe(() => seasonInsights(input), null),
    },
  };
}
