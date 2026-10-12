import { describe, expect, it, vi } from "vitest";
import { createToolsService, EO_ROWS, PRICE_ROWS } from "@/lib/services/tools";
import { fakeFpl } from "./support";
import { NOW, bootstrap, league, picksFor, schedule } from "./toolsWorld";

const service = (over = {}, managers = 12) =>
  createToolsService(fakeFpl({ bootstrap: async () => bootstrap, standings: async () => league(managers), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e), ...over }), { now: () => NOW });

const load = async (query = {}, over = {}, managers = 12) => {
  const m = await service(over, managers).load(1, query);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};

describe("tools service: deadline", () => {
  it("gives the next deadline and the clock it was worked out on", async () => {
    const m = await load();
    expect(m.deadline).toEqual({ gw: 7, name: "Gameweek 7", at: "2026-10-17T10:00:00Z" });
    expect(m.now).toBe(NOW.toISOString());
  });
  it("has none once the season is over", async () => {
    const m = await load({}, { bootstrap: async () => ({ ...bootstrap, events: bootstrap.events.map((e) => ({ ...e, deadline_time: "2026-05-01T10:00:00Z" })) }) });
    expect(m.deadline).toBeNull();
  });
});

describe("tools service: team of the week", () => {
  it("picks the next gameweek's best eleven, with the right opponents, captain and vice-captain", async () => {
    const m = await load();
    expect(m.xi?.gw).toBe(7);
    const all = m.xi!.best.lines.flatMap((l) => l.players);
    expect(all).toHaveLength(11);
    expect(all.find((p) => p.captain)?.name).toBe("Player13");
    expect(all.find((p) => p.vice)?.name).toBe("Player14");
    expect(all.map((p) => p.id)).not.toContain(99);                               // injured, however well he scores
    const p13 = all.find((p) => p.id === 13)!;                                   // club (13 % 4) + 1 = 2, away at club 1
    expect(p13.opponents).toEqual([{ short: "C1", home: false, difficulty: 4 }]);
  });
  it("still picks a team when the schedule can't be had, just without opponents", async () => {
    const m = await load({}, { allFixtures: async () => { throw new Error("down"); } });
    expect(m.xi?.best.lines.flatMap((l) => l.players).every((p) => p.opponents.length === 0)).toBe(true);
  });
  it("is absent when no gameweek is ahead", async () => {
    const m = await load({}, { bootstrap: async () => ({ ...bootstrap, events: bootstrap.events.map((e) => ({ ...e, is_next: false, deadline_time: "2026-05-01T10:00:00Z" })) }) });
    expect(m.xi).toBeNull();
  });
});

describe("tools service: price changes", () => {
  it("puts the likely risers first and the likely fallers last", async () => {
    const m = await load();
    expect(m.prices.rows.slice(0, 2).map((r) => [r.id, r.status])).toEqual([[99, "likelyRise"], [3, "likelyRise"]]);   // most net buyers first: 900k, then 700k
    expect(m.prices.rows.at(-1)).toMatchObject({ id: 4, status: "likelyFall" });
  });
  it("applies the filters from the query, and ignores nonsense", async () => {
    expect((await load({ q: "player3" })).prices.rows.map((r) => r.id)).toEqual([3]);
    expect((await load({ pos: "1" })).prices.rows.every((r) => r.positionId === 1)).toBe(true);
    expect((await load({ team: "2" })).prices.rows.every((r) => r.teamId === 2)).toBe(true);
    expect((await load({ moving: "1" })).prices.rows.every((r) => r.status !== "steady")).toBe(true);
    const junk = await load({ pos: "9", team: "abc", q: "x".repeat(500), moving: "yes" });
    expect(junk.prices.filter).toEqual({ q: "x".repeat(40), position: null, team: null, movingOnly: false });
    expect((await load({ q: ["player4", "player5"] })).prices.filter.q).toBe("player4");   // the first of a repeated parameter
  });
  it("lists a bounded number, and says how many matched", async () => {
    const big = { ...bootstrap, elements: Array.from({ length: 200 }, (_, i) => ({ ...bootstrap.elements[0], id: 1000 + i, web_name: `Many${i}` })) };
    const m = await load({}, { bootstrap: async () => big });
    expect(m.prices.rows).toHaveLength(PRICE_ROWS);
    expect(m.prices.matching).toBe(200);
  });
  it("offers every club to filter by, in order", async () => expect((await load()).prices.clubs.map((c) => c.short)).toEqual(["C1", "C2", "C3", "C4"]));
});

