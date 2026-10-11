import { describe, expect, it } from "vitest";
import { clubMatches, clubNews, clubPlayers, formGuide, newsSeverity, predictedXI, type ClubPlayer } from "@/lib/domain";
import type { FplElement, ScheduledFixture } from "@/lib/domain/types";

const fx = (id: number, h: number, a: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event: id, team_h: h, team_a: a, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: `2026-10-${String(id).padStart(2, "0")}T14:00:00Z`,
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});
const done = (id: number, h: number, a: number, hs: number, as: number) => fx(id, h, a, { started: true, finished: true, finished_provisional: true, team_h_score: hs, team_a_score: as });

describe("clubMatches", () => {
  const schedule = [done(1, 1, 2, 3, 0), done(2, 3, 1, 1, 1), done(3, 1, 4, 0, 2), fx(4, 1, 5), fx(5, 6, 1), fx(6, 2, 3), done(7, 5, 1, 0, 1)];

  it("splits the club's fixtures into what is coming and what has happened, ignoring other clubs' matches", () => {
    const m = clubMatches(schedule, 1);
    expect(m.next.map((x) => x.id)).toEqual([4, 5]);
    expect(m.recent.map((x) => x.id)).toEqual([7, 3, 2, 1]);               // most recent first
  });
  it("names the opponent whichever side the club was on", () => {
    expect(clubMatches(schedule, 1).next.map((x) => x.opponentId)).toEqual([5, 6]);        // fx(4, 1, 5): home v 5; fx(5, 6, 1): away at 6
    expect(clubMatches(schedule, 1).recent.map((x) => x.opponentId)).toEqual([5, 4, 3, 2]);
  });
  it("reads each result from the club's own side, home or away", () => {
    const m = clubMatches(schedule, 1).recent;
    expect(m.map((x) => [x.home, x.scored, x.conceded, x.result])).toEqual([[false, 1, 0, "W"], [true, 0, 2, "L"], [false, 1, 1, "D"], [true, 3, 0, "W"]]);
  });
  it("gives the club's own difficulty for the match", () => {
    expect(clubMatches(schedule, 1).next.map((x) => [x.home, x.band])).toEqual([[true, 2], [false, 4]]);
  });
  it("keeps a match in progress in what is coming, with its score so far, and no result", () => {
    const live = [fx(1, 1, 2, { started: true, team_h_score: 1, team_a_score: 0 }), fx(2, 1, 3)];
    const m = clubMatches(live, 1);
    expect(m.next[0]).toMatchObject({ state: "live", scored: 1, conceded: 0, result: null });
    expect(m.recent).toEqual([]);
  });
  it("counts a match that is over but awaiting bonus as a result", () => {
    const m = clubMatches([fx(1, 1, 2, { started: true, finished_provisional: true, team_h_score: 2, team_a_score: 2 })], 1);
    expect(m.recent[0]).toMatchObject({ state: "provisional", result: "D" });
  });
  it("limits how many it returns, and copes with none", () => {
    const many = Array.from({ length: 12 }, (_, i) => fx(i + 1, 1, 2));
    expect(clubMatches(many, 1).next).toHaveLength(5);
    expect(clubMatches(many, 1, 3).next).toHaveLength(3);
    expect(clubMatches([], 1)).toEqual({ next: [], recent: [] });
    expect(clubMatches(schedule, 99)).toEqual({ next: [], recent: [] });
  });
  it("puts a match with no kick-off time last among those coming", () => {
    const m = clubMatches([fx(1, 1, 2, { kickoff_time: null }), fx(2, 1, 3)], 1);
    expect(m.next.map((x) => x.id)).toEqual([2, 1]);
  });
  it("turns results into a form guide that reads oldest to newest", () => {
    expect(formGuide(clubMatches(schedule, 1).recent)).toEqual(["W", "D", "L", "W"]);
  });
});

const el = (id: number, team: number, position: 1 | 2 | 3 | 4, over: Partial<FplElement> = {}): FplElement => ({
  id, web_name: `P${id}`, team, element_type: position, starts: 6, minutes: 540, form: "4.0", total_points: 30, selected_by_percent: "10.0", ...over,
});

