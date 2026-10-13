/**
 * The League page streams: the table paints as soon as FPL returns the standings (and the cached game file), and the
 * parts fed by one request per manager (histories, squads) arrive behind a Suspense boundary.
 */
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { LeagueExtrasFallback, LeagueExtrasSections, LeagueView } from "@/components/views/LeagueView";
import { leagueHeadlines } from "@/lib/domain";
import type { EntryHistory, HistoryGameweek } from "@/lib/domain/types";
import { messagesFor, tripMessagesFor } from "@/lib/domain";
import { createLeagueService, STATS_DEADLINE_MS } from "@/lib/services/league";
import type { LeagueExtras, LeagueTable } from "@/lib/services/models";
import type { FplPort } from "@/lib/services/ports";
import { expectNoAxeViolations } from "./axe";
import { bootstrap, standing } from "./fixtures";
import { clock, fakeFpl } from "./support";

const gw = (event: number, points: number, bench = 0): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 100, bank: 5, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: bench,
});
const history = (...points: number[]): EntryHistory => ({ current: points.map((p, i) => gw(i + 1, p, 20)), past: [], chips: [] });
const league = (rows: ReturnType<typeof standing>[]) => ({ league: { id: 1, name: "The Lobster League" }, standings: { has_next: false, results: rows }, new_entries: { results: [] as unknown[] } });
const rows = [
  standing({ entry: 1, entry_name: "Alpha FC", player_name: "Ann", rank: 1, last_rank: 3, total: 320 }),
  standing({ entry: 2, entry_name: "Bravo FC", player_name: "Bob", rank: 2, last_rank: 1, total: 300 }),
  standing({ entry: 3, entry_name: "Charlie FC", player_name: "Cy", rank: 3, last_rank: 2, total: 280 }),
  standing({ entry: 4, entry_name: "Delta FC", player_name: "Di", rank: 4, last_rank: 4, total: 250 }),
];
const histories: Record<number, EntryHistory> = { 1: history(50, 60, 70, 80, 90), 2: history(40, 40, 40, 40, 40), 3: history(30, 50, 30, 50, 30), 4: history(20, 20, 20, 20, 20) };
const never = <T,>() => new Promise<T>(() => {});
const service = (over: Partial<FplPort> = {}) => createLeagueService(fakeFpl({ standings: async () => league(rows), history: async (e: number) => histories[e], ...over }), { now: clock });

/** Lets every already-settled promise chain run, without advancing time. */
const drain = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
/** Whether `p` has settled by now (after the microtasks queued so far). */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  void p.then(() => (done = true));
  await drain();
  return done;
}

/** The core model and the whole one, through the real service. */
async function models(): Promise<{ core: LeagueTable; full: LeagueTable }> {
  const { model, extras } = await service().loadStreaming(1);
  if (model.kind !== "ok") throw new Error("expected ok");
  return { core: model, full: { ...model, ...(await extras) } };
}

afterEach(() => {
  vi.useRealTimers();
  setRequestLocale("en");
  setRequestTrip(false);
});

// ------------------------------------------------------------------------------------------------ (a) the service

describe("league service: loadStreaming", () => {
  it("hands over the table without waiting for histories or squads that never answer", async () => {
    const svc = service({ history: () => never(), picks: () => never(), live: () => never(), allFixtures: () => never() });
    const streaming = svc.loadStreaming(1);
    expect(await settled(streaming)).toBe(true); // no timers advanced: nothing waited on the per-manager requests
    const { model, extras, pending } = await streaming;
    expect(pending).toBe(true);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.rows.map((r) => r.entry_name)).toEqual(["Alpha FC", "Bravo FC", "Charlie FC", "Delta FC"]);
    expect(model).toMatchObject({ name: "The Lobster League", gameweek: { name: "Gameweek 6", status: "live" }, gameweekUnavailable: false, currentGw: 6, truncated: false, newEntries: 0 });
    expect(model.summary).toMatchObject({ leader: { entryName: "Alpha FC", total: 320 }, managers: 4 });
    // The placeholders: no stats, and the storylines the table alone can tell (the title race among them).
    expect(model).toMatchObject({ stats: null, statsPhase: null });
    expect(model.headlines).toEqual(leagueHeadlines(model.rows, null));
    expect(model.headlines.some((h) => h.kind === "titleRace")).toBe(true);
    expect(await settled(extras)).toBe(false); // still waiting on the managers
  });

  it("starts the per-manager requests before the game file is back, but paints only once it is", async () => {
    let releaseBootstrap!: () => void;
    const asked: number[] = [];
    const svc = service({
      bootstrap: () => new Promise((r) => (releaseBootstrap = () => r(bootstrap))),
      history: async (e: number) => (asked.push(e), histories[e]),
    });
    const streaming = svc.loadStreaming(1);
    await drain();
    expect(asked.sort()).toEqual([1, 2, 3, 4]);
    expect(await settled(streaming)).toBe(false); // the gameweek badge and polling need the game file
    releaseBootstrap();
    expect(await settled(streaming)).toBe(true);
  });

  it("load() is the core with the extras laid over it", async () => {
    const { model, extras } = await service().loadStreaming(1);
    const loaded = await service().load(1);
    expect(loaded).toEqual({ ...model, ...(await extras) });
    if (loaded.kind !== "ok" || !loaded.stats) throw new Error("expected stats");
    expect(Object.keys(loaded.stats.byEntry)).toEqual(["1", "2", "3", "4"]);
    expect(loaded.statsPhase).toBe("live");
    expect(loaded.headlines).toEqual(leagueHeadlines(loaded.rows, loaded.stats));
  });

  it("is not pending, and is already whole, when there are no extras to wait for", async () => {
    const history_ = vi.fn(() => never<EntryHistory | null>());
    // The game file failing: the extras need it, so the table is the page, even with histories that never answer.
    const down = await service({ bootstrap: () => Promise.reject(new Error("game updating")), history: history_ }).loadStreaming(1);
    expect(down.pending).toBe(false);
    expect(down.model).toMatchObject({ kind: "ok", gameweekUnavailable: true, stats: null });
    expect(await down.extras).toEqual({ stats: null, statsPhase: null, headlines: leagueHeadlines(rows, null) });

    const big = Array.from({ length: 61 }, (_, i) => standing({ entry: i + 1, rank: i + 1, total: 1000 - i }));
    const tooBig = await service({ standings: async () => league(big) }).loadStreaming(1);
    expect(tooBig.pending).toBe(false);

    const unknown = await service({ standings: async () => null }).loadStreaming(1);
    expect(unknown).toMatchObject({ model: { kind: "not-found", leagueId: 1 }, pending: false });
    await expect(unknown.extras).resolves.toMatchObject({ stats: null });
  });

  it("still rejects loudly when the standings fail (the table is the page)", async () => {
    await expect(service({ standings: async () => { throw new Error("FPL 503"); } }).loadStreaming(1)).rejects.toThrow("FPL 503");
  });
});

