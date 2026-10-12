/** Tests for the performance changes: slim shared bootstrap, parallel fetches, history caching, client-JS cuts. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, live, picks } from "./fixtures";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("slim bootstrap", () => {
  it("keeps only the fields the app reads", async () => {
    const raw = {
      events: [{ ...bootstrap.events[0], chip_plays: [1, 2], most_captained: 9 }],
      teams: [{ ...bootstrap.teams[0], strength: 5, pulse_id: 1 }],
      elements: [{ ...bootstrap.elements[0], now_cost: 55, status: "a", news: "", ict_index: "4.1" }],
      chips: [{ id: 1, name: "wildcard", number: 1, start_event: 2, stop_event: 19, chip_policy: {} }],
      element_stats: [{}],
      phases: [{}],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(raw)));
    const { getBootstrap } = await import("@/lib/fpl");
    const bs = await getBootstrap();
    expect(Object.keys(bs).sort()).toEqual(["chips", "elements", "events", "teams"]);
    expect(bs.chips).toEqual([{ name: "wildcard", start_event: 2, stop_event: 19 }]);
    expect(bs.elements[0]).toEqual({ id: 1, web_name: "Raya", team: 1, element_type: 1, selected_by_percent: "20.5", now_cost: 55 }); // names unused; defaults omitted
    expect(bs.teams[0]).toEqual(bootstrap.teams[0]);
    expect(bs.events[0]).toEqual(bootstrap.events[0]);
  });
});

describe("slim bootstrap keeps what the Tools page reads", () => {
  it("retains expected points, this week's transfers and price steps, and the player count; omits zeros", async () => {
    const { slimBootstrap } = await import("@/lib/fpl");
    const raw = {
      ...bootstrap,
      total_players: 11_000_000,
      elements: [
        { ...bootstrap.elements[0], now_cost: 55, ep_next: "5.3", transfers_in_event: 1200, transfers_out_event: 300, cost_change_event: 1, cost_change_start: -2, ict_index: "9" },
        { ...bootstrap.elements[1], now_cost: 45, ep_next: "0.0", transfers_in_event: 0, transfers_out_event: 0, cost_change_event: 0, cost_change_start: 0 },
      ],
    };
    const slim = slimBootstrap(raw as never);
    expect(slim.total_players).toBe(11_000_000);
    expect(slim.elements[0]).toMatchObject({ ep_next: "5.3", transfers_in_event: 1200, transfers_out_event: 300, cost_change_event: 1, cost_change_start: -2 });
    expect(slim.elements[0]).not.toHaveProperty("ict_index");
    for (const k of ["ep_next", "transfers_in_event", "transfers_out_event", "cost_change_event", "cost_change_start"]) expect(slim.elements[1], k).not.toHaveProperty(k);
  });
});

describe("slim bootstrap keeps what the squad insights read", () => {
  it("retains flags, news, chance and ownership; omits defaults", async () => {
    const { slimBootstrap } = await import("@/lib/fpl");
    const el = bootstrap.elements[0];
    const slim = slimBootstrap({
      ...bootstrap,
      elements: [
        { ...el, id: 1, status: "d", news: "Knock", chance_of_playing_next_round: 50, selected_by_percent: "12.3", now_cost: 55 } as never,
        { ...el, id: 2, status: "a", news: "", chance_of_playing_next_round: null, selected_by_percent: "0.4" } as never,
      ],
    });
    expect(slim.elements[0]).toEqual({ id: 1, web_name: "Raya", team: 1, element_type: 1, status: "d", news: "Knock", chance_of_playing_next_round: 50, selected_by_percent: "12.3", now_cost: 55 });
    expect(slim.elements[1]).toEqual({ id: 2, web_name: "Raya", team: 1, element_type: 1, selected_by_percent: "0.4" });
  });

  it("retains what the club page reads (price, minutes, starts, points, form, when news was added) and omits it when it is a default", async () => {
    const { slimBootstrap } = await import("@/lib/fpl");
    const el = bootstrap.elements[0];
    const slim = slimBootstrap({
      ...bootstrap,
      elements: [
        { ...el, id: 1, now_cost: 62, minutes: 540, starts: 6, total_points: 41, form: "5.2", news_added: "2026-10-09T10:00:00Z", selected_by_percent: undefined } as never,
        { ...el, id: 2, now_cost: 40, minutes: 0, starts: 0, total_points: 0, form: "0.0", news_added: null, selected_by_percent: undefined } as never,
      ],
    });
    expect(slim.elements[0]).toEqual({ id: 1, web_name: "Raya", team: 1, element_type: 1, now_cost: 62, minutes: 540, starts: 6, total_points: 41, form: "5.2", news_added: "2026-10-09T10:00:00Z" });
    expect(slim.elements[1]).toEqual({ id: 2, web_name: "Raya", team: 1, element_type: 1, now_cost: 40 });   // zero minutes/starts/points, form "0.0", no news date: all left out
  });
});

/** fetch mock that routes by URL; `hold` keeps matching requests pending until released. */
function routedFetch(routes: Record<string, unknown>, hold: string[] = []) {
  const seen: string[] = [];
  const held: (() => void)[] = [];
  const fn = vi.fn((url: string) => {
    seen.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const respond = () => (key ? json(routes[key]) : new Response("nope", { status: 404 }));
    if (hold.some((h) => url.includes(h))) return new Promise<Response>((r) => held.push(() => r(respond())));
    return Promise.resolve(respond());
  });
  return { fn, seen, release: () => held.splice(0).forEach((r) => r()) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const historyBody = { current: [], past: [], chips: [] };

describe("parallel data loading", () => {
  it("home requests standings and bootstrap at the same time", async () => {
    const standings = { league: { id: 1, name: "L" }, standings: { has_next: false, results: [] } };
    const f = routedFetch({ "/leagues-classic/": standings, "/bootstrap-static/": bootstrap }, ["/leagues-classic/", "/bootstrap-static/"]);
    vi.stubGlobal("fetch", f.fn);
    const { default: LeaguePage } = await import("@/app/page");
    const page = LeaguePage();
    await flush();
    expect(f.seen.some((u) => u.includes("/leagues-classic/"))).toBe(true);
    expect(f.seen.some((u) => u.includes("/bootstrap-static/"))).toBe(true); // both in flight, neither answered
    f.release();
    await page;
  });

  it("team page fetches picks and live points without waiting for the entry", async () => {
    const entry = { id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6 };
    const f = routedFetch(
      { "/bootstrap-static/": bootstrap, "/entry/7/event/6/picks/": picks, "/event/6/live/": live, "/entry/7/history/": historyBody, "/entry/7/": entry },
      ["/entry/7/"], // hold the entry (and picks and history, which share the prefix)
    );
    vi.stubGlobal("fetch", f.fn);
    const { default: TeamPage } = await import("@/app/team/[entryId]/page");
    const page = TeamPage({ params: Promise.resolve({ entryId: "7" }), searchParams: Promise.resolve({}) });
    await flush();
    await flush();
    expect(f.seen.some((u) => u.endsWith("/entry/7/"))).toBe(true);
    expect(f.seen.some((u) => u.includes("/entry/7/event/6/picks/"))).toBe(true); // started before entry resolved
    expect(f.seen.some((u) => u.includes("/event/6/live/"))).toBe(true);
    f.release();
    await page;
    expect(f.seen.filter((u) => u.includes("/picks/"))).toHaveLength(1); // speculation reused, not repeated
  });

  it("team page refetches when ?gw= is before the team's first gameweek", async () => {
    const entry = { id: 7, name: "Late", player_first_name: "a", player_last_name: "b", started_event: 6, current_event: 6 };
    const f = routedFetch({ "/bootstrap-static/": bootstrap, "/entry/7/event/6/picks/": picks, "/event/": live, "/entry/7/history/": historyBody, "/entry/7/": entry });
    vi.stubGlobal("fetch", f.fn);
    const { default: TeamPage } = await import("@/app/team/[entryId]/page");
    await TeamPage({ params: Promise.resolve({ entryId: "7" }), searchParams: Promise.resolve({ gw: "5" }) });
    // Guessed GW5 first (wasted but harmless), then the real GW6 once the entry said it started in GW6.
    expect(f.seen.filter((u) => u.includes("/picks/")).map((u) => u.match(/event\/(\d+)/)![1])).toEqual(["5", "6"]);
  });
});

describe("optional data never takes the team page down", () => {
  const entry = { id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6 };
  const render = async () => {
    const { default: TeamPage } = await import("@/app/team/[entryId]/page");
    const { renderToStaticMarkup } = await import("react-dom/server");
    return renderToStaticMarkup(await TeamPage({ params: Promise.resolve({ entryId: "7" }), searchParams: Promise.resolve({}) }));
  };
  const world = (extra: Record<string, unknown>) =>
    routedFetch({ "/bootstrap-static/": bootstrap, "/entry/7/event/6/picks/": picks, "/event/6/live/": live, "/entry/7/history/": historyBody, ...extra, "/entry/7/": entry });

  it.each([
    ["history with the wrong shape", { "/entry/7/history/": { unexpected: true } }],
    ["history that is null", { "/entry/7/history/": null }],
    ["a schedule that is not a list", { "/api/fixtures/": { nope: 1 } }],
  ])("still renders with %s", async (_name, extra) => {
    vi.stubGlobal("fetch", world(extra).fn);
    const html = await render();
    expect(html).toContain("Gaucho F.C.");
    expect(html).toContain("Starting XI");
  });

  it("normalises a partial history to empty lists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ current: [{ event: 1 }] })));
    const { getEntryHistory } = await import("@/lib/fpl");
    expect(await getEntryHistory(7)).toEqual({ current: [{ event: 1 }], past: [], chips: [] });
  });
});

describe("history caching", () => {
  it("tags history fetches; snapshots are cached for a year, the list for a day", async () => {
    vi.stubEnv("API_BASE", "https://api.example");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ snapshots: [] }))
      .mockResolvedValueOnce(json({ gw: 5, taken_at: "x", league_id: 9, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const { listSnapshots, getSnapshot, historyTag } = await import("@/lib/backend");
    await listSnapshots(9);
    await getSnapshot(9, 5);
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: 86_400, tags: [historyTag(9)] });
    expect(fetchMock.mock.calls[1][1].next).toEqual({ revalidate: 31_536_000, tags: [historyTag(9)] });
  });

  it.each([
    [{ ok: true, snapshotted: true, gw: 6 }, 1],
    [{ ok: true, snapshotted: false, already_existed: true, gw: 6 }, 0],
    [{ ok: false, reason: "GW not fully over yet" }, 0],
  ])("cron revalidates history only when a snapshot was stored (%j)", async (body, calls) => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("LEAGUE_ID", "467763");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));
    const { GET } = await import("@/app/api/cron/autosnapshot/route");
    const { revalidateTag } = await import("next/cache");
    const { NextRequest } = await import("next/server");
    await GET(new NextRequest("http://localhost/api/cron/autosnapshot"));
    expect(revalidateTag).toHaveBeenCalledTimes(calls);
    if (calls) expect(revalidateTag).toHaveBeenCalledWith("history:467763");
  });
});

