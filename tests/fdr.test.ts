import { describe, expect, it } from "vitest";
import { BLANK_DIFFICULTY, buildFdrMatrix, DEFAULT_FDR_WINDOW, defaultFdrStart, fdrBand, fdrHighlights, FDR_WINDOWS, parseFdrWindow } from "@/lib/domain";
import type { FplEvent, FplTeam, ScheduledFixture } from "@/lib/domain/types";
import { event } from "./fixtures";

const team = (id: number, short: string): FplTeam => ({ id, code: id * 10, name: `${short} FC`, short_name: short });
const teams = [team(1, "ARS"), team(2, "BHA"), team(3, "CHE"), team(4, "DUM")];
const events: FplEvent[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) =>
  event({ id, name: `Gameweek ${id}`, is_current: id === 4, finished: id < 4 }),
);

let nextId = 1;
const fx = (gw: number | null, h: number, a: number, hd: number, ad: number): ScheduledFixture => ({
  id: nextId++, event: gw, team_h: h, team_a: a, team_h_difficulty: hd, team_a_difficulty: ad,
  kickoff_time: null, started: false, finished: false, finished_provisional: false,
});

describe("window options", () => {
  it("offers 3, 5 and 10 and defaults to 5", () => {
    expect([...FDR_WINDOWS]).toEqual([3, 5, 10]);
    expect(DEFAULT_FDR_WINDOW).toBe(5);
  });
  it.each([["3", 3], ["5", 5], ["10", 10], ["7", 5], ["abc", 5], [undefined, 5], [["10", "3"], 10], ["", 5]])("parseFdrWindow(%j) = %j", (raw, expected) =>
    expect(parseFdrWindow(raw as string)).toBe(expected),
  );
});

describe("defaultFdrStart", () => {
  it("is the current gameweek while it is in progress", () => expect(defaultFdrStart(events)).toBe(4));
  it("moves to the next gameweek once the current one is finished", () => {
    const done = events.map((e) => (e.id === 4 ? { ...e, finished: true } : e));
    expect(defaultFdrStart(done)).toBe(5);
  });
  it("stays on the last gameweek if the final one is finished", () => {
    const last = [event({ id: 37, is_current: false, finished: true }), event({ id: 38, is_current: true, finished: true })];
    expect(defaultFdrStart(last)).toBe(38);
  });
  it("given the time, starts at the next deadline: a gameweek under way is locked, so planning starts after it", () => {
    // one deadline a week, GW1 on 1 August
    const weekly = events.map((e) => ({ ...e, deadline_time: new Date(Date.UTC(2026, 7, 1) + (e.id - 1) * 7 * 86_400_000).toISOString() }));
    const at = (id: number) => Date.parse(weekly.find((e) => e.id === id)!.deadline_time);
    // halfway between GW4's deadline and GW5's: GW4 is current and in progress, but GW5 is the next one you can change
    const during = new Date((at(4) + at(5)) / 2);
    expect(defaultFdrStart(events)).toBe(4);
    expect(defaultFdrStart(weekly, during)).toBe(5);
    // just before GW4's deadline, GW4 is still open
    expect(defaultFdrStart(weekly, new Date(at(4) - 60_000))).toBe(4);
    // no deadline left: the old rule (here, the current gameweek)
    expect(defaultFdrStart(weekly, new Date(at(12) + 60_000))).toBe(4);
  });

  it("falls back to the first unfinished gameweek, then the first, and handles no events", () => {
    expect(defaultFdrStart(events.map((e) => ({ ...e, is_current: false })))).toBe(4);
    expect(defaultFdrStart([event({ id: 1, is_current: false, finished: true })])).toBe(1);
    expect(defaultFdrStart([])).toBeNull();
  });
});

describe("fdrBand", () => {
  it.each([[1, 1], [5, 5], [2.4, 2], [2.6, 3], [0, 3], [6, 3], [NaN, 3]])("%j -> band %j", (d, band) => expect(fdrBand(d)).toBe(band));
});

