/**
 * Fortify: the Bonus page under the feeds FPL actually sends. Ties at every position, a player listed twice, stat
 * blocks with a side missing, unreadable kick-off times, a double gameweek, and a past week with an abandoned match.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FixtureBonusCard } from "@/components/views/FixtureBonusCard";
import { bonusFromBps, bonusRace, bpsRanking, compareByKickoff, matchBonus, matchEvents } from "@/lib/domain";
import type { Fixture } from "@/lib/domain/types";
import { createBonusService } from "@/lib/services/bonus";
import { bootstrap, event, fixture } from "./fixtures";
import { expectNoAxeViolations } from "./axe";

const bps = (h: [number, number][], a: [number, number][] = []) => [
  { identifier: "bps", h: h.map(([element, value]) => ({ element, value })), a: a.map(([element, value]) => ({ element, value })) },
];
const bonusOf = (f: Fixture) => Object.fromEntries(matchBonus(f).rows.map((r) => [r.element, r.bonus]));

describe("FPL's tie rules", () => {
  it.each([
    ["two level first: both 3, next 1", [[1, 30], [2, 30], [3, 20], [4, 10]], { 1: 3, 2: 3, 3: 1 }],
    ["three level first: all 3, nobody else", [[1, 30], [2, 30], [3, 30], [4, 20]], { 1: 3, 2: 3, 3: 3 }],
    ["two level second: 3, then both 2", [[1, 40], [2, 30], [3, 30], [4, 20]], { 1: 3, 2: 2, 3: 2 }],
    ["level third: 3, 2, then both 1", [[1, 40], [2, 30], [3, 20], [4, 20], [5, 10]], { 1: 3, 2: 2, 3: 1, 4: 1 }],
    ["four level first: all 3", [[1, 30], [2, 30], [3, 30], [4, 30]], { 1: 3, 2: 3, 3: 3, 4: 3 }],
  ] as [string, [number, number][], Record<number, number>][])("%s", (_, entries, expected) => {
    const f = fixture({ stats: bps(entries.slice(0, 2), entries.slice(2)) });
    expect(bonusOf(f)).toEqual(expected);
  });

  it("is the same whichever order the feed lists players in", () => {
    const entries = [{ bps: 30, id: 1 }, { bps: 20, id: 2 }, { bps: 30, id: 3 }, { bps: 10, id: 4 }];
    expect(bonusFromBps(entries).map((e) => [e.id, e.bonus]).sort()).toEqual(bonusFromBps([...entries].reverse()).map((e) => [e.id, e.bonus]).sort());
  });
});

describe("feeds that aren't the shape the types promise", () => {
  it("survives a stat block with a side missing, null or not a list", () => {
    const f = fixture({
      stats: [
        { identifier: "bps", h: [{ element: 3, value: 20 }], a: null as never },
        { identifier: "bonus", h: undefined as never, a: "x" as never },
        { identifier: "goals_scored", h: [{ element: 3, value: 1 }], a: {} as never },
      ],
    });
    expect(() => matchBonus(f)).not.toThrow();
    expect(bpsRanking(f)).toEqual([{ element: 3, side: "h", bps: 20 }]);
    expect(matchEvents(f).goals).toEqual([{ element: 3, side: "h", count: 1 }]);
  });

  it("drops entries without a player or a number", () => {
    const f = fixture({ stats: [{ identifier: "bps", h: [{ element: 3, value: 20 }, { element: null, value: 50 }, { element: 2, value: "lots" }, null], a: [{ element: 4, value: Number.NaN }] } as never] });
    expect(bpsRanking(f).map((e) => e.element)).toEqual([3]);
  });

  it("counts a player FPL lists twice once (no double bonus, no duplicate rows)", () => {
    const f = fixture({ stats: bps([[3, 30], [3, 30], [2, 25]], [[4, 20], [6, 10]]) });
    const ranked = bpsRanking(f);
    expect(ranked.map((e) => e.element)).toEqual([3, 2, 4, 6]);
    expect(bonusOf(f)).toEqual({ 3: 3, 2: 2, 4: 1 });
    expect(bonusRace(f)?.runnerUp?.element).toBe(2);
  });

  it("renders a card from a feed with a repeated player without duplicate keys", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture({ stats: bps([[3, 30], [3, 30], [2, 25]], [[4, 20]]) });
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [f] }, { now: () => new Date("2026-10-10T13:00:00Z") }).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    const { container } = render(<FixtureBonusCard card={model.fixtures[0]} />);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/i);
    errors.mockRestore();
    expect(screen.getAllByText("Saka")).toHaveLength(1);
    await expectNoAxeViolations(container);
  });
});

describe("kick-off order", () => {
  it("puts an unreadable kick-off after every real one and gives the same order every time", () => {
    const a = fixture({ id: 1, kickoff_time: "garbage" });
    const b = fixture({ id: 2, kickoff_time: "2026-10-10T11:30:00Z" });
    const c = fixture({ id: 3, kickoff_time: null });
    const d = fixture({ id: 4, kickoff_time: "2026-10-10T09:00:00Z" });
    const order = (xs: Fixture[]) => [...xs].sort(compareByKickoff).map((f) => f.id);
    expect(order([a, b, c, d])).toEqual([4, 2, 1, 3]);
    expect(order([d, c, b, a])).toEqual([4, 2, 1, 3]);
    expect(order([c, a, d, b])).toEqual([4, 2, 1, 3]);
  });
});

describe("the week as a whole", () => {
  const at = (iso: string) => ({ now: () => new Date(iso) });

  it("a double-gameweek player shows in both of his matches", async () => {
    const first = fixture({ id: 1, stats: bps([[3, 40]], [[4, 10]]) });
    const second = fixture({ id: 2, kickoff_time: "2026-10-12T19:00:00Z", stats: bps([[3, 33]], [[4, 12]]) });
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [second, first] }, at("2026-10-12T21:00:00Z")).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.fixtures.map((c) => c.id)).toEqual([1, 2]);
    expect(model.fixtures.map((c) => c.bonus.home[0].player)).toEqual(["Saka", "Saka"]);
    expect(model.summary?.top).toMatchObject({ player: "Saka", bps: 40 });
  });

  it("confirmed, provisional and projected matches in one week keep their own sources", async () => {
    const confirmed = fixture({ id: 1, finished: true, finished_provisional: true, stats: [...bps([[3, 40]]), { identifier: "bonus", h: [{ element: 3, value: 3 }], a: [] }] });
    const provisional = fixture({ id: 2, finished_provisional: true, stats: [...bps([[2, 30]]), { identifier: "bonus", h: [{ element: 2, value: 3 }], a: [] }] });
    const projected = fixture({ id: 3, stats: bps([[4, 25]]) });
    const upcoming = fixture({ id: 4, started: false, kickoff_time: "2026-10-12T19:00:00Z", stats: [] });
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [confirmed, provisional, projected, upcoming] }, at("2026-10-10T13:00:00Z")).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.fixtures.map((c) => c.bonus.source)).toEqual(["confirmed", "provisional", "projected", "none"]);
    expect(model.counts).toEqual({ live: 1, finished: 2, upcoming: 1 });
  });

  it("a confirmed past week with an abandoned match (started, never finished) doesn't poll forever", async () => {
    const events = [event({ id: 5, name: "Gameweek 5", is_current: false, finished: true, data_checked: true }), event()];
    const abandoned = fixture({ id: 9, event: 5, started: true, finished: false, finished_provisional: false, kickoff_time: "2026-10-03T14:00:00Z" });
    const model = await createBonusService({ bootstrap: async () => ({ ...bootstrap, events }), fixtures: async () => [abandoned] }, at("2026-10-10T13:00:00Z")).load("5");
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.gameweek.status).toBe("final");
    expect(model.anyLive).toBe(false);
  });

  it("a live week with a live match still polls", async () => {
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [fixture()] }, at("2026-10-10T13:00:00Z")).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.anyLive).toBe(true);
  });

  it("an empty week (every match postponed) still loads, with no summary", async () => {
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [] }, at("2026-10-10T13:00:00Z")).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.fixtures).toEqual([]);
    expect(model.summary).toBeNull();
  });

  it.each(["0", "-3", "abc", "99", "6.5"])("?gw=%s falls back to the latest gameweek", async (gw) => {
    const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => [] }, at("2026-10-10T13:00:00Z")).load(gw);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.gameweek.gw).toBe(6);
  });
});
