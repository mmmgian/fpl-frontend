import { describe, expect, it } from "vitest";
import { compactNumber, seasonCharts } from "@/lib/domain";
import type { HistoryGameweek } from "@/lib/domain/types";

const g = (event: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 1000 - event, bank: 5, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
const events = [{ id: 1, average_entry_score: 50 }, { id: 2, average_entry_score: 60 }, { id: 3, average_entry_score: 0 }, { id: 4 }];

describe("seasonCharts", () => {
  const cur = [g(2, 70, { event_transfers: 2, event_transfers_cost: 4, points_on_bench: 9 }), g(1, 40), g(3, 55)];

  it("orders the weeks and keeps only settled gameweeks", () => {
    const c = seasonCharts(cur, events, 2)!;
    expect(c.points.map((p) => p.gw)).toEqual([1, 2]);
    expect(seasonCharts(cur, events, 3)!.points.map((p) => p.gw)).toEqual([1, 2, 3]);
  });
  it("is null when nothing has been settled", () => {
    expect(seasonCharts(cur, events, 0)).toBeNull();
    expect(seasonCharts([], events, 5)).toBeNull();
  });
  it("sets each week's points beside the average manager's, and counts the weeks beaten", () => {
    const c = seasonCharts(cur, events, 3)!;
    expect(c.points).toEqual([
      { gw: 1, points: 40, hit: 0, average: 50 },
      { gw: 2, points: 70, hit: 4, average: 60 },
      { gw: 3, points: 55, hit: 0, average: null },        // an average of 0 means "not played yet / unknown"
    ]);
    expect(c.beatAverage).toEqual({ weeks: 1, of: 2 });    // only the two weeks with a known average can be judged
  });
  it("does not count a score equal to the average as beating it", () => {
    expect(seasonCharts([g(1, 50)], events, 1)!.beatAverage).toEqual({ weeks: 0, of: 1 });
  });
  it("has no beat-the-average line when no averages are known", () => {
    expect(seasonCharts(cur, [{ id: 1 }, { id: 2 }], 3)!.beatAverage).toBeNull();
  });
  it("leaves out gameweeks with no overall rank instead of plotting zero", () => {
    const c = seasonCharts([g(1, 1, { overall_rank: null }), g(2, 1, { overall_rank: 0 }), g(3, 1, { overall_rank: 500 })], events, 3)!;
    expect(c.ranks).toEqual([{ gw: 3, rank: 500 }]);
  });
  it("reports team value as FPL gives it (bank included, never added twice), and carries bench and transfers", () => {
    const c = seasonCharts(cur, events, 2)!;
    expect(c.values).toEqual([{ gw: 1, value: 1000 }, { gw: 2, value: 1000 }]);
    expect(c.bench).toEqual([{ gw: 1, points: 0 }, { gw: 2, points: 9 }]);
    expect(c.transfers).toEqual([{ gw: 1, made: 0, hit: 0 }, { gw: 2, made: 2, hit: 4 }]);
  });
  it("takes Bench Boost weeks out of the wasted-bench series and reports them", () => {
    const c = seasonCharts([g(1, 60, { points_on_bench: 5 }), g(2, 70, { points_on_bench: 24 }), g(3, 50, { points_on_bench: 7 })], events, 3, [{ name: "bboost", event: 2 }, { name: "wildcard", event: 3 }])!;
    expect(c.bench).toEqual([{ gw: 1, points: 5 }, { gw: 2, points: 0 }, { gw: 3, points: 7 }]);      // only Bench Boost is special: a wildcard week's bench was wasted as usual
    expect(c.benchBoostWeeks).toEqual([2]);
    expect(seasonCharts([g(1, 60)], events, 1)!.benchBoostWeeks).toEqual([]);
  });
  it("does not mutate its input", () => {
    const before = cur.map((x) => x.event);
    seasonCharts(cur, events, 3);
    expect(cur.map((x) => x.event)).toEqual(before);
  });
});

describe("compactNumber", () => {
  it.each([
    [7295417, "7.3M"], [1_000_000, "1M"], [999_999, "1M"], [999_499, "999k"], [-147643, "-148k"], [147643, "148k"], [10_000, "10k"], [9_999, "10k"], [9_500, "9.5k"], [1_234, "1.2k"], [950, "950"], [0, "0"], [12, "12"],
  ])("%d -> %s", (n, out) => expect(compactNumber(n)).toBe(out));
});