describe("Crest without per-crest client JS", () => {
  it("renders a lazy img and swaps to initials when it fails", async () => {
    const { Crest } = await import("@/components/ui/Crest");
    const { CrestFallback } = await import("@/components/ui/CrestFallback");
    const { container } = render(
      <>
        <Crest code={3} name="Arsenal" />
        <CrestFallback />
      </>,
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "");
    const wrap = container.querySelector("[data-crest]")!;
    expect(wrap).toHaveAttribute("data-crest", "");
    fireEvent.error(img);
    expect(wrap).toHaveAttribute("data-crest", "failed");
    expect(wrap).toHaveTextContent("A");
  });

  it("starts in the fallback state when there is no image", async () => {
    const { Crest } = await import("@/components/ui/Crest");
    const { container } = render(<Crest name="Man City" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-crest]")).toHaveAttribute("data-crest", "failed");
  });
});

describe("LiveRefresh", () => {
  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("doesn't refresh on a quick tab switch, does after the gap, and polls on the interval", async () => {
    vi.useFakeTimers();
    const { LiveRefresh } = await import("@/components/ui/LiveRefresh");
    render(<LiveRefresh enabled intervalMs={60_000} minFocusGapMs={15_000} />);

    act(() => {
      setVisibility("hidden");
      setVisibility("visible"); // straight back: data is fresh
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      setVisibility("hidden");
      vi.advanceTimersByTime(20_000);
      setVisibility("visible");
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("shows when the data arrived and keeps working after each refresh", async () => {
    const { LiveRefresh } = await import("@/components/ui/LiveRefresh");
    render(<LiveRefresh enabled />);
    const button = screen.getByRole("button", { name: "Refresh" });
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(refresh).toHaveBeenCalledTimes(2); // guard released after each completed refresh
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });
});