describe("clubPlayers and clubNews", () => {
  it("keeps only the club's own players, filling in what FPL leaves out", () => {
    const ps = clubPlayers([el(1, 1, 1), el(2, 2, 1), { id: 3, web_name: "Bare", team: 1, element_type: 3 }], 1);
    expect(ps.map((p) => p.id)).toEqual([1, 3]);
    expect(ps[1]).toMatchObject({ status: "a", news: "", chance: null, minutes: 0, starts: 0, form: 0, ownership: null });
  });

  it("grades an availability flag", () => {
    expect(newsSeverity({ status: "i", chance: 0 })).toBe("out");
    expect(newsSeverity({ status: "s", chance: 0 })).toBe("out");
    expect(newsSeverity({ status: "d", chance: 50 })).toBe("doubt");
    expect(newsSeverity({ status: "a", chance: 75 })).toBe("doubt");
    expect(newsSeverity({ status: "a", chance: 100 })).toBe("note");
    expect(newsSeverity({ status: "a", chance: null })).toBe("note");
  });

  it("lists only players with news or a flag, the most serious first and then the most recent", () => {
    const players = clubPlayers([
      el(1, 1, 3, { news: "Hamstring", status: "i", chance_of_playing_next_round: 0, news_added: "2026-10-01T10:00:00Z" }),
      el(2, 1, 2, { news: "Knock", status: "d", chance_of_playing_next_round: 50, news_added: "2026-10-09T10:00:00Z" }),
      el(3, 1, 4, { news: "Suspended", status: "s", chance_of_playing_next_round: 0, news_added: "2026-10-08T10:00:00Z" }),
      el(4, 1, 2, {}),                                                  // fit and no news: not listed
      el(5, 1, 3, { news: "Back in training", news_added: "2026-10-10T10:00:00Z" }),
    ], 1);
    expect(clubNews(players).map((n) => [n.player.id, n.severity])).toEqual([[3, "out"], [1, "out"], [2, "doubt"], [5, "note"]]);
  });
  it("leaves out players who have left the club, whatever their news says", () => {
    const players = clubPlayers([
      el(1, 1, 3, { news: "Has joined Barcelona permanently", status: "u", chance_of_playing_next_round: 0, news_added: "2026-09-02T10:00:00Z" }),
      el(2, 1, 3, { news: "Departed as a free agent", status: "n", chance_of_playing_next_round: 0 }),
      el(3, 1, 4, { news: "Hamstring", status: "i", chance_of_playing_next_round: 0 }),
    ], 1);
    expect(clubNews(players).map((n) => n.player.id)).toEqual([3]);
  });
  it("copes with a missing or invalid news date", () => {
    const ps = clubPlayers([el(1, 1, 3, { news: "x", status: "i" }), el(2, 1, 3, { news: "y", status: "i", news_added: "not a date" })], 1);
    expect(clubNews(ps)).toHaveLength(2);
  });
});

