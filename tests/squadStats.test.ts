import { describe, expect, it } from "vitest";
import { squadWeek } from "@/lib/domain";
import type { Bootstrap, EntryPicks, EventLive } from "@/lib/domain/types";

// element ids: 1 keeper, 2 defender, 3 midfielder, 4 forward, 5 second defender, 6 bench midfielder (all club 10 unless noted)
const elements: Bootstrap["elements"] = [
  { id: 1, web_name: "K", team: 10, element_type: 1 },
  { id: 2, web_name: "D", team: 10, element_type: 2 },
  { id: 3, web_name: "M", team: 10, element_type: 3 },
  { id: 4, web_name: "F", team: 10, element_type: 4 },
  { id: 5, web_name: "D2", team: 11, element_type: 2 },
  { id: 6, web_name: "B", team: 10, element_type: 3 },
];
const pick = (element: number, multiplier: number, extra = {}) => ({ element, position: element, multiplier, is_captain: false, is_vice_captain: false, ...extra });
const picks = (...p: ReturnType<typeof pick>[]): EntryPicks => ({ active_chip: null, entry_history: {} as EntryPicks["entry_history"], picks: p });
const stat = (id: number, xg: string, xa: string, dc: number) => ({ id, stats: { total_points: 0, minutes: 90, bonus: 0, bps: 0, expected_goals: xg, expected_assists: xa, defensive_contribution: dc } });
const live = (...e: ReturnType<typeof stat>[]): EventLive => ({ elements: e });
const single = new Map([[10, 1], [11, 1]]);

describe("squadWeek", () => {
  it("adds up the expected goals and assists of the players who counted, and nobody else", () => {
    const p = picks(pick(2, 1), pick(3, 1), pick(4, 2), pick(6, 0));
    const l = live(stat(2, "0.10", "0.05", 0), stat(3, "0.30", "0.20", 0), stat(4, "0.80", "0.10", 0), stat(6, "0.90", "0.90", 0));
    const w = squadWeek(5, p, l, elements, single);
    expect(w.xg).toBeCloseTo(1.2, 5);          // 0.10 + 0.30 + 0.80: the captain's double is for points, not for chances
    expect(w.xa).toBeCloseTo(0.35, 5);         // the bench player's 0.90 does not count
    expect(w.gw).toBe(5);
  });

  it("counts the bench when it counted for points (Bench Boost gives every player a multiplier)", () => {
    const w = squadWeek(5, picks(pick(3, 1), pick(6, 1)), live(stat(3, "0.30", "0", 0), stat(6, "0.40", "0", 0)), elements, single);
    expect(w.xg).toBeCloseTo(0.7, 5);
  });

  it("gives DefCon to a defender at 10 and a midfielder or forward at 12, never to a keeper", () => {
    const w = squadWeek(5, picks(pick(1, 1), pick(2, 1), pick(3, 1), pick(4, 1)), live(stat(1, "0", "0", 15), stat(2, "0", "0", 10), stat(3, "0", "0", 11), stat(4, "0", "0", 12)), elements, single);
    expect(w.defcon).toBe(2);                  // the defender (10) and the forward (12); not the midfielder (11) or the keeper
    expect(w.defconPoints).toBe(4);
  });

  it("banks the captain's multiplier on the bonus", () => {
    const w = squadWeek(5, picks(pick(2, 2, { is_captain: true }), pick(5, 1)), live(stat(2, "0", "0", 11), stat(5, "0", "0", 10)), elements, single);
    expect(w.defcon).toBe(2);
    expect(w.defconPoints).toBe(2 * 2 + 2 * 1);
  });

  it("does not claim a bonus for a club with two matches that week: FPL's total adds both", () => {
    const doubles = new Map([[10, 2], [11, 1]]);
    const w = squadWeek(5, picks(pick(2, 1), pick(5, 1)), live(stat(2, "0", "0", 14), stat(5, "0", "0", 10)), elements, doubles);
    expect(w.defcon).toBe(1);                  // only the club with one match
    expect(w.defconUnsure).toBe(1);            // the other might have, or might not
    expect(w.defconPoints).toBe(2);
  });

  it("says nothing about DefCon when the schedule is unknown, but still reports the chances", () => {
    const w = squadWeek(5, picks(pick(2, 1), pick(4, 1)), live(stat(2, "0", "0", 14), stat(4, "0.5", "0.2", 0)), elements, null);
    expect(w.defcon).toBeNull();
    expect(w.defconPoints).toBeNull();
    expect(w.xg).toBeCloseTo(0.5, 5);
  });

  it("skips a player with no live row or no record, and treats unreadable numbers as nothing", () => {
    const w = squadWeek(5, picks(pick(2, 1), pick(3, 1), pick(99, 1)), live(stat(3, "oops", "", 0)), elements, single);
    expect(w).toMatchObject({ xg: 0, xa: 0, defcon: 0, defconPoints: 0, defconUnsure: 0 });
  });
});
