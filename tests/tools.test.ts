import { describe, expect, it } from "vitest";
import {
  CLOSE_SHARE, LIKELY_SHARE, bestXI, countdown, effectiveOwnership, eoTiers, expectedPoints, filterPrices, likelyToPlay, nextDeadline, opponentsIn, priceRows, priceStatus,
} from "@/lib/domain";
import type { FplElement, FplEvent, PositionId, ScheduledFixture } from "@/lib/domain/types";

const ev = (id: number, deadline: string): FplEvent => ({ id, name: `Gameweek ${id}`, deadline_time: deadline, is_current: false, is_next: false, finished: false, data_checked: false });
const NOW = new Date("2026-10-12T12:00:00Z");

describe("nextDeadline", () => {
  it("is the earliest deadline still ahead, whatever order the events come in", () => {
    const events = [ev(9, "2026-10-31T10:00:00Z"), ev(6, "2026-10-10T10:00:00Z"), ev(8, "2026-10-23T10:00:00Z"), ev(7, "2026-10-17T10:00:00Z")];
    expect(nextDeadline(events, NOW)).toEqual({ gw: 7, name: "Gameweek 7", at: "2026-10-17T10:00:00Z" });
  });
  it("is null when every deadline has passed", () => expect(nextDeadline([ev(1, "2026-08-01T10:00:00Z")], NOW)).toBeNull());
  it("treats a deadline that is exactly now as passed", () => expect(nextDeadline([ev(1, NOW.toISOString())], NOW)).toBeNull());
});

