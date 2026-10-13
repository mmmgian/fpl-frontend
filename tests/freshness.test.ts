import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickVariant, refreshIntervalMs, varietyKey } from "@/lib/domain";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const day = (d: string) => new Date(`${d}T12:00:00Z`);

describe("varietyKey", () => {
  it("is stable within a day and phase", () => {
    expect(varietyKey(7, "final", new Date("2026-10-13T01:00:00Z"))).toBe(varietyKey(7, "final", new Date("2026-10-13T23:00:00Z")));
  });

  it("moves on every day, also between gameweeks", () => {
    const keys = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((d) => varietyKey(7, "final", day(d)));
    expect(new Set(keys).size).toBe(4);
  });

  it("moves on when FPL finalises the gameweek (provisional -> final), the same day", () => {
    const now = day("2026-10-13");
    const keys = (["upcoming", "live", "provisional", "final"] as const).map((s) => varietyKey(7, s, now));
    expect(new Set(keys).size).toBe(4);
  });

  it("differs between gameweeks on the same day", () => {
    expect(varietyKey(7, "final", day("2026-10-13"))).not.toBe(varietyKey(8, "final", day("2026-10-13")));
  });
});

describe("pickVariant", () => {
  const items = ["a", "b", "c", "d"] as const;
  it("is deterministic and always returns an item", () => {
    for (let k = -50; k < 50; k++) {
      expect(items).toContain(pickVariant(items, k * 7919, 3));
      expect(pickVariant(items, k * 7919, 3)).toBe(pickVariant(items, k * 7919, 3));
    }
  });

  it("spreads over the variants across days and across slots", () => {
    const byDay = new Set(Array.from({ length: 30 }, (_, i) => pickVariant(items, varietyKey(7, "final", new Date(Date.UTC(2026, 9, 1 + i))))));
    const bySlot = new Set(Array.from({ length: 30 }, (_, i) => pickVariant(items, 12345, i)));
    expect(byDay.size).toBe(4);
    expect(bySlot.size).toBe(4);
  });
});

describe("refreshIntervalMs", () => {
  it("polls fast while live, slowly while waiting for FPL to finalise, and not at all otherwise", () => {
    expect(refreshIntervalMs("live")).toBe(60_000);
    expect(refreshIntervalMs("provisional")).toBe(300_000);
    expect(refreshIntervalMs("final")).toBeNull();
    expect(refreshIntervalMs("upcoming")).toBeNull();
  });
});

describe("snapshot nudge route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("API_BASE", "https://api.example");
    vi.stubEnv("LEAGUE_ID", "467763");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const post = async () => (await import("@/app/api/snapshot/route")).POST();

  it("forwards to the backend and reports a stored snapshot", async () => {
    vi.stubEnv("SNAPSHOT_SECRET", "s3");
    const fetchMock = vi.fn().mockResolvedValue(json({ snapshotted: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await post();
    expect(await res.json()).toMatchObject({ ok: true, snapshotted: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/autosnapshot/467763");
    expect(init.method).toBe("POST");
    expect(init.headers["x-snapshot-secret"]).toBe("s3");
  });

  it("forwards at most once per throttle window", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ snapshotted: false }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/snapshot/route");
    await POST();
    const second = await (await POST()).json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ snapshotted: false, throttled: true });
  });

  it("lets the next visitor retry when the backend is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("down")).mockResolvedValue(json({ snapshotted: false }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/snapshot/route");
    expect((await POST()).status).toBe(504);
    expect((await POST()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("selectGameweek with gaps in FPL's event list", () => {
  it("falls back to the latest gameweek instead of crashing", async () => {
    const { selectGameweek } = await import("@/lib/domain");
    const ev = (id: number, finished: boolean, is_current = false) => ({ id, name: `Gameweek ${id}`, deadline_time: "2026-08-01T10:00:00Z", is_current, is_next: false, finished, data_checked: finished });
    const events = [ev(1, true), ev(3, true), ev(4, false, true)];
    const s = selectGameweek(events, "2", 1, new Date("2026-10-13T12:00:00Z"));
    expect(s?.gw).toBe(4);
    expect(s?.event.id).toBe(4);
    expect(selectGameweek(events, "3", 1, new Date("2026-10-13T12:00:00Z"))?.gw).toBe(3);
  });
});

describe("navigation cache", () => {
  it("keeps a visited page for a short while so back/forward and tab hops are instant", async () => {
    const cfg = (await import("@/next.config")).default;
    expect(cfg.experimental?.staleTimes?.dynamic).toBe(30);
  });
});

describe("history server warm-up", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("pings /health once per window and never throws", async () => {
    vi.stubEnv("API_BASE", "https://api.example");
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { warmBackend } = await import("@/lib/backend");
    await warmBackend();
    await warmBackend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/health");
  });

  it("lets the next visitor retry when the server is unreachable", async () => {
    vi.stubEnv("API_BASE", "https://api.example");
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("down")).mockResolvedValue(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { warmBackend } = await import("@/lib/backend");
    await expect(warmBackend()).resolves.toBeUndefined();
    await warmBackend();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("the service swallows a failing or missing warm", async () => {
    const { createHistoryService } = await import("@/lib/services/history");
    const base = { list: async () => [], get: async () => null };
    await expect(createHistoryService(base).warm()).resolves.toBeUndefined();
    await expect(createHistoryService({ ...base, warm: async () => { throw new Error("x"); } }).warm()).resolves.toBeUndefined();
  });
});
