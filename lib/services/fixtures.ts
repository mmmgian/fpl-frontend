import type { FdrMatrix, FplEvent, FplTeam, ScheduledFixture } from "../domain";
import {
  buildFdrMatrix, buildFixtureFeed, currentEvent, DEFAULT_FDR_WINDOW, defaultFdrStart, fdrBand, fdrHighlights, FDR_WINDOWS, feedStartIndex, gwStatus, nextDeadline, parseFdrWindow, parseGw, varietyKey,
} from "../domain";
import type { FdrHighlightsView, FixtureFeedModel, FixturesModel, NextDeadlineView } from "./models";
import type { FplPort, ServiceOptions } from "./ports";

/** How far ahead the feed's intro looks for runs and swings: the grid's default "Next 5", from the same deadline. */
export const FEED_OUTLOOK = DEFAULT_FDR_WINDOW;

function highlightsView(matrix: FdrMatrix, teams: FplTeam[]): FdrHighlightsView | null {
  const h = fdrHighlights(matrix);
  if (!h) return null;
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? "Unknown club";
  return {
    from: matrix.gameweeks[0],
    to: matrix.gameweeks[matrix.gameweeks.length - 1],
    easiest: { team: name(h.easiest.teamId), average: h.easiest.average },
    toughest: { team: name(h.toughest.teamId), average: h.toughest.average },
    swing: h.swing ? { ...h.swing, team: name(h.swing.teamId) } : null,
    double: h.double ? { gw: h.double.gw, teams: h.double.teams.map(name) } : null,
    blank: h.blank ? { gw: h.blank.gw, teams: h.blank.teams.map(name) } : null,
  };
}

function deadlineView(events: FplEvent[], schedule: ScheduledFixture[], now: Date): NextDeadlineView | null {
  const next = nextDeadline(events, now);
  if (!next) return null;
  return { gw: next.gw, hours: Math.floor((Date.parse(next.at) - now.getTime()) / 3_600_000), matches: schedule.filter((f) => f.event === next.gw).length };
}

/** New wording every day and whenever the current gameweek moves on (live, provisional, final). */
function variety(events: FplEvent[], now: Date): number {
  const current = currentEvent(events);
  return current ? varietyKey(current.id, gwStatus(current, now), now) : varietyKey(0, "upcoming", now);
}

/** Use case: every club's next fixtures with difficulty, easiest run first. */
export function createFixturesService(fpl: Pick<FplPort, "bootstrap" | "allFixtures">, { now = () => new Date() }: Pick<ServiceOptions, "now"> = {}) {
  return {
    /** Every fixture of the season, opening on `gw` (default: the current or next gameweek). */
    async feed(gw: string | string[] | undefined): Promise<FixtureFeedModel> {
      const [bootstrap, schedule] = await Promise.all([fpl.bootstrap(), fpl.allFixtures()]);
      const { events, teams } = bootstrap;
      if (events.length === 0) return { kind: "no-season" };

      const gameweeks = buildFixtureFeed(events, teams, schedule);
      const last = events[events.length - 1].id;
      const at = now();
      const next = deadlineView(events, schedule, at);
      const ahead = next ? buildFdrMatrix(events, teams, schedule, next.gw, FEED_OUTLOOK) : null;
      return {
        kind: "ok",
        startIndex: feedStartIndex(gameweeks, parseGw(gw, 1, last)),
        gameweeks,
        teams: Object.fromEntries(teams.map((t) => [t.id, { id: t.id, name: t.name, short: t.short_name || t.name, code: t.code }])),
        windows: FDR_WINDOWS,
        highlights: ahead ? highlightsView(ahead, teams) : null,
        next,
        variety: variety(events, at),
      };
    },

    /** `gw` is the first gameweek shown (default: the current one); `window` is how many to show (3, 5 or 10). */
    async load(gw: string | string[] | undefined, window: string | string[] | undefined): Promise<FixturesModel> {
      const [bootstrap, schedule] = await Promise.all([fpl.bootstrap(), fpl.allFixtures()]);
      const { events, teams } = bootstrap;
      const at = now();
      const fallback = defaultFdrStart(events, at);
      if (fallback == null) return { kind: "no-season" };

      const last = events[events.length - 1].id;
      const start = parseGw(gw, 1, last) ?? fallback;
      const size = parseFdrWindow(window);
      const matrix = buildFdrMatrix(events, teams, schedule, start, size);
      if (!matrix) return { kind: "no-season" };

      const byId = new Map(teams.map((t) => [t.id, t]));
      const deadline = new Map(events.map((e) => [e.id, e.deadline_time]));
      return {
        kind: "ok",
        start,
        window: size,
        windows: FDR_WINDOWS,
        min: 1,
        max: last,
        columns: matrix.gameweeks.map((n) => ({ gw: n, deadline: deadline.get(n) ?? null })),
        rows: matrix.rows.map((row, i) => {
          const team = byId.get(row.teamId)!;
          return {
            team: { id: team.id, name: team.name, short: team.short_name || team.name, code: team.code },
            rank: i + 1,
            average: row.average,
            cells: row.cells.map((cell) =>
              cell.matches.map((m) => ({
                opponentId: m.opponentId,
                opponentName: byId.get(m.opponentId)?.name ?? "Unknown club",
                opponent: byId.get(m.opponentId)?.short_name ?? "?",
                home: m.home,
                difficulty: m.difficulty,
                band: fdrBand(m.difficulty),
              })),
            ),
          };
        }),
        highlights: highlightsView(matrix, teams),
        next: deadlineView(events, schedule, at),
        variety: variety(events, at),
      };
    },
  };
}