describe("countdown", () => {
  it("splits the time left into days, hours, minutes and seconds", () => {
    const left = (5 * 86400 + 9 * 3600 + 5 * 60 + 28) * 1000;
    expect(countdown(new Date(NOW.getTime() + left), NOW)).toEqual({ days: 5, hours: 9, minutes: 5, seconds: 28, totalMs: left });
  });
  it("never goes negative once the deadline is past", () => {
    expect(countdown("2026-10-01T00:00:00Z", NOW)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
  });
  it("drops the fraction of a second", () => expect(countdown(new Date(NOW.getTime() + 1999), NOW).seconds).toBe(1));
});

describe("opponentsIn", () => {
  const fx = (event: number, h: number, a: number, dh = 2, da = 4): ScheduledFixture => ({ id: event * 100 + h, event, team_h: h, team_a: a, team_h_difficulty: dh, team_a_difficulty: da, kickoff_time: null, started: false, finished: false, finished_provisional: false });
  const teams = [{ id: 1, short_name: "ARS" }, { id: 2, short_name: "CHE" }, { id: 3, short_name: "LIV" }];
  it("gives each club its opponent, venue and difficulty for that gameweek only", () => {
    const m = opponentsIn([fx(7, 1, 2), fx(8, 3, 1)], teams, 7);
    expect(m.get(1)).toEqual([{ short: "CHE", home: true, difficulty: 2 }]);
    expect(m.get(2)).toEqual([{ short: "ARS", home: false, difficulty: 4 }]);
    expect(m.has(3)).toBe(false);                      // LIV play in GW8 only
  });
  it("gives a club two entries in a double gameweek", () => expect(opponentsIn([fx(7, 1, 2), fx(7, 3, 1)], teams, 7).get(1)).toHaveLength(2));
});

describe("likelyToPlay", () => {
  it("accepts the available and the doubtful with a three in four chance, and nobody else", () => {
    expect(likelyToPlay({ status: "a" })).toBe(true);
    expect(likelyToPlay({})).toBe(true);                                                  // the cached bootstrap omits the default
    expect(likelyToPlay({ status: "d", chance_of_playing_next_round: 75 })).toBe(true);
    expect(likelyToPlay({ status: "d", chance_of_playing_next_round: 50 })).toBe(false);
    expect(likelyToPlay({ status: "d" })).toBe(false);
    for (const status of ["i", "s", "u", "n"]) expect(likelyToPlay({ status, chance_of_playing_next_round: 100 })).toBe(false);
  });
});

// ---- best XI, checked against an exhaustive search

/** A small deterministic random generator, so a failing case can be reproduced. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const player = (id: number, pos: PositionId, ep: number, extra: Partial<FplElement> = {}): FplElement => ({ id, web_name: `P${id}`, team: (id % 3) + 1, element_type: pos, ep_next: ep.toFixed(1), ...extra });
const teams = [1, 2, 3].map((id) => ({ id, code: id * 10, name: `T${id}`, short_name: `T${id}` }));

function bruteForce(elements: FplElement[]): number {
  const by = (pos: PositionId) => elements.filter((e) => e.element_type === pos && likelyToPlay(e));
  const choose = <T,>(xs: T[], k: number): T[][] => (k === 0 ? [[]] : xs.flatMap((x, i) => choose(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest])));
  const total = (xs: FplElement[]) => xs.reduce((s, e) => s + expectedPoints(e), 0);
  let best = -1;
  for (const [d, m, f] of [[3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 2, 3], [5, 3, 2], [5, 4, 1]]) {
    for (const g of choose(by(1), 1)) for (const D of choose(by(2), d)) for (const M of choose(by(3), m)) for (const F of choose(by(4), f)) best = Math.max(best, total([...g, ...D, ...M, ...F]));
  }
  return best;
}

/** Enough players to field a team: 2 keepers, 5 defenders, 5 midfielders, 3 forwards, each scoring `ep(i)`. */
const squad = (ep: (id: number, pos: PositionId) => number, extra: (id: number) => Partial<FplElement> = () => ({})): FplElement[] => {
  let id = 1;
  const make = (pos: PositionId, n: number) => Array.from({ length: n }, () => { const i = id++; return player(i, pos, ep(i, pos), extra(i)); });
  return [...make(1, 2), ...make(2, 5), ...make(3, 5), ...make(4, 3)];
};

describe("bestXI", () => {
  const pool = (seed: number) => {
    const r = rng(seed);
    let id = 1;
    const make = (pos: PositionId, n: number) => Array.from({ length: n }, () => player(id++, pos, Math.round(r() * 120) / 10, r() < 0.15 ? { status: "i" } : {}));
    return [...make(1, 3), ...make(2, 6), ...make(3, 6), ...make(4, 4)];
  };

  it("matches an exhaustive search on many random pools (before the captain's double)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const elements = pool(seed);
      const xi = bestXI({ elements, teams }, new Map())!;
      const summed = xi.lines.flatMap((l) => l.players).reduce((s, p) => s + p.ep, 0);
      expect(summed, `seed ${seed}`).toBeCloseTo(bruteForce(elements), 5);
    }
  });

  it("is always a legal formation of eleven: one keeper, 3-5 defenders, 2-5 midfielders, 1-3 forwards", () => {
    for (let seed = 100; seed < 130; seed++) {
      const xi = bestXI({ elements: pool(seed), teams }, new Map())!;
      const n = Object.fromEntries(xi.lines.map((l) => [l.positionId, l.players.length]));
      expect(n[1]).toBe(1);
      expect(n[2]).toBeGreaterThanOrEqual(3); expect(n[2]).toBeLessThanOrEqual(5);
      expect(n[3]).toBeGreaterThanOrEqual(2); expect(n[3]).toBeLessThanOrEqual(5);
      expect(n[4]).toBeGreaterThanOrEqual(1); expect(n[4]).toBeLessThanOrEqual(3);
      expect(n[1] + n[2] + n[3] + n[4]).toBe(11);
      expect(xi.formation).toBe(`${n[2]}-${n[3]}-${n[4]}`);
    }
  });

  it("never picks a player who is not going to play", () => {
    const elements = [...squad(() => 5), player(99, 2, 99, { status: "i" })];       // the best-scoring defender is injured
    const ids = bestXI({ elements, teams }, new Map())!.lines.flatMap((l) => l.players.map((p) => p.id));
    expect(ids).not.toContain(99);
  });

  it("makes the highest scorer captain and the next vice-captain, and counts the captain twice in the total", () => {
    const elements = squad((id, pos) => (id === 14 ? 10 : id === 15 ? 9 : pos === 4 ? 3 : 5));   // two standout forwards (ids 14, 15)
    const xi = bestXI({ elements, teams }, new Map())!;
    const all = xi.lines.flatMap((l) => l.players);
    expect(all.find((p) => p.captain)?.id).toBe(14);
    expect(all.find((p) => p.vice)?.id).toBe(15);
    expect(all.filter((p) => p.captain || p.vice)).toHaveLength(2);
    expect(xi.total).toBeCloseTo(all.reduce((s, p) => s + p.ep, 0) + 10, 5);        // the captain's points count twice
  });

  it("carries each player's opponents, club and code", () => {
    const opp = new Map([[2, [{ short: "ARS", home: true, difficulty: 3 }]]]);
    const p = bestXI({ elements: squad(() => 5), teams }, opp)!.lines.flatMap((l) => l.players).find((x) => x.teamId === 2)!;
    expect(p.opponents).toEqual([{ short: "ARS", home: true, difficulty: 3 }]);
    expect(p.club).toBe("T2");
    expect(p.clubCode).toBe(20);
  });

  it("is null when there are not enough players to field a team", () => {
    expect(bestXI({ elements: [player(1, 1, 3), player(2, 2, 3)], teams }, new Map())).toBeNull();
    expect(bestXI({ elements: [], teams }, new Map())).toBeNull();
  });
});

