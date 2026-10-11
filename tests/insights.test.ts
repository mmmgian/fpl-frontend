import { describe, expect, it } from "vitest";
import {
  allPlayers, autoSubs, benchInsight, buildTeamSheet, captainInsight, chipContribution, chipStatus, defconProgress, fixtureOutlook,
  freeTransfers, outlookVerdict, ownership, playersRemaining, rotationRisks, seasonForm, squadFlags, teamStates, tenure,
} from "@/lib/domain";
import type { HistoryGameweek, ScheduledFixture } from "@/lib/domain/types";
import { slimBootstrap } from "@/lib/fpl";
import { bootstrap, live, picks } from "./fixtures";

const gwRow = (event: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points: 50, total_points: 50 * event, rank: 1_000_000, overall_rank: 500_000, bank: 5, value: 1000,
  event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});

describe("freeTransfers (ported from the skill's audit ledger)", () => {
  it("is exactly 1 after the first gameweek", () => {
    expect(freeTransfers([gwRow(1, { event_transfers: 15 })], [])).toMatchObject({ available: 1, max: 5 });
  });
  it("banks one per gameweek when none are used, capped at 5", () => {
    const gws = [1, 2, 3, 4, 5, 6, 7, 8].map((e) => gwRow(e));
    expect(freeTransfers(gws.slice(0, 3), []).available).toBe(3);
    expect(freeTransfers(gws, []).available).toBe(5);
  });
  it("uses banked transfers first; the rest of a gameweek's transfers are hits", () => {
    const f = freeTransfers([gwRow(1), gwRow(2), gwRow(3, { event_transfers: 2 }), gwRow(4, { event_transfers: 1 })], []);
    // GW2 entered with 1, none used -> 2 for GW3; GW3 used 2 -> 0 (+1) -> 1; GW4 used 1 -> 0 (+1) -> 1
    expect(f.ledger.map((r) => [r.gw, r.before, r.consumed, r.after])).toEqual([[1, 1, 0, 1], [2, 1, 0, 1], [3, 2, 2, 0], [4, 1, 1, 0]]);
    expect(f.available).toBe(1);
  });
  it("never goes negative when a manager takes a hit", () => {
    const f = freeTransfers([gwRow(1), gwRow(2, { event_transfers: 4, event_transfers_cost: 12 })], []);
    expect(f.ledger[1]).toMatchObject({ before: 1, consumed: 1, after: 0, hit: 12 });
    expect(f.available).toBe(1);
  });
  it("wildcard and free hit gameweeks do not consume the bank", () => {
    const history = [gwRow(1), gwRow(2), gwRow(3, { event_transfers: 9 }), gwRow(4, { event_transfers: 11 })];
    const f = freeTransfers(history, [{ name: "wildcard", event: 3 }, { name: "freehit", event: 4 }]);
    expect(f.ledger.map((r) => r.consumed)).toEqual([0, 0, 0, 0]);
    expect(f.available).toBe(4); // 1 -> 2 -> 3 -> 4 (+1 each week, never spent)
  });
  it("treats a late joiner's first gameweek as squad creation", () => {
    const f = freeTransfers([gwRow(5, { event_transfers: 15 }), gwRow(6)], []);
    expect(f.ledger[0]).toMatchObject({ gw: 5, before: 1, consumed: 0, after: 1 });
    expect(f.available).toBe(2);
  });
  it("copes with no history and unsorted input", () => {
    expect(freeTransfers([], []).available).toBe(1);
    expect(freeTransfers([gwRow(3), gwRow(1), gwRow(2)], []).available).toBe(3);
  });
});

describe("chipStatus", () => {
  const windows = [
    { name: "wildcard", start_event: 2, stop_event: 19 }, { name: "wildcard", start_event: 20, stop_event: 38 },
    { name: "bboost", start_event: 1, stop_event: 19 }, { name: "bboost", start_event: 20, stop_event: 38 },
  ];
  it("marks windows used, available, upcoming, expired", () => {
    const s = chipStatus(windows, [{ name: "bboost", event: 2 }], 7);
    expect(s.map((c) => [c.name, c.start, c.state, c.usedIn])).toEqual([
      ["wildcard", 2, "available", null], ["wildcard", 20, "upcoming", null], ["bboost", 1, "used", 2], ["bboost", 20, "upcoming", null],
    ]);
  });
  it("expires an unused window once it has closed", () => {
    expect(chipStatus(windows, [], 21).map((c) => c.state)).toEqual(["expired", "available", "expired", "available"]);
  });
  it("only counts a play inside the matching window, and labels chips", () => {
    const s = chipStatus(windows, [{ name: "wildcard", event: 25 }], 26);
    expect(s.find((c) => c.name === "wildcard" && c.start === 20)).toMatchObject({ state: "used", usedIn: 25, label: "Wildcard" });
    expect(s.find((c) => c.name === "wildcard" && c.start === 2)!.state).toBe("expired");
  });
  it("handles no windows", () => expect(chipStatus([], [], 5)).toEqual([]));
});