describe("buildFdrMatrix", () => {
  const fixtures = [
    fx(4, 1, 2, 2, 4), // ARS (H) v BHA diff 2; BHA (A) v ARS diff 4
    fx(5, 3, 1, 3, 2), // CHE v ARS (A) diff 2
    fx(6, 2, 4, 3, 3),
    fx(4, 3, 4, 5, 1),
    fx(99, 1, 2, 5, 5), // outside the window
    fx(null, 1, 2, 5, 5), // unscheduled
  ];

  it("returns null for an unknown start gameweek", () => expect(buildFdrMatrix(events, teams, fixtures, 99, 5)).toBeNull());

  it("takes the requested number of gameweeks from the start, capped by the season's end", () => {
    expect(buildFdrMatrix(events, teams, fixtures, 4, 3)!.gameweeks).toEqual([4, 5, 6]);
    expect(buildFdrMatrix(events, teams, fixtures, 4, 10)!.gameweeks).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(buildFdrMatrix(events, teams, fixtures, 11, 5)!.gameweeks).toEqual([11, 12]);
  });

  it("builds home/away cells with the team's own difficulty, and leaves blanks empty", () => {
    const m = buildFdrMatrix(events, teams, fixtures, 4, 3)!;
    const ars = m.rows.find((r) => r.teamId === 1)!;
    expect(ars.cells[0].matches).toEqual([{ opponentId: 2, home: true, difficulty: 2 }]);
    expect(ars.cells[1].matches).toEqual([{ opponentId: 3, home: false, difficulty: 2 }]);
    expect(ars.cells[2].matches).toEqual([]); // blank
    expect(m.rows.find((r) => r.teamId === 2)!.cells[0].matches[0]).toEqual({ opponentId: 1, home: false, difficulty: 4 });
  });

  it("sorts easiest first, counting a blank as the hardest (5), ties by short name", () => {
    const m = buildFdrMatrix(events, teams, fixtures, 4, 3)!;
    const score = Object.fromEntries(m.rows.map((r) => [r.teamId, r.score]));
    expect(BLANK_DIFFICULTY).toBe(5);
    expect(score).toEqual({ 1: 2 + 2 + BLANK_DIFFICULTY, 2: 4 + BLANK_DIFFICULTY + 3, 3: 5 + 3 + BLANK_DIFFICULTY, 4: 1 + BLANK_DIFFICULTY + 3 });
    expect(m.rows.map((r) => r.teamId)).toEqual([1, 4, 2, 3]); // ARS 9, DUM 9 (tie: "ARS" < "DUM"), BHA 12, CHE 13
  });

  it("never lets a blank make a run look easier than playing", () => {
    // ARS: an easy 2 then a blank; BHA: two 3s. With a blank as a neutral 3, ARS would rank first (5 vs 6).
    const two = [fx(4, 1, 2, 2, 3), fx(4, 3, 4, 3, 3), fx(5, 2, 3, 3, 3), fx(5, 4, 3, 3, 3)];
    const m = buildFdrMatrix(events, teams, two, 4, 2)!;
    const ars = m.rows.find((r) => r.teamId === 1)!;
    expect(ars.average).toBe(3.5); // (2 + 5) / 2
    expect(m.rows[0].teamId).not.toBe(1);
  });

  it("leaves a gameweek nobody is scheduled in yet out of the average, rather than calling it a blank for all", () => {
    const early = [fx(4, 1, 2, 2, 4), fx(4, 3, 4, 3, 3)]; // only GW4 is scheduled; GW5 and GW6 are empty for everyone
    const m = buildFdrMatrix(events, teams, early, 4, 3)!;
    expect(Object.fromEntries(m.rows.map((r) => [r.teamId, r.average]))).toEqual({ 1: 2, 2: 4, 3: 3, 4: 3 });
  });

  it("breaks score ties alphabetically", () => {
    const m = buildFdrMatrix(events, teams, fixtures, 4, 3)!;
    const tied = m.rows.filter((r) => r.score === 9).map((r) => r.teamId);
    expect(tied).toEqual([1, 4]); // ARS before DUM
  });

  it("shows one figure per team, the one rows are ranked by: difficulty per gameweek, a blank counting as 5", () => {
    const m = buildFdrMatrix(events, teams, fixtures, 4, 3)!;
    expect(m.rows.map((r) => r.average)).toEqual(m.rows.map((r) => r.score / 3));
    expect(m.rows.map((r) => r.average)).toEqual([...m.rows.map((r) => r.average)].sort((a, b) => a - b)); // shown order is ascending
    expect(buildFdrMatrix(events, teams, [], 4, 3)!.rows.every((r) => r.average === 3)).toBe(true);
  });

  it("shows a double gameweek as two matches and ranks it by their average", () => {
    const double = [fx(4, 1, 2, 2, 4), fx(4, 3, 1, 3, 4)]; // ARS plays BHA (2) and CHE away (4)
    const m = buildFdrMatrix(events, teams, double, 4, 1)!;
    const ars = m.rows.find((r) => r.teamId === 1)!;
    expect(ars.cells[0].matches).toHaveLength(2);
    expect(ars.score).toBe(3); // mean(2, 4)
    expect(ars.average).toBe(3);
  });

  it("highlights score a blank as the hardest too, and skip gameweeks nobody is scheduled in", () => {
    // GW4: ARS blank, BHA v CHE; GW5: ARS v DUM easy (1); GW6, GW7: nobody scheduled yet
    const fx4 = [fx(4, 2, 3, 3, 3), fx(5, 1, 4, 1, 4)];
    const h = fdrHighlights(buildFdrMatrix(events, teams, fx4, 4, 4)!)!;
    // halves are GW4–5 and GW6–7; the second half has nothing scheduled, so no swing can be claimed
    expect(h.swing).toBeNull();
    const h2 = fdrHighlights(buildFdrMatrix(events, teams, fx4, 4, 2)!)!;
    // over GW4–5 ARS go from a blank (5) to a 1: the biggest easing
    expect(h2.swing).toMatchObject({ teamId: 1, before: 5, after: 1, from: 5 });
    expect(h2.blank).toEqual({ gw: 4, teams: [1, 4] });
  });

  it("does not mutate its inputs", () => {
    const before = JSON.stringify([teams, fixtures]);
    buildFdrMatrix(events, teams, fixtures, 4, 3);
    expect(JSON.stringify([teams, fixtures])).toBe(before);
  });
});