describe("price pressure", () => {
  const P = 10_000_000;                                                   // everyone playing: 0.5% is 50,000 managers, 0.25% is 25,000
  const status = (share: number, net: number, costChangeEvent = 0) => priceStatus({ share, net, costChangeEvent, totalPlayers: P });
  it("calls a player likely to rise, close, steady, close to falling or likely to fall, by share of owners AND a real number of managers", () => {
    expect(status(LIKELY_SHARE, 60_000)).toBe("likelyRise");
    expect(status(CLOSE_SHARE, 30_000)).toBe("closeRise");
    expect(status(CLOSE_SHARE - 0.1, 90_000)).toBe("steady");
    expect(status(0, 0)).toBe("steady");
    expect(status(-CLOSE_SHARE, -30_000)).toBe("closeFall");
    expect(status(-LIKELY_SHARE, -60_000)).toBe("likelyFall");
  });
  it("needs real volume: a big share of a tiny ownership is not a price move", () => {
    expect(status(76.8, 17_000)).toBe("steady");                           // 17k managers is below the 25k a "close" call needs
    expect(status(10, 40_000)).toBe("closeRise");                           // enough for close, not for likely
    expect(status(-10, -40_000)).toBe("closeFall");
  });
  it("needs real share: a lot of transfers into a hugely owned player is not enough on its own", () => {
    expect(status(1.5, 300_000)).toBe("steady");
  });
  it("reports a step already taken this gameweek as it happened, whatever the numbers", () => {
    expect(status(9, 900_000, 1)).toBe("rose");
    expect(status(-9, -900_000, -1)).toBe("fell");
    expect(status(0, 0, 1)).toBe("rose");
  });
  it("scales with the number of players, so the same transfers count for more in a small game", () => {
    expect(priceStatus({ share: 5, net: 6_000, costChangeEvent: 0, totalPlayers: 1_000_000 })).toBe("likelyRise");   // 0.6% of a million
    expect(priceStatus({ share: 5, net: 6_000, costChangeEvent: 0, totalPlayers: 10_000_000 })).toBe("steady");
    expect(priceStatus({ share: 5, net: 6_000, costChangeEvent: 0, totalPlayers: 0 })).toBe("likelyRise");           // no player count known: share alone
  });

  const bootstrap = {
    total_players: 10_000_000,
    teams: [{ id: 1, code: 3, name: "Arsenal", short_name: "ARS" }],
    elements: [
      player(1, 3, 5, { team: 1, now_cost: 100, selected_by_percent: "10.0", transfers_in_event: 500_000, transfers_out_event: 50_000 }), // net 450k of 1M owners = 45%
      player(2, 2, 5, { team: 1, now_cost: 50, selected_by_percent: "20.0", transfers_in_event: 10_000, transfers_out_event: 0 }),          // 0.5%
      player(3, 4, 5, { team: 1, now_cost: 80, selected_by_percent: "5.0", transfers_in_event: 0, transfers_out_event: 60_000 }),             // -12%
      player(4, 1, 5, { team: 1, now_cost: 40, selected_by_percent: "0.0", transfers_in_event: 100, transfers_out_event: 0 }),                 // nobody owns him
    ],
  };
  it("works out each player's net share of his owners, and orders the likely risers first and the likely fallers last", () => {
    const rows = priceRows(bootstrap);
    expect(rows.map((r) => [r.id, r.status])).toEqual([[1, "likelyRise"], [2, "steady"], [4, "steady"], [3, "likelyFall"]]);   // 2: 10k is 0.5% of his owners, far too few managers
    expect(rows[0]).toMatchObject({ net: 450_000, share: 45, owned: 10, price: 100 });
    expect(rows.find((r) => r.id === 3)?.share).toBe(-12);
  });
  it("does not divide by zero for a player nobody owns", () => expect(priceRows(bootstrap).find((r) => r.id === 4)?.share).toBe(0));
  it("filters by name, position, club and 'moving only'", () => {
    const rows = priceRows(bootstrap);
    expect(filterPrices(rows, { q: "p3" }).map((r) => r.id)).toEqual([3]);
    expect(filterPrices(rows, { q: "  P3 " }).map((r) => r.id)).toEqual([3]);            // case and spaces don't matter
    expect(filterPrices(rows, { position: 2 }).map((r) => r.id)).toEqual([2]);
    expect(filterPrices(rows, { team: 1 })).toHaveLength(4);
    expect(filterPrices(rows, { team: 99 })).toHaveLength(0);
    expect(filterPrices(rows, { movingOnly: true }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterPrices(rows, {})).toHaveLength(4);
  });
});

describe("effectiveOwnership", () => {
  const pick = (element: number, multiplier: number, is_captain = false) => ({ element, multiplier, is_captain });
  it("counts a captain twice, so a player can be owned by more than everyone", () => {
    const rows = effectiveOwnership([[pick(1, 2, true), pick(2, 1)], [pick(1, 1), pick(2, 2, true)]]);
    expect(rows.find((r) => r.id === 1)).toEqual({ id: 1, eo: 150, started: 100, captained: 50 });   // (2 + 1) / 2 managers
    expect(rows.find((r) => r.id === 2)).toEqual({ id: 2, eo: 150, started: 100, captained: 50 });
  });
  it("counts triple captain three times and a benched player not at all", () => {
    const rows = effectiveOwnership([[pick(1, 3, true), pick(2, 0)], [pick(1, 1), pick(2, 0)]]);
    expect(rows.find((r) => r.id === 1)?.eo).toBe(200);
    expect(rows.find((r) => r.id === 2)).toBeUndefined();
  });
  it("is the share of managers, one decimal, biggest first", () => {
    const rows = effectiveOwnership([[pick(1, 1)], [pick(1, 1)], [pick(2, 1)]]);
    expect(rows.map((r) => [r.id, r.eo])).toEqual([[1, 66.7], [2, 33.3]]);
  });
  it("is empty for no managers", () => expect(effectiveOwnership([])).toEqual([]));
});

describe("eoTiers", () => {
  it("offers the top four, the top ten and everyone for a league big enough for each", () => {
    expect(eoTiers(21)).toEqual([{ key: "top4", size: 4 }, { key: "top10", size: 10 }, { key: "all", size: 0 }]);
  });
  it("leaves out a group that would just be everyone", () => {
    expect(eoTiers(10)).toEqual([{ key: "top4", size: 4 }, { key: "all", size: 0 }]);
    expect(eoTiers(4)).toEqual([{ key: "all", size: 0 }]);
  });
});