describe("seasonForm", () => {
  const history = [
    gwRow(1, { points: 60, overall_rank: 900_000, value: 1000, bank: 5, points_on_bench: 4, event_transfers: 15 }),
    gwRow(2, { points: 42, event_transfers_cost: 4, event_transfers: 2, overall_rank: 400_000, points_on_bench: 6 }),
    gwRow(3, { points: 70, overall_rank: 175_000, value: 1017, bank: 3 }),
  ];
  it("reports net points (after hits), extremes, ranks and value", () => {
    const f = seasonForm(history)!;
    expect(f.gameweeks.map((g) => g.net)).toEqual([60, 38, 70]);
    expect(f).toMatchObject({
      best: { gw: 3, net: 70 }, worst: { gw: 2, net: 38 }, hitPoints: 4, benchPoints: 10, transfers: 17,
      firstRank: 900_000, latestRank: 175_000, bestRank: { gw: 3, rank: 175_000 }, value: { start: 1005, now: 1020 },
    });
    expect(f.average).toBeCloseTo((60 + 38 + 70) / 3);
  });
  it("is null with no gameweeks and tolerates a missing rank", () => {
    expect(seasonForm([])).toBeNull();
    expect(seasonForm([gwRow(1, { overall_rank: null })])).toMatchObject({ bestRank: null, firstRank: null });
  });
});

describe("tenure", () => {
  it("counts earlier seasons and finds the best finish", () => {
    const t = tenure([
      { season_name: "2021/22", total_points: 2000, rank: 100_000 },
      { season_name: "2019/20", total_points: 1700, rank: 4_000_000 },
      { season_name: "2020/21", total_points: 1900, rank: 900_000 },
    ]);
    expect(t).toEqual({ seasons: 3, firstSeason: "2019/20", best: { season: "2021/22", rank: 100_000, points: 2000 } });
  });
  it("is empty for a first-timer", () => expect(tenure([])).toEqual({ seasons: 0, firstSeason: null, best: null }));
});