// ------------------------------------------------------------------------------------------------ (b) never rejects

describe("league service: the extras promise never rejects", () => {
  const none = { stats: null, statsPhase: null };

  it("resolves to no extras when every history and the squads' requests reject", async () => {
    const down = () => Promise.reject(new Error("FPL down"));
    const { extras } = await service({ history: down, picks: down, live: down, allFixtures: down }).loadStreaming(1);
    await expect(extras).resolves.toMatchObject(none);
  });

  it("resolves after the deadline with whatever arrived when histories and picks hang", async () => {
    vi.useFakeTimers();
    const { extras } = await service({ history: (e: number) => (e === 1 ? Promise.resolve(histories[1]) : never()), picks: () => never() }).loadStreaming(1);
    expect(await settled(extras)).toBe(false);
    await vi.advanceTimersByTimeAsync(STATS_DEADLINE_MS + 1);
    const got = await extras;
    expect(Object.keys(got.stats?.byEntry ?? {})).toEqual(["1"]);
    expect(got.stats?.squad).toBeUndefined(); // no manager's picks in time
  });

  it("resolves to no extras when the data trips the arithmetic", async () => {
    const poisoned = { get current(): never { throw new Error("malformed"); }, past: [], chips: [] } as unknown as EntryHistory;
    const { extras } = await service({ history: async () => poisoned }).loadStreaming(1);
    await expect(extras).resolves.toEqual({ ...none, headlines: leagueHeadlines(rows, null) });
  });

  it("leaves no unhandled rejection behind when nobody awaits the extras", async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const down = () => Promise.reject(new Error("FPL down"));
      await service({ history: down, picks: down, live: down, allFixtures: down }).loadStreaming(1);
      await service({ standings: async () => null, bootstrap: down }).loadStreaming(1);
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(seen).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ (c) the views

describe("LeagueView, streamed", () => {
  const t = messagesFor("en");

  it("renders the table with no extras, holding their place, then the extras when they arrive", async () => {
    const { core, full } = await models();
    const first = render(<LeagueView model={core} extras={<LeagueExtrasFallback model={core} />} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((c) => within(c).getByRole("link").textContent)).toEqual(["Alpha FC", "Bravo FC", "Charlie FC", "Delta FC"]);
    expect(screen.getByRole("status")).toHaveTextContent(new RegExp(t.loading.leagueExtras.join("|")));
    // Rows that depend on the extras just lack them for now: no badges, no stats buttons, no awards.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(first.container.querySelectorAll('[aria-hidden="true"][style*="border-radius"]').length).toBeGreaterThan(10); // skeletons
    expect(screen.queryByRole("heading", { name: t.league.awardsHeading })).toBeNull();
    expect(first.container.textContent).not.toMatch(t.table.winner(5));
    // The leader's hint comes from the table alone, so it reads the same before and after.
    const leaderHint = (c: HTMLElement) => c.querySelector("dl")?.textContent;
    const before = leaderHint(first.container);
    first.unmount();

    const second = render(<LeagueView model={core} extras={<LeagueExtrasSections model={full} />} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("heading", { name: t.league.awardsHeading })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(leaderHint(second.container)).toBe(before);
  });

  it("the streamed page, once complete, is exactly the page rendered in one go", async () => {
    const { core, full } = await models();
    expect(renderToStaticMarkup(<LeagueView model={core} extras={<LeagueExtrasSections model={full} />} />)).toBe(renderToStaticMarkup(<LeagueView model={full} />));
  });

  it("the stats columns keep their place while pending, so the table does not reflow", async () => {
    const { core, full } = await models();
    const headers = (el: React.ReactElement) => {
      const r = render(el);
      const out = within(r.container.querySelector("table")!).getAllByRole("columnheader").map((h) => h.textContent);
      r.unmount();
      return out;
    };
    expect(headers(<LeagueExtrasFallback model={core} />)).toEqual(headers(<LeagueExtrasSections model={full} />));
  });

  it("extras that come back empty leave the plain table, with nothing held open", async () => {
    const { core } = await models();
    const { container } = render(<LeagueView model={core} extras={<LeagueExtrasSections model={core} />} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"][style*="border-radius"]')).toHaveLength(0); // no skeletons
    expect(screen.getAllByRole("rowheader")).toHaveLength(4);
  });

  it("says it in Spanish, French and the blotter", async () => {
    const { core } = await models();
    for (const locale of ["es", "fr"] as const) {
      setRequestLocale(locale);
      const r = render(<LeagueExtrasFallback model={core} />);
      expect(screen.getByRole("status")).toHaveTextContent(new RegExp(messagesFor(locale).loading.leagueExtras.join("|")));
      r.unmount();
    }
    setRequestLocale("en");
    setRequestTrip(true);
    render(<LeagueExtrasFallback model={core} />);
    expect(screen.getByRole("status")).toHaveTextContent(new RegExp(tripMessagesFor("en").loading.leagueExtras.join("|")));
  });

  it("the app's async child awaits the extras and renders the same sections", async () => {
    const { LeagueExtrasStream, ifAlreadyIn } = await import("@/app/_league/Extras");
    const { core, full } = await models();
    let resolve!: (e: LeagueExtras) => void;
    const extras = new Promise<LeagueExtras>((r) => (resolve = r));
    expect(await ifAlreadyIn(extras)).toBeNull();
    const element = LeagueExtrasStream({ model: core, extras });
    expect(await settled(element)).toBe(false);
    resolve({ stats: full.stats, statsPhase: full.statsPhase, headlines: full.headlines });
    expect(renderToStaticMarkup(await element)).toBe(renderToStaticMarkup(<LeagueExtrasSections model={full} />));
    expect(await ifAlreadyIn(extras)).toMatchObject({ statsPhase: full.statsPhase });
  });
});

// ------------------------------------------------------------------------------------------------ (d) accessibility

describe("the extras' loading state is accessible", () => {
  it("has no axe violations, in the normal view and the blotter", async () => {
    const { core } = await models();
    const normal = render(<LeagueView model={core} extras={<LeagueExtrasFallback model={core} />} />);
    await expectNoAxeViolations(normal.container);
    normal.unmount();
    setRequestTrip(true);
    const trip = render(<LeagueView model={core} extras={<LeagueExtrasFallback model={core} />} />);
    await expectNoAxeViolations(trip.container);
  });
});

// ------------------------------------------------------------------------------------------------ the page

describe("the League page", () => {
  type Held = { url: string; release: () => void };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  /** FPL as a fetch stub; the per-manager requests (histories, picks, live points, schedule) are held until released. */
  function stubFpl(hold = true) {
    const held: Held[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = String(input);
        if (url.includes("/leagues-classic/")) return Promise.resolve(json(league(rows)));
        if (url.includes("/bootstrap-static/")) return Promise.resolve(json(bootstrap));
        const history = /\/entry\/(\d+)\/history\/$/.exec(url);
        const answer = () => (history ? json(histories[Number(history[1])]) : new Response("nope", { status: 404 }));
        return hold ? new Promise<Response>((r) => held.push({ url, release: () => r(answer()) })) : Promise.resolve(answer());
      }),
    );
    return held;
  }

  it("paints the table while the managers' histories are still out, with the extras behind a Suspense boundary", async () => {
    const held = stubFpl();
    const { default: LeaguePage } = await import("@/app/page");
    const element = await LeaguePage(); // resolves with every per-manager request still held
    expect(held.some((h) => h.url.includes("/history/"))).toBe(true);
    const html = renderToStaticMarkup(element); // a synchronous render shows the boundary's fallback
    for (const name of ["Alpha FC", "Bravo FC", "Charlie FC", "Delta FC"]) expect(html).toContain(name);
    expect(html).toMatch(/role="status"/);
    expect(html).not.toContain(messagesFor("en").league.awardsHeading);
    held.forEach((h) => h.release());
  });

  it("renders in one pass, with no placeholder to flash, when the extras are already in", async () => {
    stubFpl(false);
    const { default: LeaguePage } = await import("@/app/page");
    const html = renderToStaticMarkup(await LeaguePage());
    expect(html).not.toMatch(/role="status"/);
    expect(html).toContain(messagesFor("en").league.awardsHeading);
  });
});
