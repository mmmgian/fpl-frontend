/** Use cases, tested against in-memory ports: no fetch, no Next.js, no React. */
import { describe, expect, it, vi } from "vitest";
import type { Entry } from "@/lib/domain/types";
import { createBonusService } from "@/lib/services/bonus";
import { createHistoryService } from "@/lib/services/history";
import { createLeagueService } from "@/lib/services/league";
import { createTeamService } from "@/lib/services/team";
import { bootstrap, event, fixture, picks, standing } from "./fixtures";
import { clock, fakeFpl, fakeHistory } from "./support";

const league = (results = [standing()], over = {}) => ({
  league: { id: 1, name: "Lobsters" },
  standings: { has_next: false, results },
  new_entries: { results: [] as unknown[] },
  ...over,
});
const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1,
  current_event: 6, summary_overall_points: null, summary_overall_rank: null, summary_event_points: null, ...over,
});

describe("league service", () => {
  it("summarises the table and the live gameweek", async () => {
    const rows = [standing({ entry: 1, total: 433, event_total: 52 }), standing({ entry: 2, entry_name: "B", total: 400, event_total: 61 })];
    const svc = createLeagueService(fakeFpl({ standings: async () => league(rows) }), { now: clock });
    const model = await svc.load(1);
    expect(model).toMatchObject({
      kind: "ok", name: "Lobsters", truncated: false, newEntries: 0,
      gameweek: { name: "Gameweek 6", status: "live" },
      summary: { leader: { entryName: "Bart's Team", total: 433 }, best: { entryName: "B", total: 61 }, managers: 2 },
    });
  });

  it("reports an unknown league without needing bootstrap to succeed", async () => {
    const svc = createLeagueService(fakeFpl({ standings: async () => null, bootstrap: () => Promise.reject(new Error("down")) }));
    expect(await svc.load(9)).toEqual({ kind: "not-found", leagueId: 9 });
  });

  it("starts standings and bootstrap together", async () => {
    const started: string[] = [];
    const svc = createLeagueService(
      fakeFpl({
        bootstrap: async () => (started.push("bootstrap"), bootstrap),
        standings: async () => (started.push("standings"), league()),
      }),
    );
    await svc.load(1);
    expect(started).toEqual(["bootstrap", "standings"]);
  });

  it("handles an empty league and pre-season", async () => {
    const preseason = { ...bootstrap, events: [event({ is_current: false, finished: false })] };
    const svc = createLeagueService(fakeFpl({ standings: async () => league([], { new_entries: { results: [{}, {}] } }), bootstrap: async () => preseason }));
    expect(await svc.load(1)).toMatchObject({ kind: "ok", gameweek: null, summary: null, newEntries: 2, rows: [] });
  });

  it("propagates other failures", async () => {
    const svc = createLeagueService(fakeFpl({ standings: () => Promise.reject(new Error("503")) }));
    await expect(svc.load(1)).rejects.toThrow("503");
  });
});

describe("team service: place in the league", () => {
  const row = (rank: number, entryId: number, total: number, last_rank = rank) => standing({ entry: entryId, entry_name: `Team ${rank}`, rank, total, last_rank });
  const table = (me: number) => [row(3, me === 3 ? 7 : 300, 380, 5), row(1, me === 1 ? 7 : 100, 420, 1), row(2, me === 2 ? 7 : 200, 400, 2)];
  const league = (results: ReturnType<typeof table>) => ({ league: { id: 1, name: "L" }, standings: { has_next: false, results } });
  const make = (standings: () => Promise<unknown>, id = 1) =>
    createTeamService(fakeFpl({ entry: async () => entry(), standings: standings as never }), { now: clock, leagueId: () => id });
  const identity = async (svc: ReturnType<typeof make>) => {
    const m = await svc.load(7, undefined);
    if (m.kind === "not-found") throw new Error("not found");
    return m.team;
  };

  it("names the managers one place above and below, whatever order the league arrives in", async () => {
    const team = await identity(make(async () => league(table(1))));
    expect(team.league).toEqual({
      rank: 1, size: 3, points: 420, moved: 0,
      leader: { entryId: 7, slug: "team-1", teamName: "Team 1", rank: 1, points: 420 },
      prev: null,
      next: { entryId: 200, slug: "team-2", teamName: "Team 2", rank: 2, points: 400 },
    });
  });
  it("links both ways from the middle, knows the leader and the points, and the places moved since last week", async () => {
    const team = await identity(make(async () => league(table(3))));
    expect(team.league).toMatchObject({
      rank: 3, points: 380, moved: 2,
      leader: { entryId: 100, teamName: "Team 1", points: 420 },
      prev: { entryId: 200, rank: 2, points: 400 },
      next: null,
    });
  });
  it("treats a team with no earlier rank as not having moved", async () => {
    const rows = [row(1, 100, 420, 1), row(2, 7, 400, 0)];
    expect((await identity(make(async () => league(rows as never)))).league?.moved).toBe(0);
  });
  it("shows the team without a place if the league is unavailable, has no such team, or is not configured", async () => {
    expect((await identity(make(() => Promise.reject(new Error("503"))))).league).toBeNull();
    expect((await identity(make(async () => null))).league).toBeNull();
    expect((await identity(make(async () => league([row(1, 5, 10)])))).league).toBeNull();
    const none = await createTeamService(fakeFpl({ entry: async () => entry() }), { now: clock }).load(7, undefined);
    expect(none.kind === "ok" && none.team.league).toBeNull();
  });
});