describe("tools service: effective ownership", () => {
  it("defaults to the top four and works out each player's share, a captain counting twice", async () => {
    const m = await load();
    expect(m.eo).toMatchObject({ gw: 6, managers: 4, tier: "top4", by: "eo" });
    const p13 = m.eo!.rows.find((r) => r.id === 13)!;
    // managers 101-103 captain 13 (x2), manager 100 plays him at x1: (2 + 2 + 2 + 1) / 4 = 175%
    expect(p13).toMatchObject({ eo: 175, started: 100, captained: 75, name: "Player13", club: "C2" });
    expect(m.eo!.rows.find((r) => r.id === 14)?.eo).toBe(150);                        // (3 + 1 + 1 + 1) / 4
    expect(m.eo!.rows.map((r) => r.id)).not.toContain(9);                              // benched by everyone
    expect(m.eo!.rows[0].eo).toBeGreaterThanOrEqual(m.eo!.rows[1].eo);
  });
  it("can look at the top ten or everyone, and ask only for the managers it needs", async () => {
    const asked = new Set<number>();
    const picks = vi.fn(async (e: number) => (asked.add(e), picksFor(e)));
    await load({}, { picks });
    expect(asked.size).toBe(4);
    asked.clear();
    expect((await load({ eo: "top10" }, { picks })).eo).toMatchObject({ tier: "top10", managers: 10 });
    expect(asked.size).toBe(10);
    expect((await load({ eo: "all" })).eo).toMatchObject({ tier: "all", managers: 12 });
    expect((await load({ eo: "bogus" })).eo?.tier).toBe("top4");
  });
  it("ranks captains by how many picked them, and leaves out players nobody captained", async () => {
    const m = await load({ by: "captain" });
    expect(m.eo?.by).toBe("captain");
    expect(m.eo!.rows.map((r) => [r.id, r.captained])).toEqual([[13, 75], [14, 25]]);
  });
  it("offers only the groups that make sense for the league's size", async () => {
    expect((await load({}, {}, 12)).eo?.tiers.map((t) => t.key)).toEqual(["top4", "top10", "all"]);
    expect((await load({}, {}, 6)).eo?.tiers.map((t) => t.key)).toEqual(["top4", "all"]);
    expect((await load({}, {}, 3)).eo?.tiers.map((t) => t.key)).toEqual(["all"]);
  });
  it("leaves a manager out whose picks fail, and says how many it counted", async () => {
    const m = await load({}, { picks: async (e: number) => { if (e === 101) throw new Error("hiccup"); return picksFor(e); } });
    expect(m.eo?.managers).toBe(3);
  });
  it("is absent when no picks can be had", async () => {
    expect((await load({}, { picks: async () => { throw new Error("down"); } })).eo).toBeNull();
    expect((await load({}, { picks: async () => null })).eo).toBeNull();
  });
  it("asks for settled picks only once the gameweek is over", async () => {
    const flags: boolean[] = [];
    await load({}, { picks: async (e: number, _g: number, settled: boolean) => (flags.push(settled), picksFor(e)) });
    expect(new Set(flags)).toEqual(new Set([false]));                                   // GW6 is still being played
    flags.length = 0;
    const finished = { ...bootstrap, events: bootstrap.events.map((e) => (e.id === 6 ? { ...e, finished: true } : e)) };
    await load({}, { bootstrap: async () => finished, picks: async (e: number, _g: number, settled: boolean) => (flags.push(settled), picksFor(e)) });
    expect(new Set(flags)).toEqual(new Set([true]));
  });
  it("shows no more than a screenful of rows", async () => {
    const wide = { ...bootstrap };
    const m = await load({ eo: "all" }, { bootstrap: async () => wide });
    expect(m.eo!.rows.length).toBeLessThanOrEqual(EO_ROWS);
  });
  it("skips the extras for a league too big to ask about, but still lists the tools that don't need it", async () => {
    const m = await load({}, {}, 80);
    expect(m.eo).toBeNull();
    expect(m.xi).not.toBeNull();
    expect(m.prices.rows.length).toBeGreaterThan(0);
  });
});

describe("tools service: teams", () => {
  it("lists every manager in table order, with the link target's id", async () => {
    const m = await load({}, {}, 5);
    expect(m.teams.map((t) => [t.entry, t.rank, t.teamName])).toEqual([[100, 1, "Team 1"], [101, 2, "Team 2"], [102, 3, "Team 3"], [103, 4, "Team 4"], [104, 5, "Team 5"]]);
  });
  it("gives each their drawn avatar when there is one", async () => {
    const svc = createToolsService(fakeFpl({ bootstrap: async () => bootstrap, standings: async () => league(3), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e) }), {
      now: () => NOW,
      avatars: { src: (e) => (e === 101 ? "/avatars/101.webp" : null) },
    });
    const m = await svc.load(1, {});
    expect(m.kind === "ok" && m.teams.map((t) => t.avatar)).toEqual([null, "/avatars/101.webp", null]);
  });
  it("copes with a league that can't be fetched: the other tools still work", async () => {
    const m = await load({}, { standings: async () => { throw new Error("down"); } });
    expect(m.teams).toEqual([]);
    expect(m.eo).toBeNull();
    expect(m.xi).not.toBeNull();
  });
});