describe("predictedXI", () => {
  /** A squad: 2 GKs, 6 DEF, 6 MID, 4 FWD, starts falling with the id within each position. */
  const squad = (over: (p: FplElement) => Partial<FplElement> = () => ({})): ClubPlayer[] => {
    const els: FplElement[] = [];
    let id = 1;
    const add = (pos: 1 | 2 | 3 | 4, n: number) => { for (let i = 0; i < n; i++) { const e = el(id++, 1, pos, { starts: 6 - i, minutes: (6 - i) * 90 }); els.push({ ...e, ...over(e) }); } };
    add(1, 2); add(2, 6); add(3, 6); add(4, 4);
    return clubPlayers(els, 1);
  };

  it("names eleven players: a keeper and ten outfielders in a legal formation", () => {
    const xi = predictedXI(squad())!;
    const all = [xi.goalkeeper, ...xi.defenders, ...xi.midfielders, ...xi.forwards];
    expect(all).toHaveLength(11);
    expect(new Set(all.map((p) => p.player.id)).size).toBe(11);
    expect(xi.defenders.length).toBeGreaterThanOrEqual(3);
    expect(xi.defenders.length).toBeLessThanOrEqual(5);
    expect(xi.midfielders.length).toBeGreaterThanOrEqual(2);
    expect(xi.forwards.length).toBeGreaterThanOrEqual(1);
    expect(xi.formation).toBe(`${xi.defenders.length}-${xi.midfielders.length}-${xi.forwards.length}`);
    expect(xi.open).toEqual({ defenders: 0, midfielders: 0, forwards: 0 });
  });

  it("picks the most regular starters in each position, in that order", () => {
    const xi = predictedXI(squad())!;
    expect(xi.goalkeeper.player.id).toBe(1);
    expect(xi.defenders.map((p) => p.player.id).slice(0, 3)).toEqual([3, 4, 5]);
    expect(xi.goalkeeper.startRate).toBe(1);
  });

  it("leaves out injured, suspended and unlikely players, and keeps a doubt but flags it", () => {
    const xi = predictedXI(squad((e) => (e.id === 1 ? { status: "i", chance_of_playing_next_round: 0 } : e.id === 3 ? { status: "d", chance_of_playing_next_round: 75 } : e.id === 4 ? { status: "d", chance_of_playing_next_round: 25 } : {})))!;
    expect(xi.goalkeeper.player.id).toBe(2);                              // the first-choice keeper is out
    const ids = [...xi.defenders, ...xi.midfielders, ...xi.forwards].map((p) => p.player.id);
    expect(ids).not.toContain(4);                                         // a 25% chance is not predicted to play
    expect(xi.defenders.find((p) => p.player.id === 3)?.doubt).toBe(true);
  });

  it("has no keeper to name when none is fit, so it names no XI at all", () => {
    expect(predictedXI(squad((e) => (e.element_type === 1 ? { status: "i", chance_of_playing_next_round: 0 } : {})))).toBeNull();
  });

  it("names no XI when the club has not played, or too few players are fit", () => {
    expect(predictedXI(squad(() => ({ starts: 0, minutes: 0 })))).toBeNull();
    expect(predictedXI(squad((e) => (e.id > 8 ? { status: "i", chance_of_playing_next_round: 0 } : {})))).toBeNull();
    expect(predictedXI([])).toBeNull();
  });

  it("never exceeds the limits of a line, whatever the starts", () => {
    const xi = predictedXI(squad((e) => (e.element_type === 4 ? { starts: 6 } : e.element_type === 2 ? { starts: 6 } : { starts: 1, minutes: 90 })))!;
    expect(xi.forwards.length).toBeLessThanOrEqual(3);
    expect(xi.defenders.length).toBeLessThanOrEqual(5);
  });

  it("never names a player who has not started this season, however thin the squad", () => {
    // No forward has started, and only three midfielders (ids 9-11) have: a short side, not a padded one.
    const xi = predictedXI(squad((e) => (e.element_type === 4 || (e.element_type === 3 && e.id > 11) ? { starts: 0, minutes: 0 } : {})))!;
    const all = [xi.goalkeeper, ...xi.defenders, ...xi.midfielders, ...xi.forwards];
    expect(all.every((p) => p.player.starts > 0)).toBe(true);
    expect(xi.forwards).toEqual([]);
    expect(xi.open.forwards).toBe(1);
    expect(xi.missing).toBe(11 - all.length);
    expect(xi.missing).toBeGreaterThan(0);
  });

  it("reports open places when injuries leave too few regulars, rather than padding the side", () => {
    // GKs 1-2, DEF 3-8, MID 9-14, FWD 15-18; only ids up to 11 are fit: 1 GK + 5 DEF (capped) + 3 MID = 9 players.
    const xi = predictedXI(squad((e) => (e.id > 11 ? { status: "i", chance_of_playing_next_round: 0 } : {})))!;
    const named = 1 + xi.defenders.length + xi.midfielders.length + xi.forwards.length;
    expect(named).toBe(9);
    expect(xi.missing).toBe(2);
    expect(xi.open.forwards).toBe(1);                                      // a forward is needed and none is fit
    expect(xi.formation).toBeNull();                                       // 5 + 3 + open 1 forward = 9 of 10: no shape to state
  });

  it("counts every fit player who has started, even those a position cap leaves out", () => {
    // 6 defenders + 2 midfielders + 1 forward + 1 keeper are fit (10 players): the cap leaves one defender out, but he is still 'fit'.
    const xi = predictedXI(squad((e) => (e.element_type === 3 && e.id > 10 ? { status: "i", chance_of_playing_next_round: 0 } : e.element_type === 4 && e.id > 15 ? { status: "i", chance_of_playing_next_round: 0 } : e.id === 2 ? { status: "i", chance_of_playing_next_round: 0 } : {})))!;
    expect(xi.fit).toBe(1 + 6 + 2 + 1);
    expect(xi.defenders.length).toBeLessThanOrEqual(5);
  });

  it("never prints a shape with too few defenders: the short line gets open places and the surplus makes room", () => {
    // Only two defenders (ids 3-4) have started; 6 midfielders and 4 forwards are fit.
    const xi = predictedXI(squad((e) => (e.element_type === 2 && e.id > 4 ? { starts: 0, minutes: 0 } : {})))!;
    expect(xi.defenders).toHaveLength(2);
    expect(xi.open.defenders).toBe(1);                                     // a back line needs three
    const outfield = xi.defenders.length + xi.open.defenders + xi.midfielders.length + xi.forwards.length;
    expect(outfield).toBe(10);
    expect(xi.formation).toBe(`3-${xi.midfielders.length}-${xi.forwards.length}`);
    expect(xi.formation).not.toBe("2-5-3");
    expect(xi.missing).toBe(1);
  });

  it("never prints a shape with no forward when one is fit, or with a line over its limit", () => {
    for (const hurt of [() => ({}), (e: FplElement) => (e.element_type === 4 && e.id > 16 ? { status: "i", chance_of_playing_next_round: 0 } : {})]) {
      const xi = predictedXI(squad(hurt))!;
      const [d, m, f] = xi.formation!.split("-").map(Number);
      expect(d).toBeGreaterThanOrEqual(3); expect(d).toBeLessThanOrEqual(5);
      expect(m).toBeGreaterThanOrEqual(2); expect(m).toBeLessThanOrEqual(5);
      expect(f).toBeGreaterThanOrEqual(1); expect(f).toBeLessThanOrEqual(3);
    }
  });

  it("is a full XI with nothing missing when there are enough regulars", () => {
    expect(predictedXI(squad())!.missing).toBe(0);
  });

  it("reports how many matches its rates are over", () => {
    expect(predictedXI(squad())!.matches).toBe(6);
  });

  it("breaks ties deterministically", () => {
    const flat = squad(() => ({ starts: 3, minutes: 270 }));
    expect(predictedXI(flat)).toEqual(predictedXI([...flat].reverse()));
  });
});
