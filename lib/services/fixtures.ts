import { buildFdrMatrix, defaultFdrStart, fdrBand, FDR_WINDOWS, parseFdrWindow, parseGw } from "../domain";
import type { FixturesModel } from "./models";
import type { FplPort } from "./ports";

/** Use case: every club's next fixtures with difficulty, easiest run first. */
export function createFixturesService(fpl: Pick<FplPort, "bootstrap" | "allFixtures">) {
  return {
    /** `gw` is the first gameweek shown (default: the current one); `window` is how many to show (3, 5 or 10). */
    async load(gw: string | string[] | undefined, window: string | string[] | undefined): Promise<FixturesModel> {
      const [bootstrap, schedule] = await Promise.all([fpl.bootstrap(), fpl.allFixtures()]);
      const { events, teams } = bootstrap;
      const fallback = defaultFdrStart(events);
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
                opponent: byId.get(m.opponentId)?.short_name ?? "?",
                home: m.home,
                difficulty: m.difficulty,
                band: fdrBand(m.difficulty),
              })),
            ),
          };
        }),
      };
    },
  };
}
