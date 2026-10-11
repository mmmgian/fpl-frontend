import { describe, expect, it } from "vitest";
import {
  bonusFromBps,
  buildTeamSheet,
  currentEvent,
  fixtureState,
  formatMoney,
  gwStatus,
  matchBonus,
  parseGw,
  rankMovement,
} from "@/lib/fpl/derive";
import { bootstrap, event, fixture, live, picks } from "./fixtures";

describe("currentEvent", () => {
  it("prefers the current event", () => {
    expect(currentEvent(bootstrap.events)?.id).toBe(6);
  });
  it("falls back to the latest finished event", () => {
    const evs = [event({ id: 1, is_current: false, finished: true }), event({ id: 2, is_current: false, finished: true }), event({ id: 3, is_current: false })];
    expect(currentEvent(evs)?.id).toBe(2);
  });
  it("returns null before the season starts", () => {
    expect(currentEvent([event({ is_current: false })])).toBeNull();
  });
});

describe("gwStatus", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  it.each([
    [event({ deadline_time: "2026-10-17T10:00:00Z" }), "upcoming"],
    [event(), "live"],
    [event({ finished: true }), "provisional"],
    [event({ finished: true, data_checked: true }), "final"],
  ] as const)("%#", (ev, expected) => expect(gwStatus(ev, now)).toBe(expected));
});

describe("parseGw", () => {
  it("accepts integers in range", () => expect(parseGw("3", 1, 6)).toBe(3));
  it("uses the first value of repeated params", () => expect(parseGw(["2", "5"], 1, 6)).toBe(2));
  it.each([undefined, "", "0", "7", "2.5", "-1", "abc", "3abc"])("rejects %s", (v) => expect(parseGw(v, 1, 6)).toBeNull());
});

describe("rankMovement", () => {
  it("is positive when climbing", () => expect(rankMovement(1, 3)).toBe(2));
  it("is negative when falling", () => expect(rankMovement(4, 2)).toBe(-2));
  it("is null without a previous rank", () => expect(rankMovement(1, 0)).toBeNull());
});

describe("bonusFromBps (official tie rules)", () => {
  const p = (bps: number, id = bps) => ({ element: id, bps });
  const bonuses = (list: { bps: number; element: number }[]) => bonusFromBps(list).map((x) => [x.element, x.bonus]);

  it("awards 3/2/1 to the top three", () => {
    expect(bonuses([p(40), p(30), p(20), p(10)])).toEqual([[40, 3], [30, 2], [20, 1]]);
  });
  it("tie for first: both get 3, next gets 1", () => {
    expect(bonuses([p(40, 1), p(40, 2), p(30), p(20)])).toEqual([[1, 3], [2, 3], [30, 1]]);
  });
  it("tie for second: both get 2, nobody gets 1", () => {
    expect(bonuses([p(40), p(30, 1), p(30, 2), p(20)])).toEqual([[40, 3], [1, 2], [2, 2]]);
  });
  it("tie for third: all tied get 1", () => {
    expect(bonuses([p(40), p(30), p(20, 1), p(20, 2), p(10)])).toEqual([[40, 3], [30, 2], [1, 1], [2, 1]]);
  });
  it("three-way tie for first: all get 3", () => {
    expect(bonuses([p(40, 1), p(40, 2), p(40, 3), p(30)])).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});

describe("fixtureState & matchBonus", () => {
  it("projects bonus from BPS for live matches across both teams", () => {
    const f = fixture();
    expect(fixtureState(f)).toBe("live");
    const { source, rows } = matchBonus(f);
    expect(source).toBe("projected");
    expect(rows.map((r) => [r.element, r.side, r.bonus])).toEqual([
      [3, "h", 3],
      [4, "a", 3],
      [2, "h", 1],
    ]);
  });

  it("uses FPL's bonus stat once present; provisional until finished", () => {
    const stats = [
      { identifier: "bps", h: [{ element: 3, value: 35 }], a: [{ element: 4, value: 33 }] },
      { identifier: "bonus", h: [{ element: 3, value: 3 }], a: [{ element: 4, value: 2 }] },
    ];
    const prov = fixture({ finished_provisional: true, stats });
    expect(fixtureState(prov)).toBe("provisional");
    expect(matchBonus(prov)).toEqual({
      source: "provisional",
      rows: [
        { element: 3, side: "h", bonus: 3, bps: 35 },
        { element: 4, side: "a", bonus: 2, bps: 33 },
      ],
    });
    expect(matchBonus(fixture({ finished: true, finished_provisional: true, stats })).source).toBe("confirmed");
  });

  it("has no bonus before kick-off", () => {
    const f = fixture({ started: false, minutes: 0, team_h_score: null, team_a_score: null, stats: [] });
    expect(fixtureState(f)).toBe("upcoming");
    expect(matchBonus(f)).toEqual({ source: "none", rows: [] });
  });
});

describe("buildTeamSheet", () => {
  const sheet = buildTeamSheet(picks, bootstrap, live);

  it("groups the XI by position in pick order", () => {
    expect(sheet.starters.map((g) => [g.positionId, g.players.map((p) => p.name)])).toEqual([
      [1, ["Raya"]],
      [2, ["Saliba"]],
      [3, ["Saka"]],
      [4, ["Haaland"]],
    ]);
  });

  it("applies multipliers and skips unknown players", () => {
    const haaland = sheet.starters[3].players[0];
    expect(haaland).toMatchObject({ isCaptain: true, basePoints: 9, multiplier: 2, points: 18, club: "MCI", clubCode: 43 });
    expect(sheet.bench.map((p) => p.name)).toEqual(["Ortega", "Gvardiol"]);
  });

  it("only counts players with multiplier > 0", () => {
    expect(sheet.grossPoints).toBe(2 + 6 + 5 + 18);
  });

  it("works without live data", () => {
    const s = buildTeamSheet(picks, bootstrap, null);
    expect(s.grossPoints).toBe(0);
    expect(s.starters[0].players[0].points).toBeNull();
  });
});

it("formats money in tenths", () => expect(formatMoney(997)).toBe("£99.7m"));
