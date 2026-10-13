/**
 * Hardening of the history shelf, the saved tables and The Times: a sleeping or confused history backend, snapshots
 * with missing fields, the snapshot nudge (throttle, failures, no refresh loops), route parameters, accessibility.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { HistoryListView } from "@/components/views/HistoryListView";
import { SnapshotView } from "@/components/views/SnapshotView";
import { snapshotFacts, shelfStatus } from "@/lib/domain";
import type { Snapshot } from "@/lib/domain/types";
import { createHistoryService } from "@/lib/services/history";
import { createTimesService } from "@/lib/services/times";
import type { TimesPort } from "@/lib/services/ports";
import { expectNoAxeViolations } from "./axe";
import { event, standing } from "./fixtures";
import { clock, fakeFpl, fakeHistory } from "./support";

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  setRequestTrip(false);
  setRequestLocale("en");
});

// ------------------------------------------------------------------------------------------------ the backend adapter

describe("history backend adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("API_BASE", "https://api.example");
  });
  const adapter = () => import("@/lib/backend");

  it("lists only well-formed snapshots, once per gameweek, oldest first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ snapshots: [
      { gw: 5, taken_at: "2026-10-06T06:00:00Z" }, { gw: null, taken_at: "x" }, { gw: "4" }, { gw: 99, taken_at: "x" }, { gw: 0 }, { gw: 3.5 }, null, "x",
      { gw: 5, taken_at: "2026-10-07T06:00:00Z" }, { gw: 2, taken_at: null, rebuilt: "yes" },
    ] })));
    const { listSnapshots } = await adapter();
    const list = await listSnapshots(1);
    expect(list.map((s) => s.gw)).toEqual([2, 5]);
    expect(list[0]).toEqual({ gw: 2, taken_at: "", rebuilt: false });
    expect(list[1].taken_at).toBe("2026-10-06T06:00:00Z");
  });

  it("a list that isn't a list is a backend error (the shelf then says the server is unavailable)", async () => {
    for (const body of [{ snapshots: { gw: 5 } }, [], "hello", null]) {
      vi.stubGlobal("fetch", vi.fn(async () => jsonRes(body)));
      const { listSnapshots, BackendError } = await adapter();
      await expect(listSnapshots(1)).rejects.toBeInstanceOf(BackendError);
    }
  });

  it("a waking server answering with an HTML page is a backend error, not a JSON SyntaxError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Service waking up</html>", { status: 200, headers: { "content-type": "text/html" } })));
    const { getSnapshot, listSnapshots } = await adapter();
    await expect(getSnapshot(1, 5)).rejects.toMatchObject({ name: "BackendError", status: 502 });
    await expect(listSnapshots(1)).rejects.toMatchObject({ name: "BackendError", status: 502 });
  });

  it("a snapshot that isn't an object is a backend error; a missing one is null", async () => {
    const { getSnapshot } = await adapter();
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes([1, 2])));
    await expect(getSnapshot(1, 5)).rejects.toMatchObject({ name: "BackendError" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(getSnapshot(1, 5)).resolves.toBeNull();
  });

  it("a timeout (Render cold start) is a 504 backend error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    const { getSnapshot } = await adapter();
    await expect(getSnapshot(1, 5)).rejects.toMatchObject({ name: "BackendError", status: 504 });
  });
});

// ------------------------------------------------------------------------------------------------ the use case

describe("history service: snapshots with missing fields", () => {
  const snap = (data: unknown, over: Partial<Snapshot> = {}) => ({ gw: 5, taken_at: "2026-10-06T06:00:00Z", league_id: 1, data, ...over }) as Snapshot;
  const load = (s: Snapshot | null) => createHistoryService(fakeHistory({ get: async () => s }), undefined, { now: clock }).snapshot(1, 5);

  it("cleans null names and numbers, and puts the table in rank order", async () => {
    const m = await load(snap({ league: { name: "L" }, standings: { results: [
      { entry: 2, entry_name: "Second", rank: 2, last_rank: 1, total: 90, event_total: 30 },
      { entry: 1, entry_name: null, player_name: null, rank: 1, last_rank: 2, total: null, event_total: Number.NaN },
      { entry: 2, entry_name: "dup", rank: 9 },
    ] } }));
    expect(m!.rows.map((r) => r.entry_name)).toEqual(["#1", "Second"]);
    expect(m!.facts?.leader).toEqual({ name: "#1", total: 0 });
    expect(JSON.stringify(m)).not.toMatch(/NaN/);
  });

  it("a snapshot with no data, no league name and no date still loads as an empty table", async () => {
    const m = await load(snap(undefined, { taken_at: undefined as unknown as string }));
    expect(m).toMatchObject({ gw: 5, leagueName: null, rows: [], facts: null, takenAt: "" });
    const m2 = await load(snap({ standings: { results: "junk" }, league: { name: 42 } }));
    expect(m2).toMatchObject({ leagueName: null, rows: [] });
  });

  it("the shelf survives the backend and FPL both failing", async () => {
    const svc = createHistoryService(fakeHistory({ list: async () => { throw new Error("asleep"); } }), undefined, { fpl: fakeFpl({ bootstrap: async () => { throw new Error("503"); } }), now: clock });
    const shelf = await svc.shelf(1);
    expect(shelf).toMatchObject({ snapshots: null, status: { latest: null, gw: null, phase: null, pending: false } });
  });

  it("GW38 final and filed: nothing pending, so no nudge; GW38 final and not filed: pending", () => {
    const over = { phase: "over" as const, gw: 38, next: null, average: null, variety: 1 };
    expect(shelfStatus([37, 38], over).pending).toBe(false);
    expect(shelfStatus([36, 37], over).pending).toBe(true);
  });
});

describe("snapshot facts at the edges", () => {
  it("everyone level and nobody moved (GW1): a level line, no climber or faller", () => {
    const rows = [1, 2, 3].map((e) => standing({ entry: e, entry_name: `T${e}`, rank: 1, last_rank: 0, total: 0, event_total: 0 }));
    expect(snapshotFacts(rows)).toMatchObject({ gap: 0, climber: null, faller: null, best: { points: 0 } });
  });

  it("reads the leader off rank 1 even when the rows arrive out of order", () => {
    const rows = [standing({ entry: 2, entry_name: "B", rank: 2, total: 10 }), standing({ entry: 1, entry_name: "A", rank: 1, total: 20 })];
    expect(snapshotFacts(rows)).toMatchObject({ leader: { name: "A", total: 20 }, gap: 10 });
  });
});

// ------------------------------------------------------------------------------------------------ the views

describe("SnapshotView and HistoryListView at the edges", () => {
  const rows = [standing({ entry: 1, entry_name: "نادي القاهرة", rank: 1, last_rank: 2, total: 80, event_total: 40 }), standing({ entry: 2, entry_name: "🦞🦞", rank: 2, last_rank: 1, total: 70, event_total: -4 })];

  it.each(["en", "es", "fr"] as const)("a snapshot with no league name never shows an English stand-in (%s)", (locale) => {
    setRequestLocale(locale);
    const { container } = render(<SnapshotView gw={5} snapshot={{ gw: 5, leagueName: null, takenAt: "", rows, rebuilt: null, facts: snapshotFacts(rows), variety: 3 }} />);
    expect(container.textContent).not.toMatch(/\bLeague\b|undefined|null|NaN|Invalid Date/);
  });

  it("isolates right-to-left names in the summary sentence", () => {
    const { container } = render(<SnapshotView gw={5} snapshot={{ gw: 5, leagueName: "L", takenAt: "2026-10-06T06:00:00Z", rows, rebuilt: null, facts: snapshotFacts(rows), variety: 3 }} />);
    const summary = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("نادي"));
    expect(summary?.textContent).toContain("\u2068نادي القاهرة\u2069");
  });

  describe.each([false, true])("accessibility (blotter %s)", (trip) => {
    beforeEach(() => setRequestTrip(trip));
    it("snapshot, missing snapshot and the shelf in every state have no axe violations", async () => {
      const a = render(<SnapshotView gw={5} snapshot={{ gw: 5, leagueName: null, takenAt: "", rows, rebuilt: null, facts: snapshotFacts(rows), variety: 3 }} />);
      await expectNoAxeViolations(a.container);
      a.unmount();
      const b = render(<SnapshotView gw={7} snapshot={null} />);
      await expectNoAxeViolations(b.container);
      b.unmount();
      for (const snapshots of [null, [], [{ gw: 5, takenAt: "", rebuilt: false }]]) {
        const c = render(<HistoryListView snapshots={snapshots} shelf={{ snapshots, status: { latest: 5, gw: 6, phase: "live", pending: false }, variety: 1 }} />);
        await expectNoAxeViolations(c.container);
        c.unmount();
      }
    });
  });

  it("a snapshot list entry with no date says so instead of 'Invalid Date'", () => {
    const { container } = render(<HistoryListView snapshots={[{ gw: 5, takenAt: "", rebuilt: false }]} />);
    expect(container.textContent).not.toMatch(/Invalid Date|NaN/);
  });
});

// ------------------------------------------------------------------------------------------------ the nudge

describe("SnapshotNudge (client)", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  const mount = async (gw: number, refresh = vi.fn()) => {
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
    const { SnapshotNudge } = await import("@/components/ui/SnapshotNudge");
    const r = render(<SnapshotNudge gw={gw} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return { ...r, refresh };
  };

  it("asks once, and refreshes once when a table was stored", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ ok: true, snapshotted: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { refresh, unmount } = await mount(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    // The refreshed page still shows the nudge (the shelf was cached, or the backend filed something else): no loop.
    const again = await mount(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.refresh).not.toHaveBeenCalled();
  });

  it("asks again for a different gameweek", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ ok: true, snapshotted: false }));
    vi.stubGlobal("fetch", fetchMock);
    (await mount(6)).unmount();
    (await mount(7)).unmount();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the route fails, is throttled or answers junk", async () => {
    for (const res of [() => Promise.reject(new TypeError("offline")), async () => new Response("x", { status: 504 }), async () => new Response("not json"), async () => jsonRes({ snapshotted: false, throttled: true })]) {
      sessionStorage.clear();
      vi.stubGlobal("fetch", vi.fn(res));
      const { refresh, unmount } = await mount(6);
      expect(refresh).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("still works when sessionStorage is unavailable (private mode), once per page load", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ snapshotted: false }));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    (await mount(6)).unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});

describe("snapshot nudge route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("API_BASE", "https://api.example");
    vi.stubEnv("LEAGUE_ID", "467763");
  });

  it("a backend 5xx is reported as 502 and throttles the next call (no hammering a failing backend)", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ detail: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/snapshot/route");
    expect((await POST()).status).toBe(502);
    expect(await (await POST()).json()).toMatchObject({ throttled: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("junk or non-boolean answers never count as stored (no cache purge, no client refresh)", async () => {
    const { revalidateTag } = await import("next/cache");
    for (const body of ["not json", JSON.stringify({ snapshotted: "yes" }), JSON.stringify(null)]) {
      vi.resetModules();
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
      const { POST } = await import("@/app/api/snapshot/route");
      expect(await (await POST()).json()).toMatchObject({ ok: true, snapshotted: false });
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("calls arriving while one is in flight are throttled, not forwarded", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/snapshot/route");
    const first = POST();
    expect(await (await POST()).json()).toMatchObject({ throttled: true });
    release(jsonRes({ snapshotted: false }));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------------------------------------ The Times

describe("times service: parameters and upstream", () => {
  const issue = { id: "gw5-times", title: "T", kicker: null, kind: "times" as const, gameweek: 5, published: "2026-10-06", summary: null, pageCount: 3, bytes: 1000, cover: { width: 10, height: 14 } };
  const port: TimesPort = { library: async () => [issue], issue: async (id) => (id === issue.id ? { ...issue, pages: [1, 2, 3].map((n) => ({ n, width: 10, height: 14 })) } : null) };

  it.each([[undefined, 1], ["2", 2], ["0", 1], ["-1", 1], ["99999999", 1], ["3.5", 1], [["2", "3"], 2], ["9999", 3], ["", 1]] as const)("?p=%j opens page %i", async (p, page) => {
    const m = await createTimesService(port).issue(issue.id, p as string | string[] | undefined);
    expect(m).toMatchObject({ kind: "ok", page });
  });

  it("an unknown or hostile issue id is not found", async () => {
    for (const id of ["../etc/passwd", "x".repeat(500), "", "GW5-TIMES"]) expect(await createTimesService(port).issue(id, undefined)).toEqual({ kind: "not-found" });
  });

  it("the library still shows when FPL is down, without a press note", async () => {
    const m = await createTimesService(port, { fpl: fakeFpl({ bootstrap: async () => { throw new Error("503"); } }), now: clock }).library(["recap", "x"]);
    expect(m).toMatchObject({ kind: "ok", press: { gw: null, phase: null, awaiting: null }, active: "recap" });
  });

  it("GW38 final with its newspaper printed: nothing awaited", async () => {
    const events = [event({ id: 38, is_current: true, finished: true, data_checked: true, deadline_time: "2026-05-20T10:00:00Z" })];
    const printed = { ...issue, gameweek: 38 };
    const m = await createTimesService({ ...port, library: async () => [printed] }, { fpl: fakeFpl({ bootstrap: async () => ({ events, teams: [], elements: [] }) }), now: clock }).library(undefined);
    expect(m).toMatchObject({ press: { phase: "over", awaiting: null } });
  });
});
