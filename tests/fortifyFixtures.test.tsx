/**
 * Fortify: the Fixtures page under the awkward shapes a real season produces. Blank and double gameweeks, postponed
 * fixtures (no gameweek, no kick-off), fixtures moved between gameweeks, the end of the season, missing difficulty
 * ratings, clubs FPL doesn't list, and parameters nobody should have typed.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixturesView } from "@/components/views/FixturesView";
import { buildFdrMatrix, buildFixtureFeed, defaultFdrStart, fdrHighlights } from "@/lib/domain";
import type { FplEvent, FplTeam, ScheduledFixture } from "@/lib/domain/types";
import { createFixturesService } from "@/lib/services/fixtures";
import { expectNoAxeViolations } from "./axe";

const NOW = new Date("2026-10-11T12:00:00Z");
const teams: FplTeam[] = [1, 2, 3, 4].map((id) => ({ id, code: 100 + id, name: `Club ${id}`, short_name: `C${id}` }));
const events = (n = 6, current = 2): FplEvent[] =>
  Array.from({ length: n }, (_, i) => {
    const id = i + 1;
    return { id, name: `Gameweek ${id}`, deadline_time: `2026-10-${String(id * 2).padStart(2, "0")}T10:00:00Z`, is_current: id === current, is_next: id === current + 1, finished: id < current, data_checked: id < current };
  });
const fx = (id: number, event: number | null, h: number, a: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event, team_h: h, team_a: a, team_h_difficulty: 2, team_a_difficulty: 4,
  kickoff_time: event === null ? null : `2026-10-${String(event * 2 + 1).padStart(2, "0")}T14:00:00Z`,
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});
/** Every gameweek: 1 v 2 and 3 v 4. */
const fullSeason = (n = 6) => Array.from({ length: n }, (_, i) => [fx(i * 10 + 1, i + 1, 1, 2), fx(i * 10 + 2, i + 1, 3, 4)]).flat();

const svc = (evs: FplEvent[], schedule: ScheduledFixture[], ts: FplTeam[] = teams) =>
  createFixturesService({ bootstrap: async () => ({ events: evs, teams: ts, elements: [] }), allFixtures: async () => schedule }, { now: () => NOW });

