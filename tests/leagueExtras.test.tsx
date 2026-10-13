import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniBars, getT } from "@/components/ui";
import { LeagueAwards } from "@/components/views/LeagueAwards";
import { awardFigure, awardLine, awardTitle, streakLabel, tiedNote } from "@/components/views/leagueCopy";
import { ManagerStatsDetail, StatsToggle } from "@/components/views/ManagerStatsPanel";
import { StandingsTable } from "@/components/views/StandingsTable";
import { leagueStats, type Award, type AwardKey, type LeagueStats, type ManagerStats } from "@/lib/domain";
import type { EntryHistory, HistoryGameweek } from "@/lib/domain/types";
import { expectNoAxeViolations } from "./axe";
import { standing } from "./fixtures";

const g = (event: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 5000, bank: 5, value: 1004, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
const hist = (gws: HistoryGameweek[], chips: EntryHistory["chips"] = []): EntryHistory => ({ current: gws, past: [], chips });

const rows = [
  standing({ entry: 1, entry_name: "Alpha", player_name: "Ann", rank: 1, last_rank: 2, total: 300 }),
  standing({ entry: 2, entry_name: "Beta", player_name: "Bob", rank: 2, last_rank: 1, total: 250 }),
  standing({ entry: 3, entry_name: "Gamma", player_name: "Cat", rank: 3, last_rank: 3, total: 200 }),
];
const histories = new Map<number, EntryHistory>([
  [1, hist([g(1, 60), g(2, 70), g(3, 80)], [{ name: "wildcard", event: 2 }])],
  [2, hist([g(1, 50), g(2, 50), g(3, 50, { event_transfers: 2, event_transfers_cost: 8, points_on_bench: 11 })])],
  [3, hist([g(1, 40), g(2, 30), g(3, 20)])],
]);
const stats = leagueStats(rows, histories)!;

describe("award copy", () => {
  const make = (key: AwardKey, value: number, tiedWith = 0): Award => ({ key, entry: 1, value, tiedWith });
  it("has a title for every award", () => {
    for (const key of Object.keys(getT().awards.titles) as AwardKey[]) expect(awardTitle(key).length).toBeGreaterThan(3);
  });
  it("names the winner and states the number it is based on", () => {
    expect(awardLine(make("weekWinner", 62), "Alpha")).toMatch(/Alpha.*62 points/);
    expect(awardLine(make("weekWinner", 62), "Alpha", 5)).toMatch(/best score in the league in GW5\./);
    expect(awardLine(make("woodenSpoon", 20), "Alpha", 5)).toMatch(/20 points in GW5\. One to forget\./);
    expect(awardLine(make("hotStreak", 4), "Alpha")).toMatch(/4 weeks running/);
    expect(awardLine(make("hotStreak", 1), "Alpha")).toMatch(/1 week running/);
    expect(awardLine(make("climber", 1), "Alpha")).toMatch(/1 place up/);
    expect(awardLine(make("climber", 3), "Alpha")).toMatch(/3 places up/);
    expect(awardLine(make("benchDisaster", 20), "Alpha")).toMatch(/20 points sitting on the bench/);
    expect(awardLine(make("hitMachine", 8), "Alpha")).toMatch(/8 points in transfer hits/);
    expect(awardLine(make("deepPockets", 1004), "Alpha")).toMatch(/£100\.4m/);
    expect(awardLine(make("rollercoaster", 12.5), "Alpha")).toMatch(/12\.5 points/);
    expect(awardLine(make("woodenSpoon", 1), "Alpha")).toMatch(/1 point\b/);
  });
  it("prints the big number in the form that reads best", () => {
    expect(awardFigure(make("climber", 3))).toBe("▲3");
    expect(awardFigure(make("hitMachine", 8))).toBe("−8");
    expect(awardFigure(make("deepPockets", 1004))).toBe("£100.4m");
    expect(awardFigure(make("hotStreak", 4))).toBe("4 wk");
    expect(awardFigure(make("weekWinner", 62))).toBe("62");
  });
  it("is honest when an award is shared", () => {
    expect(tiedNote(make("weekWinner", 62))).toBeNull();
    expect(tiedNote(make("weekWinner", 62, 1))).toBe("Shared with 1 other");
    expect(tiedNote(make("weekWinner", 62, 3))).toBe("Shared with 3 others");
  });
  it("describes a manager's run only when they have one", () => {
    expect(streakLabel(stats.byEntry[1])).toMatch(/Hot: 3 weeks above average/);
    expect(streakLabel(stats.byEntry[3])).toMatch(/Cold: 3 weeks below average/);
    expect(streakLabel({ ...stats.byEntry[1], streak: null })).toBeNull();
  });
});

describe("LeagueAwards", () => {
  it("shows a card per award with the winner linked to their team page", () => {
    render(<LeagueAwards awards={stats.awards} rows={rows} />);
    expect(screen.getByRole("heading", { name: "League awards" })).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards.length).toBe(stats.awards.length);
    const winner = cards.find((c) => within(c).queryByText("Week winner"))!;
    expect(within(winner).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/team/alpha");
    expect(within(winner).getByText("80")).toBeInTheDocument();
  });
  it("renders nothing when there are no awards, or the winners are not in the table", () => {
    const { container } = render(<LeagueAwards awards={[]} rows={rows} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<LeagueAwards awards={[{ key: "weekWinner", entry: 999, value: 1, tiedWith: 0 }]} rows={rows} />);
    expect(c2).toBeEmptyDOMElement();
  });
  it("has no accessibility violations", async () => {
    const { container } = render(<LeagueAwards awards={stats.awards} rows={rows} />);
    await expectNoAxeViolations(container);
  });
});

/** A team's own row (the one that names it), not the detail row under it. */
const teamRow = (name: string) => {
  const row = screen.getAllByRole("row").find((r) => within(r).queryByRole("rowheader", { name: new RegExp(name) }));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

describe("StandingsTable with stats", () => {
  it("adds Form, Value, Bench, Hits and Chips columns, marked as the ones to hide on narrow screens", () => {
    const { container } = render(<StandingsTable rows={rows} caption="t" stats={stats} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Form", "Value", "Bench", "Hits", "Chips", "GW", "Total"]));
    expect(container.querySelectorAll("th.hide-md")).toHaveLength(5);
  });
  it("reads each team's own numbers in its own row", () => {
    render(<StandingsTable rows={rows} caption="t" stats={stats} />);
    const beta = teamRow("Beta");
    expect(within(beta).getByText("£100.4m")).toBeInTheDocument();       // FPL's value, which already includes the bank
    expect(within(beta).getByText("−8")).toBeInTheDocument();
    expect(within(beta).getByText("11")).toBeInTheDocument();
    expect(within(beta).queryByText("£100.9m")).toBeNull();            // the bank is not counted twice
    const alpha = teamRow("Alpha");
    expect(within(alpha).getByText("Wildcard, gameweek 2")).toBeInTheDocument();
  });
  it("marks the week's winner and hot and cold runs", () => {
    render(<StandingsTable rows={rows} caption="t" stats={stats} />);
    expect(within(teamRow("Alpha")).getByText("Won gameweek 3, the latest finished week")).toBeInTheDocument();
    expect(within(teamRow("Alpha")).getByText("GW3 winner", { exact: false })).toBeInTheDocument();
    expect(within(teamRow("Alpha")).getByText("On a hot streak: 3 weeks above the league average")).toBeInTheDocument();
    expect(within(teamRow("Gamma")).getByText("In a cold spell: 3 weeks below the league average")).toBeInTheDocument();
    expect(within(teamRow("Beta")).queryByText(/winner/)).toBeNull();
  });
  it("makes no competitive claims when too few managers have data to compare", () => {
    const thin = leagueStats(rows.slice(0, 2), new Map([[1, histories.get(1)!], [2, histories.get(2)!]]))!;
    render(<StandingsTable rows={rows} caption="t" stats={thin} />);
    expect(screen.queryByText(/winner/)).toBeNull();
    expect(screen.queryByText(/hot streak|cold spell/)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);           // the plain facts are still there for those with data
  });
  it("shows dashes, not made-up numbers, for a manager with no history", () => {
    const partial: Pick<LeagueStats, "byEntry" | "comparable" | "gw"> = { gw: 3, comparable: true, byEntry: { 1: stats.byEntry[1], 2: stats.byEntry[2] } };
    render(<StandingsTable rows={rows} caption="t" stats={partial} />);
    const gamma = teamRow("Gamma");
    expect(within(gamma).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("region", { name: "Stats for Gamma" })).toBeNull();
    expect(within(gamma).getAllByText("–").length).toBeGreaterThanOrEqual(4);
  });
  it("is the plain table, unchanged, when no stats are given (history snapshots)", () => {
    const { container } = render(<StandingsTable rows={rows} caption="t" />);
    expect(screen.queryByText("Form")).toBeNull();
    expect(container.querySelectorAll("th.hide-md")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("gives each team a detail row of its own, after its own row, that the table keeps hidden until asked", () => {
    const { container } = render(<StandingsTable rows={rows} caption="t" stats={stats} />);
    const trs = [...container.querySelectorAll("tbody tr")];
    expect(trs).toHaveLength(6);                                          // three teams, each followed by a detail row
    expect(trs[0].querySelector("input[data-expand]")).not.toBeNull();
    expect(trs[1]).toHaveClass("detail");
    expect(within(trs[1] as HTMLElement).getByRole("region", { name: "Stats for Alpha" })).toBeInTheDocument();
    expect(within(trs[3] as HTMLElement).getByRole("region", { name: "Stats for Beta" })).toBeInTheDocument();
  });
  it("has no accessibility violations", async () => {
    const { container } = render(<StandingsTable rows={rows} caption="League" stats={stats} />);
    await expectNoAxeViolations(container);
  });
});

describe("StatsToggle", () => {
  it("is a labelled checkbox, off by default (so it works with a keyboard and a screen reader, and without script)", () => {
    render(<StatsToggle teamName="Beta" />);
    const box = screen.getByRole("checkbox", { name: "Show stats for Beta" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute("data-expand");
  });
});

describe("ManagerStatsDetail", () => {
  const s = stats.byEntry[2];
  it("is a labelled region for its team", () => {
    render(<ManagerStatsDetail stats={s} teamName="Beta" />);
    expect(screen.getByRole("region", { name: "Stats for Beta" })).toBeInTheDocument();
  });
  it("lays out every figure with its label", () => {
    render(<ManagerStatsDetail stats={s} teamName="Beta" />);
    const fact = (label: string) => screen.getByText(label).closest("div")!.textContent;
    expect(fact("Season average")).toContain("47.3");                       // (50 + 50 + 42) / 3
    expect(fact("Best week")).toContain("GW1");
    expect(fact("Worst week")).toContain("42");
    expect(fact("Behind the leader")).toContain("50 pts");
    expect(fact("Behind the team above")).toContain("50 pts");
    expect(fact("Transfer hits")).toContain("−8 pts · 2 transfers in all");
    expect(fact("Bench points")).toContain("11");
    expect(fact("Chips played")).toContain("None yet");
  });
  it("calls the leader the leader and does not offer a team to pass", () => {
    render(<ManagerStatsDetail stats={stats.byEntry[1]} teamName="Alpha" />);
    expect(screen.getByText("Behind the leader").closest("div")!.textContent).toContain("Leading");
    expect(screen.queryByText("Behind the team above")).toBeNull();
    expect(screen.getByText("Chips played").closest("div")!.textContent).toContain("Wildcard (GW2)");
  });
  it("describes its chart in words, with every number", () => {
    render(<ManagerStatsDetail stats={s} teamName="Beta" />);
    expect(screen.getByRole("img", { name: /GW1 50, GW2 50, GW3 42.*average 47\.3/ })).toBeInTheDocument();
  });
  it("only mentions a hot or cold run when the league is big enough to compare", () => {
    const { unmount } = render(<ManagerStatsDetail stats={stats.byEntry[1]} teamName="Alpha" />);
    expect(screen.getByText(/Hot: 3 weeks/)).toBeInTheDocument();
    unmount();
    render(<ManagerStatsDetail stats={stats.byEntry[1]} teamName="Alpha" comparable={false} />);
    expect(screen.queryByText(/Hot:/)).toBeNull();
  });
});

describe("MiniBars", () => {
  it("draws one bar per value and describes them", () => {
    const { container } = render(<MiniBars values={[10, 40, 25]} label="Three weeks" />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "Three weeks" })).toBeInTheDocument();
  });
  it("scales bars against the biggest value, including the reference line", () => {
    const { container } = render(<MiniBars values={[10, 20]} reference={40} label="x" height={40} />);
    const heights = [...container.querySelectorAll("rect")].map((r) => Number(r.getAttribute("height")));
    expect(heights).toEqual([10, 20]);                                      // 40 is the top of the scale, so 20 is half-height
    expect(container.querySelector("line")).toBeTruthy();
  });
  it("prints the numbers and labels when asked, and not otherwise", () => {
    const { container, rerender } = render(<MiniBars values={[5, 9]} labels={["GW1", "GW2"]} label="x" />);
    expect(container.querySelectorAll("text")).toHaveLength(0);
    rerender(<MiniBars values={[5, 9]} labels={["GW1", "GW2"]} showValues showLabels label="x" />);
    expect(container.textContent).toContain("GW1");
    expect(container.textContent).toContain("9");
  });
  it("copes with zero and negative values, and with nothing", () => {
    const { container } = render(<MiniBars values={[0, -5, 3]} label="x" />);
    for (const r of container.querySelectorAll("rect")) expect(Number(r.getAttribute("height"))).toBeGreaterThanOrEqual(2);
    const { container: empty } = render(<MiniBars values={[]} label="x" />);
    expect(empty).toBeEmptyDOMElement();
  });
});

// Keep the type honest: ManagerStats is what the panel and table read.
const _typecheck: ManagerStats = stats.byEntry[1];
void _typecheck;
