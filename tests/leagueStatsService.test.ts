import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryHistory, HistoryGameweek } from "@/lib/domain/types";
import { createLeagueService, STATS_DEADLINE_MS } from "@/lib/services/league";
import { standing } from "./fixtures";
import { clock, fakeFpl } from "./support";

const gw = (event: number, points: number): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 100, bank: 5, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0,
});
const history = (...points: number[]): EntryHistory => ({ current: points.map((p, i) => gw(i + 1, p)), past: [], chips: [] });
const league = (rows: ReturnType<typeof standing>[]) => ({ league: { id: 1, name: "L" }, standings: { has_next: false, results: rows }, new_entries: { results: [] as unknown[] } });
const rows = [1, 2, 3].map((e) => standing({ entry: e, entry_name: `T${e}`, rank: e, total: 300 - e }));

afterEach(() => vi.useRealTimers());

describe("league service: the extras", () => {
  it("adds each manager's stats, worked out from their own history", async () => {
    const histories: Record<number, EntryHistory> = { 1: history(50, 60), 2: history(40, 40), 3: history(30, 20) };
    const svc = createLeagueService(fakeFpl({ standings: async () => league(rows), history: async (e: number) => histories[e] }), { now: clock });
    const model = await svc.load(1);
    if (model.kind !== "ok" || !model.stats) throw new Error("expected stats");
    expect(model.stats.gw).toBe(2);
    expect(Object.keys(model.stats.byEntry)).toEqual(["1", "2", "3"]);
    expect(model.stats.awards.find((a) => a.key === "weekWinner")).toMatchObject({ entry: 1, value: 60 });
  });

  it("works out the stats through the last FINISHED gameweek, not the one in progress", async () => {
    // fixtures: GW5 finished, GW6 live. Manager 1 has played GW6 so far with 5 points.
    const histories: Record<number, EntryHistory> = {
      1: { current: [gw(4, 50), gw(5, 60), gw(6, 5)], past: [], chips: [] },
      2: { current: [gw(4, 40), gw(5, 50), gw(6, 30)], past: [], chips: [] },
      3: { current: [gw(4, 30), gw(5, 40), gw(6, 20)], past: [], chips: [] },
    };
    const model = await createLeagueService(fakeFpl({ standings: async () => league(rows), history: async (e: number) => histories[e] }), { now: clock }).load(1);
    if (model.kind !== "ok" || !model.stats) throw new Error("expected stats");
    expect(model.stats.gw).toBe(5);
    expect(model.stats.awards.find((a) => a.key === "woodenSpoon")).toMatchObject({ entry: 3, value: 40 });   // not manager 1's 5 from the live week
  });

  it("gives no extras before any gameweek has finished", async () => {
    const preseason = { events: [{ id: 1, name: "Gameweek 1", deadline_time: "2026-08-15T10:00:00Z", is_current: true, is_next: false, finished: false, data_checked: false }], teams: [], elements: [] };
    const model = await createLeagueService(fakeFpl({ standings: async () => league(rows), bootstrap: async () => preseason, history: async () => ({ current: [gw(1, 30)], past: [], chips: [] }) }), { now: clock }).load(1);
    expect(model).toMatchObject({ kind: "ok", stats: null });
  });

  it("claims no awards when only a few of a larger league's histories came back in time", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 12 }, (_, i) => standing({ entry: i + 1, entry_name: `T${i + 1}`, rank: i + 1, total: 300 - i }));
    const never = new Promise<EntryHistory | null>(() => {});
    const svc = createLeagueService(fakeFpl({ standings: async () => league(many), history: async (e: number) => (e <= 3 ? history(10, 20) : never) }), { now: clock });
    const pending = svc.load(1);
    await vi.advanceTimersByTimeAsync(STATS_DEADLINE_MS + 1);
    const model = await pending;
    if (model.kind !== "ok" || !model.stats) throw new Error("expected stats");
    expect(Object.keys(model.stats.byEntry)).toHaveLength(3);
    expect(model.stats.comparable).toBe(false);
    expect(model.stats.awards).toEqual([]);
  });

  it("asks for every manager's history, once each", async () => {
    const history_ = vi.fn<(entry: number) => Promise<EntryHistory>>(async () => history(10));
    await createLeagueService(fakeFpl({ standings: async () => league(rows), history: history_ })).load(1);
    expect(history_.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3]);
  });

  it("leaves out a manager whose history can't be fetched, and still shows the rest", async () => {
    const svc = createLeagueService(fakeFpl({
      standings: async () => league(rows),
      history: async (e: number) => { if (e === 2) throw new Error("FPL hiccup"); return e === 3 ? null : history(10, 20); },
    }));
    const model = await svc.load(1);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(Object.keys(model.stats!.byEntry)).toEqual(["1"]);
    expect(model.rows).toHaveLength(3);                               // the table itself is untouched
  });

  it("shows the plain table, with stats null, when every history fails", async () => {
    const svc = createLeagueService(fakeFpl({ standings: async () => league(rows), history: async () => { throw new Error("down"); } }));
    const model = await svc.load(1);
    expect(model).toMatchObject({ kind: "ok", stats: null });
  });

  it("does not wait forever: after the deadline it shows what it has", async () => {
    vi.useFakeTimers();
    const never = new Promise<EntryHistory | null>(() => {});
    const svc = createLeagueService(fakeFpl({ standings: async () => league(rows), history: async (e: number) => (e === 1 ? history(10) : never) }));
    const pending = svc.load(1);
    await vi.advanceTimersByTimeAsync(STATS_DEADLINE_MS + 1);
    const model = await pending;
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(Object.keys(model.stats!.byEntry)).toEqual(["1"]);          // manager 1 answered in time; 2 and 3 did not
  });

  it("skips the extras for a league too big for one request per manager", async () => {
    const big = Array.from({ length: 61 }, (_, i) => standing({ entry: i + 1, rank: i + 1, total: 1000 - i }));
    const history_ = vi.fn(async () => history(10));
    const model = await createLeagueService(fakeFpl({ standings: async () => league(big), history: history_ })).load(1);
    expect(history_).not.toHaveBeenCalled();
    expect(model).toMatchObject({ kind: "ok", stats: null });
  });

  it("makes no history requests for an empty league", async () => {
    const history_ = vi.fn();
    const model = await createLeagueService(fakeFpl({ standings: async () => league([]), history: history_ })).load(1);
    expect(history_).not.toHaveBeenCalled();
    expect(model).toMatchObject({ kind: "ok", stats: null });
  });

  it("produces plain data that can be sent to the browser", async () => {
    const svc = createLeagueService(fakeFpl({ standings: async () => league(rows), history: async () => history(10, 20, 30) }));
    const model = await svc.load(1);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});
