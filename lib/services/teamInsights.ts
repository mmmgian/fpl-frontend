import type { Bootstrap, EntryHistory, EntryPicks, Fixture, ScheduledFixture, TeamSheet } from "../domain";
import {
  allPlayers, autoSubs, benchInsight, captainInsight, chipContribution, chipStatus, defconProgress, fixtureOutlook, freeTransfers,
  matchCounts, matchesByTeam, ownership, playersRemaining, rotationRisks, seasonCharts, seasonForm, squadFlags, teamStates, tenure,
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

function seasonInsights({ history, bootstrap, latest }: Pick<InsightInput, "history" | "bootstrap" | "latest">): SeasonInsights | null {
  if (!history) return null;
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
  const states = gwFixtures ? teamStates(gwFixtures, gameweek.gw) : null;
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));

  // Next opponents and the outlook only make sense from "now", so not for a past gameweek.
  const upcoming = isLatest && schedule ? matchesByTeam(schedule, latest + 1) : null;
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
        captain: captainInsight(sheet, states, gameweek.status === "live"),
        bench: benchInsight(sheet, picks.active_chip),
        chip: chipContribution(sheet, picks.active_chip),
        autoSubs: autoSubs(sheet, picks.automatic_subs),
        // Availability and ownership are "as of now": not shown against a past gameweek.
        rotation: isLatest && states ? rotationRisks(sheet, states) : [],
        remaining: states && gameweek.status === "live" ? playersRemaining(sheet, states) : null,
        defcon: defconProgress(sheet, gwFixtures ? matchCounts(gwFixtures, gameweek.gw) : null),
        flags: isLatest ? squadFlags(sheet) : [],
      },
      squad: {
        ownership: isLatest ? ownership(sheet) : null,
        outlook: isLatest && schedule ? fixtureOutlook(sheet, schedule, latest + 1, 3) : null,
      },
      season: seasonInsights(input),
    },
  };
}
