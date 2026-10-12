import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { LeagueAwards } from "@/components/views/LeagueAwards";
import { awardLine, awardTitle, dareLine, streakLabel } from "@/components/views/leagueCopy";
import { ManagerStatsDetail, StatsToggle } from "@/components/views/ManagerStatsPanel";
import { daresFor, leagueStats, sealedChips, MAX_DARES, type Award, type AwardKey, type ManagerStats } from "@/lib/domain";
import { MESSAGES } from "@/lib/domain/i18n";
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
const base: ManagerStats = stats.byEntry[2];

afterEach(() => setRequestTrip(false));

// ----------------------------------------------------------------------------------------------- the dares (pure)

describe("daring moves", () => {
  const s = (over: Partial<ManagerStats>): ManagerStats => ({ ...base, chips: [], streak: null, benchPoints: 0, bank: 0, hitPoints: 4, behindLeader: 10, ...over });
  it("always starts with the chase, or with holding the lead", () => {
    expect(daresFor(s({ behindLeader: 23 }), 7)[0]).toEqual({ key: "chase", points: 23 });
    expect(daresFor(s({ behindLeader: 0 }), 7)[0]).toEqual({ key: "leading" });
  });
  it("counts only the chips of the current half as used", () => {
    expect(sealedChips([], 7)).toEqual(["wildcard", "freehit", "bboost", "3xc"]);
    expect(sealedChips([{ name: "wildcard", event: 3 }, { name: "manager", event: 4 }], 7)).toEqual(["freehit", "bboost", "3xc"]);
    expect(sealedChips([{ name: "wildcard", event: 3 }], 20)).toEqual(["wildcard", "freehit", "bboost", "3xc"]);
    expect(sealedChips(["wildcard", "freehit", "bboost", "3xc"].map((name) => ({ name, event: 5 })), 7)).toEqual([]);
    expect(daresFor(s({}), 25)[1]).toMatchObject({ key: "sealed", half: "second" });
  });
  it("reads streaks of two or more, the couch, the stash and the hits off the numbers, at most three", () => {
    const all = ["wildcard", "freehit", "bboost", "3xc"].map((name) => ({ name, event: 2 }));
    expect(daresFor(s({ chips: all, streak: { kind: "hot", length: 3 } }), 7)[1]).toEqual({ key: "glowing", weeks: 3 });
    expect(daresFor(s({ chips: all, streak: { kind: "cold", length: 2 } }), 7)[1]).toEqual({ key: "drifting", weeks: 2 });
    expect(daresFor(s({ chips: all, streak: { kind: "hot", length: 1 } }), 7).map((d) => d.key)).toEqual(["chase"]);
    expect(daresFor(s({ chips: all, benchPoints: 24, bank: 12 }), 7)).toEqual([{ key: "chase", points: 10 }, { key: "couch", points: 24 }, { key: "stash", bank: 12 }]);
    expect(daresFor(s({ chips: all, hitPoints: 0 }), 7).map((d) => d.key)).toEqual(["chase", "noHits"]);
    expect(daresFor(s({ chips: all, hitPoints: 16 }), 7)[1]).toEqual({ key: "manyHits", points: 16 });
    expect(daresFor(s({ streak: { kind: "hot", length: 4 }, benchPoints: 30, bank: 20, hitPoints: 0 }), 7)).toHaveLength(MAX_DARES);
  });
  it("says each dare with its own figure", () => {
    expect(dareLine({ key: "chase", points: 23 })).toMatch(/23 points away/);
    expect(dareLine({ key: "sealed", chips: ["wildcard", "3xc"], half: "first" })).toMatch(/first half: Wildcard, Triple Captain\./);
    expect(dareLine({ key: "stash", bank: 12 })).toMatch(/£1\.2m/);
    expect(dareLine({ key: "glowing", weeks: 3 })).toMatch(/^3 weeks glowing/);
    expect(dareLine({ key: "manyHits", points: 16 })).toMatch(/16 points paid/);
  });
});

// ----------------------------------------------------------------------------------------------- the catalogs