describe("this gameweek's squad", () => {
  const sheet = buildTeamSheet(picks, bootstrap, live);
  // fixtures: Haaland (captain, x2) 9, Saka 5, Saliba 6, Raya 2

  it("captain insight: regret against the best starter, multiplier applied", () => {
    expect(captainInsight(sheet)).toMatchObject({
      captain: { name: "Haaland", base: 9, multiplier: 2, points: 18 },
      vice: { name: "Saliba", base: 6 },
      best: { name: "Haaland", base: 9 },
      state: "played",
      regret: 0,
      provisional: false,
    });
    expect(captainInsight(sheet, null, true)!.provisional).toBe(true); // gameweek still in progress: "best so far"
  });
  it("captain regret counts the multiplier", () => {
    const worse = buildTeamSheet({ ...picks, picks: picks.picks.map((p) => ({ ...p, is_captain: p.element === 1, multiplier: p.element === 1 ? 2 : p.multiplier })) }, bootstrap, live);
    expect(captainInsight(worse)).toMatchObject({ captain: { name: "Raya", base: 2 }, best: { name: "Haaland", base: 9 }, regret: (9 - 2) * 2 });
  });
  it("distinguishes a captain who hasn't played yet from one who never will", () => {
    const dnp = buildTeamSheet(picks, bootstrap, { elements: live.elements.map((e) => (e.id === 4 ? { ...e, stats: { ...e.stats, minutes: 0, total_points: 0 } } : e)) });
    const club = (state: "upcoming" | "live" | "finished") => new Map([[2, state]]); // Haaland's club is Man City (team 2)
    expect(captainInsight(dnp, club("upcoming"))).toMatchObject({ state: "waiting", regret: null });
    expect(captainInsight(dnp, club("live"))).toMatchObject({ state: "waiting", regret: null });
    expect(captainInsight(dnp, club("finished"))).toMatchObject({ state: "unused", regret: null });
    expect(captainInsight(dnp)).toMatchObject({ state: "waiting" }); // match state unknown: don't claim he didn't play
    expect(captainInsight(buildTeamSheet(picks, bootstrap, null))).toBeNull();
  });

  it("bench insight lists bench points, best first", () => {
    expect(benchInsight(sheet, null)).toEqual({ points: 3, players: [{ name: "Gvardiol", points: 2 }, { name: "Ortega", points: 1 }], counted: false });
    expect(benchInsight(sheet, "bboost")?.counted).toBe(true);
  });
  it("has nothing to say about the bench without live points (not '0 pts')", () => {
    expect(benchInsight(buildTeamSheet(picks, bootstrap, null), null)).toBeNull();
    expect(chipContribution(buildTeamSheet(picks, bootstrap, null), "bboost")).toBeNull();
  });
  it("isolates chip value: bench boost = bench points, triple captain = one extra captain copy", () => {
    expect(chipContribution(sheet, "bboost")).toEqual({ chip: "bboost", points: 3 });
    expect(chipContribution(sheet, "3xc")).toEqual({ chip: "3xc", points: 9 });
    // the triple passes to the vice-captain if the captain doesn't play: not attributable, so no claim
    const dnp = buildTeamSheet(picks, bootstrap, { elements: live.elements.map((e) => (e.id === 4 ? { ...e, stats: { ...e.stats, minutes: 0, total_points: 0 } } : e)) });
    expect(chipContribution(dnp, "3xc")).toBeNull();
    expect(chipContribution(sheet, "wildcard")).toBeNull();
    expect(chipContribution(sheet, null)).toBeNull();
  });

  it("maps automatic substitutions to player names and points", () => {
    expect(autoSubs(sheet, [{ element_in: 5, element_out: 1 }])).toEqual([{ in: { name: "Ortega", points: 1 }, out: { name: "Raya", points: 2 } }]);
    expect(autoSubs(sheet, [{ element_in: 777, element_out: 1 }])).toEqual([]); // unknown player ignored
    expect(autoSubs(sheet, undefined)).toEqual([]);
  });
});