describe("team service", () => {
  const svc = (over = {}) => createTeamService(fakeFpl({ entry: async () => entry(), ...over }), { now: clock });

  it("builds the live team model", async () => {
    const model = await svc().load(7, undefined);
    expect(model).toMatchObject({
      kind: "ok",
      team: { entryId: 7, teamName: "Gaucho F.C.", manager: "gian jaen" },
      gameweek: { gw: 6, name: "Gameweek 6", status: "live", min: 1, max: 6, isLive: true },
      chip: null,
      showPoints: true,
      summary: { hit: 4, total: 427, overallRank: 175936, transfers: 1, value: 997, bank: 14 },
    });
    // 2 + 6 + 5 + 9x2 = 31 gross, minus the 4-point hit
    expect((model as { summary: { gwPoints: number } }).summary.gwPoints).toBe(27);
  });

  it("falls back to FPL's own points, net of the hit, when live data is unavailable", async () => {
    const model = await svc({ live: () => Promise.reject(new Error("500")) }).load(7, undefined);
    expect(model).toMatchObject({ kind: "ok", showPoints: false, summary: { gwPoints: 16 } }); // 20 gross - 4 hit
  });

  it("an earlier, finished gameweek is not live", async () => {
    const model = await svc().load(7, "5");
    expect(model).toMatchObject({ kind: "ok", gameweek: { gw: 5, status: "final", isLive: false } });
  });

  it.each([
    ["unknown team", { entry: async () => null }, { kind: "not-found" }],
    ["no picks that week", { picks: async () => null }, { kind: "no-picks" }],
    ["team joins later", { entry: async () => entry({ started_event: 9 }) }, { kind: "not-started", startedEvent: 9, deadlineName: "Gameweek 6" }],
  ])("%s", async (_name, over, expected) => {
    expect(await svc(over).load(7, undefined)).toMatchObject(expected);
  });

  it("pre-season", async () => {
    const preseason = { ...bootstrap, events: [event({ is_current: false })] };
    expect(await svc({ bootstrap: async () => preseason }).load(7, undefined)).toMatchObject({ kind: "no-season" });
  });

  it("requests picks and live before the entry resolves, and reuses them", async () => {
    let releaseEntry!: (e: Entry) => void;
    const picksCalls: number[] = [];
    const service = createTeamService(
      fakeFpl({
        entry: () => new Promise<Entry>((r) => (releaseEntry = r)),
        picks: async (_id, gw) => (picksCalls.push(gw), picks),
      }),
      { now: clock },
    );
    const pending = service.load(7, undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(picksCalls).toEqual([6]); // already in flight while the entry is still outstanding
    releaseEntry(entry());
    await pending;
    expect(picksCalls).toEqual([6]); // not fetched a second time
  });

  it("refetches when ?gw= is before the team's first gameweek", async () => {
    const picksCalls: number[] = [];
    const service = createTeamService(
      fakeFpl({ entry: async () => entry({ started_event: 6 }), picks: async (_id, gw) => (picksCalls.push(gw), picks) }),
      { now: clock },
    );
    const model = await service.load(7, "5");
    expect(picksCalls).toEqual([5, 6]); // the guess, then the real gameweek
    expect(model).toMatchObject({ gameweek: { gw: 6 } });
  });

  it("identify() returns null instead of throwing", async () => {
    expect(await svc().identify(7)).toMatchObject({ teamName: "Gaucho F.C.", firstName: "gian" });
    expect(await svc({ entry: async () => null }).identify(7)).toBeNull();
    expect(await svc({ entry: () => Promise.reject(new Error("x")) }).identify(7)).toBeNull();
  });
});

describe("bonus service", () => {
  const fixtures = [
    fixture({ id: 3, kickoff_time: "2026-10-12T19:00:00Z", started: false, finished: false, stats: [] }),
    fixture({ id: 1, kickoff_time: "2026-10-10T11:30:00Z", finished: true, finished_provisional: true }),
    fixture({ id: 2, kickoff_time: null, started: false, stats: [] }),
    fixture({ id: 4, kickoff_time: "2026-10-10T11:30:00Z" }),
  ];
  const svc = (over = {}) => createBonusService(fakeFpl({ fixtures: async () => fixtures, ...over }), { now: clock });

  it("orders by kick-off (unknown last, ties by id), counts finished and spots live matches", async () => {
    const model = await svc().load(undefined);
    expect(model.kind).toBe("ok");
    if (model.kind !== "ok") return;
    expect(model.fixtures.map((f) => f.id)).toEqual([1, 4, 3, 2]);
    expect(model).toMatchObject({ finished: 1, anyLive: true, gameweek: { gw: 6, min: 1, max: 6, status: "live" } });
  });

  it("does not mutate the port's data", async () => {
    const before = fixtures.map((f) => f.id);
    await svc().load(undefined);
    expect(fixtures.map((f) => f.id)).toEqual(before);
  });

  it("resolves names, scores and bonus lines", async () => {
    const model = await svc({ fixtures: async () => [fixture()] }).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.fixtures[0]).toMatchObject({
      state: "live", minutes: 63, score: { home: 2, away: 1 },
      home: { name: "Arsenal", short: "ARS", code: 3 }, away: { name: "Man City", short: "MCI", code: 43 },
      bonus: { source: "projected" },
    });
    const row = (l: { bonus: number; player: string; club?: string; bps: number; share: number }) => [l.bonus, l.player, l.club, l.bps, l.share];
    // Top BPS per side with the bonus earned; the bar is relative to the match's top BPS (35).
    expect(model.fixtures[0].bonus.home.map(row)).toEqual([[3, "Saka", "ARS", 35, 100], [1, "Saliba", "ARS", 28, 80]]);
    expect(model.fixtures[0].bonus.away.map(row)).toEqual([[3, "Haaland", "MCI", 35, 100], [0, "Gvardiol", "MCI", 20, 57]]);
  });

  it("caps a side at five rows when many players tie early in a match", async () => {
    const tied = Array.from({ length: 9 }, (_, i) => ({ element: 100 + i, value: 3 }));
    const early = fixture({ stats: [{ identifier: "bps", h: [{ element: 3, value: 4 }, ...tied], a: [{ element: 4, value: 1 }] }, { identifier: "bonus", h: [], a: [] }] });
    const model = await svc({ fixtures: async () => [early] }).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    const { bonus } = model.fixtures[0];
    expect(bonus.home).toHaveLength(5); // Saka +3, then the first four of nine tied on +2
    expect(bonus.home[0]).toMatchObject({ player: "Saka", bonus: 3 });
    expect(bonus.hidden).toEqual({ home: 5, away: 0 });
    expect(bonus.away).toHaveLength(1);
  });

  it("only fetches finished-gameweek fixtures with the long cache hint", async () => {
    const fixturesFn = vi.fn(async () => [] as typeof fixtures);
    await svc({ fixtures: fixturesFn }).load("5");
    await svc({ fixtures: fixturesFn }).load(undefined);
    expect(fixturesFn.mock.calls).toEqual([[5, true], [6, false]]);
  });

  it("pre-season", async () => {
    const preseason = { ...bootstrap, events: [event({ is_current: false })] };
    expect(await svc({ bootstrap: async () => preseason }).load(undefined)).toEqual({ kind: "no-season" });
  });
});