describe("the blotter's words", () => {
  it("has every vision and dare in every language, with the same figures", () => {
    for (const [lang, m] of Object.entries(MESSAGES)) {
      for (const key of Object.keys(m.awards.titles) as AwardKey[]) {
        expect(m.blotter.titles[key].length, `${lang} ${key}`).toBeGreaterThan(3);
        expect(m.blotter.titles[key], `${lang} ${key}`).not.toBe(m.awards.titles[key]);
      }
      expect(m.blotter.lines.weekWinner("Alpha", "62 X", "Y")).toContain("62 X");
      expect(m.blotter.lines.deepPockets("Alpha", "£100.4m")).toContain("£100.4m");
      expect(m.blotter.dares.sealed("WC", "second")).toContain("WC");
    }
  });
});

// ----------------------------------------------------------------------------------------------- the views

describe("League awards in the altered view", () => {
  const make = (key: AwardKey, value: number): Award => ({ key, entry: 1, value, tiedWith: 0 });
  it("become visions that keep the numbers", () => {
    setRequestTrip(true);
    expect(awardTitle("weekWinner")).toBe("The Peak");
    expect(awardLine(make("weekWinner", 62), "Alpha", 5)).toMatch(/in GW5: 62 points after hits/);
    expect(awardLine(make("benchDisaster", 20), "Alpha")).toMatch(/^20 points have melted into Alpha's couch/);
    render(<LeagueAwards awards={stats.awards} rows={rows} />);
    expect(screen.getByRole("heading", { level: 2, name: "The Visions" })).toBeInTheDocument();
    expect(screen.getByText("Same numbers. Different doors.")).toBeInTheDocument();
    expect(screen.queryByText("League awards")).toBeNull();
  });
  it("stay plain outside it", () => {
    render(<LeagueAwards awards={stats.awards} rows={rows} />);
    expect(screen.getByRole("heading", { level: 2, name: "League awards" })).toBeInTheDocument();
    expect(awardTitle("weekWinner")).toBe("Week winner");
  });
  it("hide their sigils from assistive technology and pass axe", async () => {
    setRequestTrip(true);
    const { container } = render(<LeagueAwards awards={stats.awards} rows={rows} />);
    const glyphs = container.querySelectorAll('[class*="visionGlyph"]');
    expect(glyphs.length).toBe(stats.awards.length);
    for (const glyph of glyphs) expect(glyph).toHaveAttribute("aria-hidden", "true");
    await expectNoAxeViolations(container);
  });
});

describe("Stats in the altered view", () => {
  it("expands the mind instead", () => {
    setRequestTrip(true);
    render(<StatsToggle teamName="Beta" />);
    expect(screen.getByRole("checkbox", { name: "Expand the mind of Beta" })).not.toBeChecked();
    expect(screen.getByText("Expand mind")).toBeInTheDocument();
  });
  it("relabels the facts, keeps the figures, and dares the manager", async () => {
    setRequestTrip(true);
    const { container } = render(<ManagerStatsDetail stats={base} teamName="Beta" />);
    const region = screen.getByRole("region", { name: "Inside the mind of Beta" });
    expect(within(region).getByText("Cruising altitude")).toBeInTheDocument();
    expect(within(region).getByText("Distance to the sun")).toBeInTheDocument();
    const fact = (label: string) => within(region).getByText(label).closest("div")!.textContent;
    expect(fact("Cruising altitude")).toContain("47.3");
    expect(fact("Ferry fares")).toContain("−8 pts (2 transfers)");
    expect(fact("Doors opened")).toContain("All doors still shut");
    const dares = within(region).getByRole("heading", { name: "Daring moves" });
    const list = dares.nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(`The sun is ${base.behindLeader} points away`);
    await expectNoAxeViolations(container);
  });
  it("calls the leader the sun and the runs glowing or drifting", () => {
    setRequestTrip(true);
    render(<ManagerStatsDetail stats={stats.byEntry[1]} teamName="Alpha" />);
    expect(screen.getByText("None. They are the sun.")).toBeInTheDocument();
    expect(streakLabel({ ...base, streak: { kind: "hot", length: 3 } })).toBe("Glowing: 3 weeks above average");
    expect(streakLabel({ ...base, streak: { kind: "cold", length: 1 } })).toBe("Drifting: below average this week");
  });
  it("is untouched outside the altered view", () => {
    render(<ManagerStatsDetail stats={base} teamName="Beta" />);
    expect(screen.getByRole("region", { name: "Stats for Beta" })).toBeInTheDocument();
    expect(screen.queryByText("Daring moves")).toBeNull();
    expect(screen.getByText("Season average")).toBeInTheDocument();
  });
});