describe("live matchday", () => {
  const f = (h: number, a: number, started: boolean, finished: boolean, provisional = false, event = 6): ScheduledFixture => ({
    id: h * 100 + a, event, team_h: h, team_a: a, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: null,
    started, finished, finished_provisional: provisional,
  });

  it("teamStates: upcoming, live, finished, and double gameweeks", () => {
    const s = teamStates([f(1, 2, true, false), f(3, 4, false, false), f(5, 6, true, true), f(5, 7, false, false), f(8, 9, true, false, true), f(1, 9, true, true, false, 5)], 6);
    expect(Object.fromEntries(s)).toEqual({ 1: "live", 2: "live", 3: "upcoming", 4: "upcoming", 5: "upcoming", 6: "finished", 7: "upcoming", 8: "finished", 9: "finished" });
  });

  const withMinutes = (mins: Record<number, number>, status: Record<number, string> = {}) =>
    buildTeamSheet(
      { ...picks, picks: picks.picks.filter((p) => p.element !== 999) },
      { ...bootstrap, elements: bootstrap.elements.map((e) => ({ ...e, status: status[e.id] ?? "a" })) },
      { elements: live.elements.map((e) => ({ ...e, stats: { ...e.stats, minutes: mins[e.id] ?? e.stats.minutes } })) },
    );

  it("rotation risk: fit, club finished, 0 minutes", () => {
    const sheet = withMinutes({ 3: 0, 6: 0 }); // Saka (ARS) starter, Gvardiol (MCI) bench
    const states = new Map([[1, "finished" as const], [2, "live" as const]]);
    expect(rotationRisks(sheet, states)).toEqual([{ name: "Saka", club: "ARS", wasStarter: true }]); // Gvardiol's club still playing
  });
  it("rotation risk works on the slimmed bootstrap the app really uses (status 'a' is omitted there)", () => {
    const slim = slimBootstrap({ ...bootstrap, elements: bootstrap.elements.map((e) => ({ ...e, status: "a" })) });
    expect(slim.elements.every((e) => e.status === undefined)).toBe(true); // the default really is dropped
    const sheet = buildTeamSheet(picks, slim, { elements: live.elements.map((e) => ({ ...e, stats: { ...e.stats, minutes: e.id === 3 ? 0 : e.stats.minutes } })) });
    expect(sheet.starters.flatMap((g) => g.players).every((p) => p.status === "a")).toBe(true);
    expect(rotationRisks(sheet, new Map([[1, "finished" as const]]))).toEqual([{ name: "Saka", club: "ARS", wasStarter: true }]);
  });
  it("rotation risk ignores the bench goalkeeper, who almost never plays", () => {
    const sheet = withMinutes({ 5: 0 }); // Ortega: bench goalkeeper (slot 12)
    expect(rotationRisks(sheet, new Map([[2, "finished" as const]]))).toEqual([]);
  });
  it("rotation risk ignores injured players and clubs still to play", () => {
    const sheet = withMinutes({ 3: 0 }, { 3: "i" });
    expect(rotationRisks(sheet, new Map([[1, "finished"]]))).toEqual([]);
    expect(rotationRisks(withMinutes({ 3: 0 }), new Map([[1, "upcoming"]]))).toEqual([]);
  });

  it("players remaining: weighted by multiplier, bench excluded unless boosted", () => {
    const sheet = withMinutes({ 4: 0, 3: 0, 2: 45 }); // Haaland (captain x2) and Saka haven't played
    const states = new Map([[1, "upcoming" as const], [2, "live" as const]]);
    expect(playersRemaining(sheet, states)).toEqual({ count: 2, effective: 3, played: 2 }); // Raya and Saliba have played
    const done = new Map([[1, "finished" as const], [2, "finished" as const]]);
    expect(playersRemaining(sheet, done).count).toBe(0);
  });
  it("counts bench players under Bench Boost (multiplier 1)", () => {
    const boosted = buildTeamSheet({ ...picks, picks: picks.picks.map((p) => ({ ...p, multiplier: Math.max(1, p.multiplier) })) }, bootstrap, { elements: live.elements.map((e) => ({ ...e, stats: { ...e.stats, minutes: 0 } })) });
    const r = playersRemaining(boosted, new Map([[1, "upcoming"], [2, "upcoming"]]));
    expect(r.count).toBe(6); // all 6 known players count (id 999 is not in the game); nobody has played
  });

  it("DefCon progress uses 10 for defenders and 12 for midfielders/forwards, goalkeepers never", () => {
    const sheet = buildTeamSheet(picks, bootstrap, {
      elements: live.elements.map((e) => ({ ...e, stats: { ...e.stats, defensive_contribution: { 1: 8, 2: 10, 3: 6, 4: 12 }[e.id] ?? 0 } })),
    });
    expect(defconProgress(sheet)).toEqual([
      { name: "Haaland", value: 12, threshold: 12, reached: true, matches: 1 },
      { name: "Saliba", value: 10, threshold: 10, reached: true, matches: 1 },
      { name: "Saka", value: 6, threshold: 12, reached: false, matches: 1 },
    ]); // Raya (GK) excluded; both 100% complete, so the higher count first, then Saka at 50%
  });
});

