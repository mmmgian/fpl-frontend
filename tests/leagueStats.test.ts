import { describe, expect, it } from "vitest";
import { leagueStats, netPoints, FORM_LENGTH } from "@/lib/domain";
import type { EntryHistory, HistoryGameweek, StandingRow } from "@/lib/domain/types";

const g = (event: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 1000, bank: 5, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
const hist = (gws: HistoryGameweek[], chips: EntryHistory["chips"] = []): EntryHistory => ({ current: gws, past: [], chips });
const row = (entry: number, rank: number, total: number, last_rank = rank): StandingRow => ({ entry, entry_name: `Team ${entry}`, player_name: `M${entry}`, rank, last_rank, event_total: 0, total });
const table = (...r: StandingRow[]) => r;
const map = (o: Record<number, EntryHistory>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

// Three managers, four gameweeks. League averages (net): GW1 50, GW2 60, GW3 50, GW4 70.
const H = map({
  1: hist([g(1, 60), g(2, 70), g(3, 60), g(4, 90)]),                                                                // above average every week
  2: hist([g(1, 50), g(2, 60), g(3, 50, { event_transfers: 2, event_transfers_cost: 8 }), g(4, 70, { points_on_bench: 12 })], [{ name: "wildcard", event: 3 }]),
  3: hist([g(1, 40), g(2, 50), g(3, 40), g(4, 50, { points_on_bench: 20, event_transfers: 3, event_transfers_cost: 8, value: 1010, overall_rank: 900 })]),
});
const ROWS = table(row(1, 1, 280, 2), row(2, 2, 233, 1), row(3, 3, 170, 3));

describe("netPoints", () => {
  it("is the gameweek's points after the transfer hit", () => expect(netPoints({ points: 50, event_transfers_cost: 8 })).toBe(42));
});

describe("leagueStats: per-manager figures", () => {
  const s = leagueStats(ROWS, H)!;

  it("finds the latest gameweek anyone has played", () => expect(s.gw).toBe(4));

  it("lists each manager's latest net scores, oldest first, capped at six", () => {
    expect(s.byEntry[2].form).toEqual([50, 60, 42, 70]);          // GW3's 50 is 42 after the 8-point hit
    expect(s.byEntry[2].formGws).toEqual([1, 2, 3, 4]);
    const long = map({ 1: hist(Array.from({ length: 10 }, (_, i) => g(i + 1, 10 + i))) });
    const l = leagueStats(table(row(1, 1, 1)), long)!;
    expect(l.byEntry[1].form).toHaveLength(FORM_LENGTH);
    expect(l.byEntry[1].formGws).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it("works out the season average, best and worst gameweeks after hits", () => {
    expect(s.byEntry[2].average).toBe((50 + 60 + 42 + 70) / 4);
    expect(s.byEntry[2].best).toEqual({ gw: 4, points: 70 });
    expect(s.byEntry[2].worst).toEqual({ gw: 3, points: 42 });
  });

  it("adds up hits, transfers and bench points", () => {
    expect(s.byEntry[3]).toMatchObject({ hitPoints: 8, transfers: 3, benchPoints: 20 });
    expect(s.byEntry[1]).toMatchObject({ hitPoints: 0, transfers: 0, benchPoints: 0 });
  });

  it("takes value and bank from the latest gameweek, and sorts the chips by gameweek", () => {
    expect(s.byEntry[3]).toMatchObject({ value: 1015, bank: 5 });       // squad 1010 + bank 5
    const c = leagueStats(table(row(1, 1, 1)), map({ 1: hist([g(1, 1)], [{ name: "bboost", event: 9 }, { name: "wildcard", event: 2 }]) }))!;
    expect(c.byEntry[1].chips.map((x) => x.name)).toEqual(["wildcard", "bboost"]);
  });

  it("ranks the latest week among the league, equal scores sharing a rank", () => {
    expect([1, 2, 3].map((e) => s.byEntry[e].weekRank)).toEqual([1, 2, 3]);
    const tied = leagueStats(ROWS, map({ 1: hist([g(1, 60)]), 2: hist([g(1, 60)]), 3: hist([g(1, 10)]) }))!;
    expect([1, 2, 3].map((e) => tied.byEntry[e].weekRank)).toEqual([1, 1, 3]);
  });

  it("reports how far each manager is behind the leader and the one above", () => {
    expect([1, 2, 3].map((e) => s.byEntry[e].behindLeader)).toEqual([0, 47, 110]);
    expect([1, 2, 3].map((e) => s.byEntry[e].behindNext)).toEqual([null, 47, 63]);
  });

  it("reports the overall-rank move since the previous gameweek (positive is better), or null if unknown", () => {
    expect(s.byEntry[3].overallMoved).toBe(100);                  // 1000 -> 900
    expect(s.byEntry[1].overallMoved).toBe(0);
    const unknown = leagueStats(table(row(1, 1, 1)), map({ 1: hist([g(1, 5, { overall_rank: null }), g(2, 5, { overall_rank: null })]) }))!;
    expect(unknown.byEntry[1].overallMoved).toBeNull();
    const one = leagueStats(table(row(1, 1, 1)), map({ 1: hist([g(1, 5)]) }))!;
    expect(one.byEntry[1].overallMoved).toBeNull();               // only one gameweek: nothing to compare with
  });

  describe("streaks against the league average", () => {
    it("counts consecutive latest gameweeks above average as hot", () => expect(s.byEntry[1].streak).toEqual({ kind: "hot", length: 4 }));
    it("counts consecutive latest gameweeks below average as cold", () => expect(s.byEntry[3].streak).toEqual({ kind: "cold", length: 4 }));
    it("does not count a score exactly on the league average as above or below it", () => {
      // Three managers who all score 50, 50, 50: every one of them is exactly on the average every week.
      const flat = map({ 1: hist([g(1, 50), g(2, 50), g(3, 50)]), 2: hist([g(1, 50), g(2, 50), g(3, 50)]), 3: hist([g(1, 50), g(2, 50), g(3, 50)]) });
      for (const e of [1, 2, 3]) expect(leagueStats(ROWS, flat)!.byEntry[e].streak).toBeNull();
    });
    it("is a run of one for a single gameweek, or a run that has just been broken", () => {
      const h = map({ 1: hist([g(1, 90), g(2, 90), g(3, 10)]), 2: hist([g(1, 10), g(2, 10), g(3, 90)]) });
      const r = leagueStats(table(row(1, 1, 1), row(2, 2, 1)), h)!;
      expect(r.byEntry[1].streak).toEqual({ kind: "cold", length: 1 });   // a long hot run, but the latest week was cold: a cold run of one
      expect(r.byEntry[2].streak).toEqual({ kind: "hot", length: 1 });
    });
    it("gives every manager a hot or cold mark unless they are exactly level with the league", () => {
      const r = leagueStats(ROWS, H)!;
      for (const e of [1, 2, 3]) expect(r.byEntry[e].streak, `manager ${e}`).not.toBeNull();
    });
    it("keeps 'on a roll' for a real run: one good week is not a streak", () => {
      const h = map({ 1: hist([g(1, 10), g(2, 90)]), 2: hist([g(1, 90), g(2, 10)]) });
      const r = leagueStats(table(row(1, 1, 1), row(2, 2, 1)), h)!;
      expect(r.byEntry[1].streak).toEqual({ kind: "hot", length: 1 });
      expect(r.awards.find((a) => a.key === "hotStreak")).toBeUndefined();
    });
  });
});

describe("leagueStats: coverage and edge cases", () => {
  it("is null when nobody has played", () => {
    expect(leagueStats(ROWS, new Map())).toBeNull();
    expect(leagueStats(ROWS, map({ 1: hist([]) }))).toBeNull();
    expect(leagueStats([], H)).toBeNull();
  });

  it("skips managers with no history instead of inventing figures, and still ranks the rest", () => {
    const partial = new Map([[1, H.get(1)!], [3, H.get(3)!]]);
    const s = leagueStats(ROWS, partial)!;
    expect(Object.keys(s.byEntry)).toEqual(["1", "3"]);
    expect(s.byEntry[3].weekRank).toBe(2);
  });

  it("copes with a manager who joined late (fewer gameweeks)", () => {
    const late = map({ 1: H.get(1)!, 2: H.get(2)!, 3: hist([g(4, 55)]) });
    const s = leagueStats(ROWS, late)!;
    expect(s.byEntry[3].form).toEqual([55]);
    expect(s.byEntry[3].streak).toEqual({ kind: "cold", length: 1 });   // 55 against a league average of 70 that week
    expect(s.byEntry[3].weekPoints).toBe(55);
  });

  it("gives a manager who has not played the latest gameweek no points for it", () => {
    const s = leagueStats(ROWS, map({ 1: H.get(1)!, 2: hist([g(1, 50), g(2, 60)]) }))!;
    expect(s.byEntry[2].weekPoints).toBe(0);
    expect(s.byEntry[2].weekRank).toBe(0);
  });

  it("never hands the week's wooden spoon to someone who didn't play that week", () => {
    const h = map({ 1: hist([g(1, 60), g(2, 70)]), 2: hist([g(1, 50), g(2, 60)]), 3: hist([g(1, 40)]) });      // manager 3 sat out GW2
    const s = leagueStats(ROWS, h)!;
    expect(s.awards.find((a) => a.key === "woodenSpoon")).toMatchObject({ entry: 2, value: 60 });
    expect(s.awards.find((a) => a.key === "weekWinner")).toMatchObject({ entry: 1 });
  });

  it("does not mutate what it is given", () => {
    const rows = structuredClone(ROWS);
    const hs = structuredClone([...H]);
    leagueStats(ROWS, H);
    expect(ROWS).toEqual(rows);
    expect([...H]).toEqual(hs);
  });
});

describe("leagueStats: only finished gameweeks count", () => {
  // GW4 is still being played: manager 3 has banked 50, manager 1 only 10 so far.
  const live = map({ 1: hist([g(1, 60), g(2, 70), g(3, 80), g(4, 10)]), 2: hist([g(1, 50), g(2, 60), g(3, 70), g(4, 45)]), 3: hist([g(1, 40), g(2, 50), g(3, 60), g(4, 50)]) });

  it("stops at the last finished gameweek, so a half-played week can't crown a winner or hand out the wooden spoon", () => {
    const s = leagueStats(ROWS, live, 3)!;
    expect(s.gw).toBe(3);
    expect(s.awards.find((a) => a.key === "weekWinner")).toMatchObject({ entry: 1, value: 80 });
    expect(s.awards.find((a) => a.key === "woodenSpoon")).toMatchObject({ entry: 3, value: 60 });
    expect(s.byEntry[1].form).toEqual([60, 70, 80]);
    expect(s.byEntry[1].best).toEqual({ gw: 3, points: 80 });
  });
  it("would otherwise have used the half-played week (this is what the limit prevents)", () => {
    const s = leagueStats(ROWS, live)!;
    expect(s.gw).toBe(4);
    expect(s.awards.find((a) => a.key === "woodenSpoon")).toMatchObject({ entry: 1, value: 10 });
  });
  it("has nothing to say before any gameweek has finished", () => {
    expect(leagueStats(ROWS, live, 0)).toBeNull();
  });
  it("ignores a manager whose only gameweeks are not yet finished", () => {
    const s = leagueStats(ROWS, map({ 1: hist([g(1, 60)]), 2: hist([g(1, 50)]), 3: hist([g(4, 99)]) }), 2)!;
    expect(Object.keys(s.byEntry)).toEqual(["1", "2"]);
  });
});

describe("leagueStats: coverage", () => {
  const big = Array.from({ length: 20 }, (_, i) => row(i + 1, i + 1, 500 - i));
  const hs = (n: number) => new Map(big.slice(0, n).map((r) => [r.entry, hist([g(1, 50 + r.entry)])] as const));
  it("withholds awards and comparisons when only a handful of a big league's histories arrived", () => {
    const s = leagueStats(big, hs(3))!;
    expect(s.comparable).toBe(false);
    expect(s.awards).toEqual([]);
    expect(Object.keys(s.byEntry)).toHaveLength(3);                       // their own facts are still shown
  });
  it("hands them out once three quarters of the league has been counted", () => {
    expect(leagueStats(big, hs(14))!.comparable).toBe(false);             // 14 of 20 = 70%
    const s = leagueStats(big, hs(15))!;                                   // 15 of 20 = 75%
    expect(s.comparable).toBe(true);
    expect(s.awards.length).toBeGreaterThan(0);
  });
});

describe("leagueStats: Bench Boost weeks", () => {
  it("does not count bench points as wasted in the week Bench Boost made them count", () => {
    const h = map({
      1: hist([g(1, 60, { points_on_bench: 6 }), g(2, 70, { points_on_bench: 25 }), g(3, 60, { points_on_bench: 4 })], [{ name: "bboost", event: 2 }]),
      2: hist([g(1, 50, { points_on_bench: 5 }), g(2, 50, { points_on_bench: 9 }), g(3, 50, { points_on_bench: 3 })]),
      3: hist([g(1, 40), g(2, 40), g(3, 40)]),
    });
    const s = leagueStats(ROWS, h)!;
    expect(s.byEntry[1].benchPoints).toBe(10);                             // 6 + 4: the 25 under Bench Boost counted
    expect(s.awards.find((a) => a.key === "benchDisaster")).toMatchObject({ entry: 2, value: 17 });
  });
  it("still counts other chips' weeks as normal", () => {
    const h = map({ 1: hist([g(1, 60, { points_on_bench: 8 })], [{ name: "wildcard", event: 1 }]), 2: hist([g(1, 5)]), 3: hist([g(1, 5)]) });
    expect(leagueStats(ROWS, h)!.byEntry[1].benchPoints).toBe(8);
  });
});

describe("leagueStats: awards", () => {
  const s = leagueStats(ROWS, H)!;
  const award = (key: string) => s.awards.find((a) => a.key === key);

  it("names the week's best and worst scores", () => {
    expect(award("weekWinner")).toMatchObject({ entry: 1, value: 90, tiedWith: 0 });
    expect(award("woodenSpoon")).toMatchObject({ entry: 3, value: 42, tiedWith: 0 });
  });

  it("names the longest hot streak", () => expect(award("hotStreak")).toMatchObject({ entry: 1, value: 4 }));

  it("names the biggest climber in the table, and none when nobody climbed", () => {
    const climbed = leagueStats(table(row(1, 1, 280, 3), row(2, 2, 233, 1), row(3, 3, 170, 2)), H)!;
    expect(climbed.awards.find((a) => a.key === "climber")).toMatchObject({ entry: 1, value: 2 });
    expect(award("climber")).toMatchObject({ entry: 1, value: 1 });   // 2nd -> 1st
    const still = leagueStats(table(row(1, 1, 280), row(2, 2, 233), row(3, 3, 170)), H)!;
    expect(still.awards.find((a) => a.key === "climber")).toBeUndefined();
    const newcomers = leagueStats(table(row(1, 1, 280, 0), row(2, 2, 233, 0), row(3, 3, 170, 0)), H)!;
    expect(newcomers.awards.find((a) => a.key === "climber")).toBeUndefined();     // last_rank 0 means "wasn't in the table yet"
  });

  it("names the bench disaster, the hit machine and the biggest squad, only when there is something to name", () => {
    expect(award("benchDisaster")).toMatchObject({ entry: 3, value: 20 });
    expect(award("hitMachine")).toMatchObject({ entry: 2, value: 8, tiedWith: 1 });   // 2 and 3 both gave away 8: the higher-placed one gets the title
    expect(award("deepPockets")).toMatchObject({ entry: 3, value: 1015 });
    const clean = leagueStats(ROWS, map({ 1: hist([g(1, 5), g(2, 5), g(3, 5), g(4, 5)]), 2: hist([g(1, 5), g(2, 5), g(3, 5), g(4, 5)]), 3: hist([g(1, 5), g(2, 5), g(3, 5), g(4, 5)]) }))!;
    expect(clean.awards.find((a) => a.key === "benchDisaster")).toBeUndefined();   // nobody left points on the bench
    expect(clean.awards.find((a) => a.key === "hitMachine")).toBeUndefined();
  });

  it("names the biggest rollercoaster only with at least four gameweeks to judge by", () => {
    const wild = map({ 1: hist([g(1, 10), g(2, 90), g(3, 10), g(4, 90)]), 2: hist([g(1, 50), g(2, 50), g(3, 50), g(4, 50)]), 3: hist([g(1, 40), g(2, 60), g(3, 40), g(4, 60)]) });
    expect(leagueStats(ROWS, wild)!.awards.find((a) => a.key === "rollercoaster")).toMatchObject({ entry: 1, value: 40 });
    const short = map({ 1: hist([g(1, 10), g(2, 90)]), 2: hist([g(1, 50), g(2, 50)]), 3: hist([g(1, 40), g(2, 60)]) });
    expect(leagueStats(ROWS, short)!.awards.find((a) => a.key === "rollercoaster")).toBeUndefined();
  });

  it("breaks ties in favour of the manager higher in the table, and says how many shared it", () => {
    const tie = leagueStats(ROWS, map({ 1: hist([g(1, 30)]), 2: hist([g(1, 80)]), 3: hist([g(1, 80)]) }))!;
    expect(tie.awards.find((a) => a.key === "weekWinner")).toMatchObject({ entry: 2, value: 80, tiedWith: 1 });
  });

  it("says whether there are enough managers with data to compare them", () => {
    expect(leagueStats(ROWS, H)!.comparable).toBe(true);
    const two = leagueStats(table(row(1, 1, 1), row(2, 2, 1)), map({ 1: H.get(1)!, 2: H.get(2)! }))!;
    expect(two.comparable).toBe(false);
    const missing = leagueStats(ROWS, new Map([[1, H.get(1)!], [3, H.get(3)!]]))!;     // three in the table, only two with data
    expect(missing.comparable).toBe(false);
  });

  it("hands out no awards in a league too small to be fun (fewer than three managers with data)", () => {
    expect(leagueStats(table(row(1, 1, 1), row(2, 2, 1)), map({ 1: H.get(1)!, 2: H.get(2)! }))!.awards).toEqual([]);
  });
});