describe("difficulty ratings FPL didn't send", () => {
  // FPL has shipped fixtures with null difficulty before a rating is set (newly scheduled, rearranged matches).
  const broken = [
    ...fullSeason(3),
    fx(90, 2, 1, 3, { team_h_difficulty: null as unknown as number, team_a_difficulty: undefined as unknown as number }),
    fx(91, 3, 2, 4, { team_h_difficulty: Number.NaN, team_a_difficulty: 0 }),
  ];

  it("counts a missing or impossible rating as neutral, so averages stay numbers and the order is stable", () => {
    const m = buildFdrMatrix(events(3, 1), teams, broken, 1, 3)!;
    for (const row of m.rows) {
      expect(Number.isFinite(row.score), `team ${row.teamId}`).toBe(true);
      expect(Number.isFinite(row.average), `team ${row.teamId}`).toBe(true);
      for (const cell of row.cells) for (const match of cell.matches) expect(match.difficulty).toBeGreaterThanOrEqual(1);
    }
    const again = buildFdrMatrix(events(3, 1), teams, [...broken].reverse(), 1, 3)!;
    expect(again.rows.map((r) => r.teamId)).toEqual(m.rows.map((r) => r.teamId));
    expect(fdrHighlights(m)).not.toBeNull();
  });

  it("never prints NaN on the grid", async () => {
    const model = await svc(events(3, 1), broken).load("1", "3");
    const { container } = render(<FixturesView model={model} />);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe("blank and double gameweeks", () => {
  const schedule = [
    ...fullSeason(6).filter((f) => !(f.event === 3 && f.team_h === 3)), // GW3: clubs 3 and 4 blank
    fx(99, 4, 1, 3), fx(98, 4, 2, 4), // GW4: everyone plays twice
  ];

  it("shows both matches of a double, a dash for a blank, and names them in the intro", async () => {
    const model = await svc(events(6, 2), schedule).load("2", "5");
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.highlights?.blank).toEqual({ gw: 3, teams: ["Club 3", "Club 4"] });
    render(<FixturesView model={model} />);
    const row = screen.getByRole("rowheader", { name: /Club 3/ }).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[1]).getByText("No fixture")).toBeInTheDocument(); // GW3
    expect(within(cells[2]).getAllByRole("link")).toHaveLength(2); // GW4: two opponents
  });

  it("keeps the feed's blanks and doubles per gameweek", () => {
    const feed = buildFixtureFeed(events(6, 2), teams, schedule);
    const gw3 = feed.find((g) => g.gw === 3)!;
    const gw4 = feed.find((g) => g.gw === 4)!;
    expect(gw3.blanks).toEqual([3, 4]);
    expect(gw4.doubles).toEqual([1, 2, 3, 4]);
  });
});

describe("postponed and moved fixtures", () => {
  it("puts a fixture with no gameweek last in the feed and leaves it out of the grid", async () => {
    const schedule = [...fullSeason(3).filter((f) => f.id !== 21), fx(21, null, 1, 2)];
    const feed = buildFixtureFeed(events(3, 1), teams, schedule);
    expect(feed.at(-1)).toMatchObject({ gw: null, matchCount: 1 });
    expect(feed.find((g) => g.gw === 3)!.blanks).toEqual([1, 2]);
    const model = await svc(events(3, 1), schedule).load("1", "3");
    if (model.kind !== "ok") throw new Error("expected ok");
    const club1 = model.rows.find((r) => r.team.id === 1)!;
    expect(club1.cells.map((c) => c.length)).toEqual([1, 1, 0]);
  });

  it("follows a fixture FPL moved to another gameweek", () => {
    const moved = fullSeason(4).map((f) => (f.id === 21 ? { ...f, event: 4 } : f));
    const feed = buildFixtureFeed(events(4, 1), teams, moved);
    expect(feed.find((g) => g.gw === 3)!.matchCount).toBe(1);
    expect(feed.find((g) => g.gw === 4)!.doubles).toEqual([1, 2]);
  });

  it("orders a kick-off FPL sent in an unreadable form after every real time, the same way every time", () => {
    const schedule = [fx(1, 1, 1, 2, { kickoff_time: "not a date" }), fx(2, 1, 3, 4), fx(3, 1, 2, 3, { kickoff_time: "2026-10-01T10:00:00Z" })];
    const a = buildFixtureFeed(events(1, 1), teams, schedule)[0];
    const b = buildFixtureFeed(events(1, 1), teams, [...schedule].reverse())[0];
    const ids = (g: typeof a) => g.days.flatMap((d) => d.matches.map((m) => m.id));
    expect(ids(a)).toEqual([3, 2, 1]);
    expect(ids(b)).toEqual(ids(a));
    expect(a.days.at(-1)!.date).toBe("tbc");
  });
});

describe("the end of the season", () => {
  it("shows only the gameweeks left when fewer than asked for remain", async () => {
    const model = await svc(events(6, 5), fullSeason(6)).load("5", "10");
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.columns.map((c) => c.gw)).toEqual([5, 6]);
    expect(model.window).toBe(10);
    render(<FixturesView model={model} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Team", expect.stringContaining("GW5"), expect.stringContaining("GW6")]);
  });

  it("opens the grid at the next deadline, not on the gameweek already under way", async () => {
    // NOW is 11 Oct: GW5 (deadline 10 Oct) is under way and locked; GW6 (12 Oct) is the next one you can change
    const model = await svc(events(6, 5), fullSeason(6)).load(undefined, undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.start).toBe(6);
  });

  it("the feed's summary covers the same gameweeks as the grid's default tab", async () => {
    const s = svc(events(6, 2), fullSeason(6));
    const [feed, grid] = await Promise.all([s.feed(undefined), s.load(undefined, undefined)]);
    if (feed.kind !== "ok" || grid.kind !== "ok" || !feed.highlights || !grid.highlights) throw new Error("expected both");
    expect([feed.highlights.from, feed.highlights.to]).toEqual([grid.highlights.from, grid.highlights.to]);
  });

  it("opens on the last gameweek once every gameweek is over, not on the first", () => {
    const over = events(6, 0).map((e) => ({ ...e, is_current: false, finished: true, data_checked: true }));
    expect(defaultFdrStart(over)).toBe(6);
  });

  it("the feed opens on the last gameweek after the season", async () => {
    const over = events(6, 6).map((e) => ({ ...e, finished: true, data_checked: true }));
    const model = await svc(over, fullSeason(6)).feed(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.gameweeks[model.startIndex].gw).toBe(6);
  });
});

describe("parameters nobody should have typed", () => {
  it.each([
    ["-1", "abc"], ["0", "0"], ["1e3", "3.5"], ["99", "-5"], ["2.0", ""], [["3", "4"], ["10", "3"]], ["٣", "５"], [" 3", "3 "],
  ] as [string | string[], string | string[]][])("?gw=%j&n=%j falls back to something sensible", async (gw, n) => {
    const model = await svc(events(6, 2), fullSeason(6)).load(gw, n);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect([3, 5, 10]).toContain(model.window);
    expect(model.start).toBeGreaterThanOrEqual(1);
    expect(model.start).toBeLessThanOrEqual(6);
  });

  it.each(["-1", "999", "abc", "1.5", ""])("the feed ignores ?gw=%s and opens on the current gameweek", async (gw) => {
    const model = await svc(events(6, 2), fullSeason(6)).feed(gw);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.gameweeks[model.startIndex].gw).toBe(2);
  });
});

describe("clubs with no fixtures, and fixtures against clubs FPL doesn't list", () => {
  it("lists a club with no fixtures as blank everywhere, ranked as the hardest", async () => {
    const five = [...teams, { id: 5, code: 105, name: "Club 5", short_name: "C5" }];
    const model = await svc(events(6, 2), fullSeason(6), five).load("2", "3");
    if (model.kind !== "ok") throw new Error("expected ok");
    const row = model.rows.find((r) => r.team.id === 5)!;
    expect(row.cells.every((c) => c.length === 0)).toBe(true);
    expect(row.average).toBe(5);
    expect(model.rows[model.rows.length - 1].team.id).toBe(5);
  });

  it("names an unknown opponent in the page's language and doesn't link it to a club page that can't exist", async () => {
    const schedule = [fx(1, 2, 1, 77), fx(2, 2, 3, 4)];
    const model = await svc(events(6, 2), schedule).load("2", "3");
    const { container } = render(<FixturesView model={model} />);
    const row = screen.getByRole("rowheader", { name: /Club 1/ }).closest("tr")!;
    const cell = within(row).getAllByRole("cell")[0];
    expect(within(cell).queryByRole("link")).toBeNull();
    expect(cell.textContent).toContain("?");
    expect(container.querySelector('a[href="/club/unknown-club"]')).toBeNull();
    await expectNoAxeViolations(container);
  });
});