describe("squad health and outlook", () => {
  const sheetWith = (over: Record<number, Partial<{ status: string; news: string; chance: number | null; own: string }>>) =>
    buildTeamSheet(
      picks,
      {
        ...bootstrap,
        elements: bootstrap.elements.map((e) => ({
          ...e, status: over[e.id]?.status ?? "a", news: over[e.id]?.news ?? "",
          chance_of_playing_next_round: over[e.id]?.chance === undefined ? null : over[e.id]!.chance,
          selected_by_percent: over[e.id]?.own,
        })),
      },
      live,
    );

  it("flags anything but fully available, starters first", () => {
    const flags = squadFlags(sheetWith({ 5: { status: "i", news: "Knee", chance: 0 }, 3: { status: "d", news: "Knock", chance: 50 }, 2: { chance: 75 } }));
    expect(flags.map((f) => [f.name, f.label, f.chance, f.wasStarter])).toEqual([
      ["Saliba", "Doubtful", 75, true], ["Saka", "Doubtful", 50, true], ["Ortega", "Injured", 0, false],
    ]);
  });
  it("flags nobody for a healthy squad", () => expect(squadFlags(sheetWith({}))).toEqual([]));

  it("ownership: XI average and the rarest sub-10% picks", () => {
    const o = ownership(sheetWith({ 1: { own: "40.0" }, 2: { own: "9.5" }, 3: { own: "60.0" }, 4: { own: "3.2" } }))!;
    expect(o.average).toBeCloseTo((40 + 9.5 + 60 + 3.2) / 4);
    expect(o.differentials).toEqual([{ name: "Haaland", ownership: 3.2 }, { name: "Saliba", ownership: 9.5 }]);
    expect(ownership(sheetWith({}))).toBeNull(); // no ownership data
  });

  it("fixture outlook: weighted by starters per club, with easiest and hardest club", () => {
    const sheet = sheetWith({});
    const fx = (event: number, h: number, a: number, hd: number, ad: number): ScheduledFixture => ({
      id: event * 10 + h, event, team_h: h, team_a: a, team_h_difficulty: hd, team_a_difficulty: ad, kickoff_time: null, started: false, finished: false, finished_provisional: false,
    });
    // Arsenal (3 starters: Raya, Saliba, Saka) face 2,2 ; Man City (1 starter: Haaland) face 5,5
    const o = fixtureOutlook(sheet, [fx(7, 1, 2, 2, 5), fx(8, 2, 1, 5, 2), fx(20, 1, 2, 1, 1)], 7, 2)!;
    expect(o).toMatchObject({ fromGw: 7, toGw: 8, easiest: { club: "ARS", average: 2 }, hardest: { club: "MCI", average: 5 } });
    expect(o.average).toBeCloseTo((2 * 3 + 5 * 1) / 4);
    expect(fixtureOutlook(sheet, [], 7)).toBeNull();
  });
  it("outlook verdict bands", () => {
    expect([2, 2.6, 2.7, 3.4, 3.5, 5].map(outlookVerdict)).toEqual(["Kind", "Kind", "Mixed", "Mixed", "Tough", "Tough"]);
  });
  it("allPlayers returns starters then bench", () => {
    const names = allPlayers(sheetWith({})).map((p) => p.slot);
    expect(names).toEqual([...names].sort((a, b) => a - b));
  });
});

describe("review fixes: derived facts only say what the data supports", () => {
  it("season form leaves an unfinished gameweek out of the points statistics, but keeps its transfers", () => {
    const history = [gwRow(1, { points: 60 }), gwRow(2, { points: 50 }), gwRow(3, { points: 4, event_transfers: 2, event_transfers_cost: 4 })]; // GW3 is live: 4 points so far
    const settled = seasonForm(history, 2)!;
    expect(settled.gameweeks.map((g) => g.gw)).toEqual([1, 2]);
    expect(settled).toMatchObject({ average: 55, worst: { gw: 2, net: 50 }, transfers: 2, hitPoints: 4 });
    expect(seasonForm(history, 0)).toBeNull(); // nothing finished yet
    expect(seasonForm(history)!.worst.gw).toBe(3); // without a cut-off everything counts
  });

  it("free transfers are 'verified' only when the hits agree with the ledger", () => {
    // After a quiet GW2 there are 2 banked, so 3 transfers in GW3 is one over: a 4-point hit.
    const ok = freeTransfers([gwRow(1), gwRow(2), gwRow(3, { event_transfers: 3, event_transfers_cost: 4 })], []);
    expect(ok.verified).toBe(true);
    // 4 transfers with only 2 banked should cost 8; a 4-point hit means FPL granted extra free transfers.
    const topUp = freeTransfers([gwRow(1), gwRow(2), gwRow(3, { event_transfers: 4, event_transfers_cost: 4 })], []);
    expect(topUp.verified).toBe(false);
    const chipWeek = freeTransfers([gwRow(1), gwRow(2, { event_transfers: 9, event_transfers_cost: 0 })], [{ name: "wildcard", event: 2 }]);
    expect(chipWeek.verified).toBe(true);
    expect(freeTransfers([gwRow(1, { event_transfers: 15, event_transfers_cost: 0 })], []).verified).toBe(true); // squad creation is exempt
  });

  it("DefCon never claims the +2 in a double gameweek, where live stats add both matches", () => {
    const sheet = buildTeamSheet(picks, bootstrap, { elements: live.elements.map((e) => ({ ...e, stats: { ...e.stats, defensive_contribution: e.id === 2 ? 13 : 0 } })) });
    const single = defconProgress(sheet, new Map([[1, 1]]));
    expect(single).toEqual([{ name: "Saliba", value: 13, threshold: 10, reached: true, matches: 1 }]);
    const double = defconProgress(sheet, new Map([[1, 2]]));
    expect(double).toEqual([{ name: "Saliba", value: 13, threshold: 10, reached: false, matches: 2 }]);
    expect(defconProgress(sheet)[0].matches).toBe(1); // unknown fixtures: treated as a single match
  });
});