describe("history service", () => {
  it("lists newest first and renames fields for the view", async () => {
    const svc = createHistoryService(fakeHistory({ list: async () => [{ gw: 1, taken_at: "a" }, { gw: 3, taken_at: "b", rebuilt: true }] }));
    expect(await svc.list(1)).toEqual([{ gw: 3, takenAt: "b", rebuilt: true }, { gw: 1, takenAt: "a", rebuilt: false }]);    // an older backend sends no flag: saved at the time
  });

  describe("a table rebuilt afterwards", () => {
    const rows = [
      { entry: 1, entry_name: "Alpha", player_name: "a", rank: 1, last_rank: 0, event_total: 60, total: 60, rank_approximate: true },
      { entry: 2, entry_name: "Beta", player_name: "b", rank: 2, last_rank: 0, event_total: 60, total: 60, rank_approximate: true },
      { entry: 3, entry_name: "Gamma", player_name: "c", rank: 3, last_rank: 0, event_total: 50, total: 50 },
    ];
    const snap = (reconstructed: unknown) =>
      createHistoryService(fakeHistory({ get: async () => ({ gw: 1, taken_at: "2026-10-11T12:00:00+00:00", league_id: 1, data: { league: { id: 1, name: "L" }, standings: { has_next: false, results: rows }, reconstructed } } as never) }));

    it("says so, and names who is level on points and overall rank", async () => {
      const m = await snap({ gw: 1, built_at: "2026-10-11T12:00:00+00:00", unresolved_ties: [{ total: 60, entries: [1, 2] }] }).snapshot(1, 1);
      expect(m?.rebuilt).toEqual({ builtAt: "2026-10-11T12:00:00+00:00", level: [{ total: 60, names: ["Alpha", "Beta"] }], movementApproximate: false });
    });

    it("a normal snapshot is not marked", async () => {
      expect((await snap(undefined).snapshot(1, 1))?.rebuilt).toBeNull();
    });

    it.each([["a string", "x"], ["null", null], ["no date", { gw: 1 }], ["a numeric date", { built_at: 5 }]])("a malformed note (%s) means 'not rebuilt', never an error", async (_n, note) => {
      expect((await snap(note).snapshot(1, 1))?.rebuilt).toBeNull();
    });

    it("ignores tie groups it can't make sense of, and entries that aren't in the table", async () => {
      const m = await snap({ built_at: "t", unresolved_ties: [{ total: 60, entries: [1, 99] }, { total: "x", entries: [1, 2] }, "junk", { total: 5 }, { total: 60, entries: [2, 1] }] }).snapshot(1, 1);
      expect(m?.rebuilt?.level).toEqual([{ total: 60, names: ["Beta", "Alpha"] }]);      // a "group" needs at least two real members
    });

    describe("movementApproximate", () => {
      const with_ = async (results: unknown[]) =>
        createHistoryService(fakeHistory({ get: async () => ({ gw: 2, taken_at: "t", league_id: 1, data: { league: { id: 1, name: "L" }, standings: { has_next: false, results }, reconstructed: { built_at: "t" } } } as never) }))
          .snapshot(1, 2).then((m) => m?.rebuilt?.movementApproximate);

      it("is true when the earlier rank behind a movement is a guess", async () => {
        expect(await with_([{ ...rows[0], last_rank: 2, last_rank_approximate: true }])).toBe(true);
      });
      it("is true when this table's own rank is the guess", async () => {
        expect(await with_([{ ...rows[0], last_rank: 2, rank_approximate: true }])).toBe(true);
      });
      it("is false for a new entry, which has no movement to qualify", async () => {
        expect(await with_([{ ...rows[0], last_rank: 0, rank_approximate: true, last_rank_approximate: true }])).toBe(false);
      });
      it("is false when nothing is approximate", async () => {
        expect(await with_([{ ...rows[2], last_rank: 2 }])).toBe(false);          // rows[2] (Gamma) is the one clean row
      });
    });

    it("tolerates a missing tie list", async () => {
      expect((await snap({ built_at: "t" }).snapshot(1, 1))?.rebuilt).toEqual({ builtAt: "t", level: [], movementApproximate: false });
    });
  });

  it("returns null for a missing snapshot and tolerates malformed data", async () => {
    const snap = { gw: 5, taken_at: "t", league_id: 1, data: {} };
    const svc = createHistoryService(fakeHistory({ get: async (_l, gw) => (gw === 5 ? (snap as never) : null) }));
    expect(await svc.snapshot(1, 9)).toBeNull();
    expect(await svc.snapshot(1, 5)).toEqual({ gw: 5, leagueName: "League", takenAt: "t", rows: [], rebuilt: null });
  });
});
