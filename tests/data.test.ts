import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("FPL client", () => {
  it("sends browser headers and maps 404 to FplError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getEntry, isNotFound } = await import("@/lib/fpl");
    const err = await getEntry(1).catch((e) => e);
    expect(isNotFound(err)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fantasy.premierleague.com/api/entry/1/");
    expect(init.headers["user-agent"]).toMatch(/Mozilla/);
  });

  it("maps network failures to a 504 FplError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { getEntry, FplError } = await import("@/lib/fpl");
    const err = await getEntry(1).catch((e) => e);
    expect(err).toBeInstanceOf(FplError);
    expect(err.status).toBe(504);
  });

  it("memoises bootstrap but never caches failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValue(json({ events: [], teams: [], elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { getBootstrap } = await import("@/lib/fpl");
    await expect(getBootstrap()).rejects.toMatchObject({ status: 503 });
    await getBootstrap();
    await getBootstrap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("follows standings pagination", async () => {
    const page = (n: number, hasNext: boolean) =>
      json({ league: { id: 1, name: "L" }, standings: { has_next: hasNext, results: [{ entry: n }] } });
    const fetchMock = vi.fn().mockResolvedValueOnce(page(1, true)).mockResolvedValueOnce(page(2, false));
    vi.stubGlobal("fetch", fetchMock);
    const { getLeagueStandings } = await import("@/lib/fpl");
    const s = await getLeagueStandings(1);
    expect(s.standings.results.map((r) => r.entry)).toEqual([1, 2]);
    expect(fetchMock.mock.calls[1][0]).toContain("page_standings=2");
  });
});

describe("backend client", () => {
  it("returns null for a missing snapshot and sorts the list", async () => {
    vi.stubEnv("API_BASE", "https://api.example/");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "none" }, 404))
      .mockResolvedValueOnce(json({ league_id: 1, snapshots: [{ gw: 3, taken_at: "x" }, { gw: 1, taken_at: "y" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { getSnapshot, listSnapshots } = await import("@/lib/backend");
    expect(await getSnapshot(1, 9)).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/history/1/9");
    expect((await listSnapshots(1)).map((s) => s.gw)).toEqual([1, 3]);
  });
});

describe("cron route", () => {
  const call = async (headers: Record<string, string> = {}) => {
    const { GET } = await import("@/app/api/cron/autosnapshot/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest("http://localhost/api/cron/autosnapshot", { headers }));
  };

  it("rejects calls without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "abc");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to the backend for the configured league with the snapshot secret", async () => {
    vi.stubEnv("CRON_SECRET", "abc");
    vi.stubEnv("SNAPSHOT_SECRET", "s3");
    vi.stubEnv("LEAGUE_ID", "467763");
    vi.stubEnv("API_BASE", "https://api.example");
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: false, reason: "GW not fully over yet" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ authorization: "Bearer abc" });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/autosnapshot/467763");
    expect(init.method).toBe("POST");
    expect(init.headers["x-snapshot-secret"]).toBe("s3");
  });

  it("reports an unreachable backend as 504", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await call()).status).toBe(504);
  });
});
