/**
 * Characterisation ("golden") tests: every route is rendered to static HTML from a mocked FPL API and compared
 * with files in tests/golden/. They pin the user-visible output, so refactors that must not change behaviour
 * (e.g. the clean-architecture split) are proven rather than assumed. Update deliberately with `vitest -u`.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, event, fixture, live, picks, standing } from "./fixtures";

const NOW = new Date("2026-10-11T12:00:00Z");

type Handler = unknown | ((url: string) => Response);
type Routes = [match: (url: string) => boolean, handler: Handler][];

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const has = (s: string) => (url: string) => url.includes(s);
const ends = (s: string) => (url: string) => url.endsWith(s);

const standings = (over: Partial<{ results: unknown[]; has_next: boolean; name: string; newEntries: unknown[] }> = {}) => ({
  league: { id: 467763, name: over.name ?? "The Lobster League" },
  standings: { has_next: over.has_next ?? false, results: over.results ?? [] },
  new_entries: { results: over.newEntries ?? [] },
});

const entry = (over = {}) => ({ id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6, ...over });

const rows = [
  standing({ entry: 1, rank: 1, last_rank: 1, total: 433, event_total: 52 }),
  standing({ entry: 7, entry_name: "Gaucho F.C.", player_name: "gian jaen", rank: 2, last_rank: 4, total: 427, event_total: 54, club_badge_src: "https://example.com/b.png" }),
  standing({ entry: 9, entry_name: "New Team", player_name: "Newbie", rank: 3, last_rank: 0, total: 300, event_total: 61 }),
];

const official = (h: [number, number][], a: [number, number][]) => ({
  identifier: "bonus",
  h: h.map(([element, value]) => ({ element, value })),
  a: a.map(([element, value]) => ({ element, value })),
});
const bps = (h: [number, number][], a: [number, number][]) => ({
  identifier: "bps",
  h: h.map(([element, value]) => ({ element, value })),
  a: a.map(([element, value]) => ({ element, value })),
});

const fixtures = [
  fixture({ id: 1 }), // live, projected bonus from BPS
  fixture({ id: 2, finished: true, finished_provisional: true, minutes: 90, team_h_score: 0, team_a_score: 3,
    stats: [bps([[2, 30]], [[4, 50], [6, 40], [5, 20]]), official([], [[4, 3], [6, 2], [5, 1]])], kickoff_time: "2026-10-10T14:00:00Z" }),
  fixture({ id: 3, started: false, finished: false, team_h_score: null, team_a_score: null, minutes: 0, stats: [], kickoff_time: "2026-10-12T19:00:00Z" }),
  fixture({ id: 4, finished: false, finished_provisional: true, minutes: 90, stats: [bps([[1, 40]], [[4, 41]]), official([[1, 2]], [[4, 3]])], kickoff_time: "2026-10-10T09:00:00Z" }),
  fixture({ id: 5, started: true, minutes: 12, team_h_score: 0, team_a_score: 0, stats: [], kickoff_time: "2026-10-10T20:00:00Z" }), // live, no bonus data
  fixture({ id: 6, started: false, team_h_score: null, team_a_score: null, minutes: 0, stats: [], kickoff_time: null }), // postponed
];

const snapshot = { gw: 5, taken_at: "2026-10-06T06:00:00Z", league_id: 467763, data: standings({ results: rows, name: "The Lobster League" }) };

/** The default world: season in progress, GW6 live, GW5 final. */
function world(over: Routes = [], opts: { events?: unknown[] } = {}): Routes {
  const bs = opts.events ? { ...bootstrap, events: opts.events } : bootstrap;
  return [
    ...over,
    [has("/bootstrap-static/"), bs],
    [has("/leagues-classic/"), standings({ results: rows })],
    [has("/entry/7/event/"), picks],
    [ends("/entry/7/"), entry()],
    [has("/event/6/live/"), live],
    [has("/event/5/live/"), live],
    [has("/fixtures/?event=6"), fixtures],
    [has("/fixtures/?event=5"), fixtures.map((f) => ({ ...f, finished: true, finished_provisional: true, started: true }))],
    [has("/history/467763/5"), snapshot],
    [ends("/history/467763"), { league_id: 467763, snapshots: [{ gw: 5, taken_at: "2026-10-06T06:00:00Z" }, { gw: 3, taken_at: "2026-09-22T06:00:00Z" }] }],
  ];
}

function stubFetch(routes: Routes) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const hit = routes.find(([match]) => match(String(url)));
      if (!hit) return new Response("nope", { status: 404 });
      const handler = hit[1];
      return typeof handler === "function" ? (handler as (u: string) => Response)(String(url)) : jsonRes(handler);
    }),
  );
}

const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/></g, ">\n<") + "\n";
const golden = (name: string) => `./golden/${name}.html`;

/** Render a page; thrown errors become part of the snapshot (so error semantics are pinned too). */
async function show(run: () => Promise<ReactElement>) {
  try {
    return html(await run());
  } catch (e) {
    return `THROWS: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}\n`;
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const gwParams = (gw?: string) => Promise.resolve(gw ? { gw } : {});

describe("league page", () => {
  const render = async () => (await import("@/app/page")).default();

  it("shows the live table", async () => {
    stubFetch(world());
    await expect(await show(render)).toMatchFileSnapshot(golden("home-live"));
  });
  it("shows the final-GW table", async () => {
    stubFetch(world([], { events: [event({ id: 5, name: "Gameweek 5", is_current: true, finished: true, data_checked: true })] }));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-final"));
  });
  it("explains an unknown league", async () => {
    stubFetch(world([[has("/leagues-classic/"), () => new Response("x", { status: 404 })]]));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-not-found"));
  });
  it("handles an empty league with new entries", async () => {
    stubFetch(world([[has("/leagues-classic/"), standings({ newEntries: [{}, {}] })]]));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-empty"));
  });
  it("handles pre-season", async () => {
    stubFetch(world([], { events: [event({ id: 1, name: "Gameweek 1", is_current: false, finished: false, deadline_time: "2026-12-01T00:00:00Z" })] }));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-preseason"));
  });
  it("says when there are more pages than shown", async () => {
    stubFetch(world([[(u) => u.includes("/leagues-classic/") && !u.includes("page_standings"), standings({ results: rows, has_next: true })], [has("page_standings"), standings({ results: [], has_next: true })]]));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-many-pages"));
  });
  it("surfaces upstream outages", async () => {
    stubFetch(world([[has("/leagues-classic/"), () => new Response("busy", { status: 503 })]]));
    await expect(await show(render)).toMatchFileSnapshot(golden("home-outage"));
  });
});

describe("team page", () => {
  const render = async (id = "7", gw?: string) =>
    (await import("@/app/team/[entryId]/page")).default({ params: Promise.resolve({ entryId: id }), searchParams: gwParams(gw) });

  it("shows the live team sheet", async () => {
    stubFetch(world());
    await expect(await show(() => render())).toMatchFileSnapshot(golden("team-live"));
  });
  it("shows a finished gameweek via ?gw=", async () => {
    stubFetch(world());
    await expect(await show(() => render("7", "5"))).toMatchFileSnapshot(golden("team-final"));
  });
  it("falls back to the current GW for a bad ?gw=", async () => {
    stubFetch(world());
    await expect(await show(() => render("7", "99"))).toMatchFileSnapshot(golden("team-bad-gw"));
  });
  it("still shows the team when live points are unavailable", async () => {
    stubFetch(world([[has("/event/6/live/"), () => new Response("x", { status: 500 })]]));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("team-no-live"));
  });
  it("explains a gameweek without picks", async () => {
    stubFetch(world([[has("/entry/7/event/"), () => new Response("x", { status: 404 })]]));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("team-no-picks"));
  });
  it("explains a team that joins later", async () => {
    stubFetch(world([[ends("/entry/7/"), entry({ started_event: 9 })]]));
    await expect(await show(() => render("7", "5"))).toMatchFileSnapshot(golden("team-not-started"));
  });
  it("shows a team that started this gameweek, ignoring an earlier ?gw=", async () => {
    stubFetch(world([[ends("/entry/7/"), entry({ started_event: 6 })]]));
    await expect(await show(() => render("7", "5"))).toMatchFileSnapshot(golden("team-late-start"));
  });
  it("handles pre-season", async () => {
    stubFetch(world([], { events: [event({ id: 1, name: "Gameweek 1", is_current: false, deadline_time: "2026-12-01T00:00:00Z" })] }));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("team-preseason"));
  });
  it("404s unknown and malformed teams", async () => {
    stubFetch(world([[ends("/entry/7/"), () => new Response("x", { status: 404 })]]));
    const out = [await show(() => render()), await show(() => render("abc")), await show(() => render("0")), await show(() => render("12345678901"))].join("");
    await expect(out).toMatchFileSnapshot(golden("team-not-found"));
  });
  it("generates a title", async () => {
    stubFetch(world());
    const { generateMetadata } = await import("@/app/team/[entryId]/page");
    const titles = [
      await generateMetadata({ params: Promise.resolve({ entryId: "7" }), searchParams: gwParams() }),
      await generateMetadata({ params: Promise.resolve({ entryId: "x" }), searchParams: gwParams() }),
    ];
    await expect(JSON.stringify(titles, null, 2) + "\n").toMatchFileSnapshot(golden("team-metadata").replace(".html", ".json"));
  });
});

describe("bonus page", () => {
  const render = async (gw?: string) => (await import("@/app/bonus/page")).default({ searchParams: gwParams(gw) });

  it("shows every fixture state", async () => {
    stubFetch(world());
    await expect(await show(() => render())).toMatchFileSnapshot(golden("bonus-live"));
  });
  it("shows a finished gameweek via ?gw=", async () => {
    stubFetch(world());
    await expect(await show(() => render("5"))).toMatchFileSnapshot(golden("bonus-final"));
  });
  it("handles a gameweek with no fixtures", async () => {
    stubFetch(world([[has("/fixtures/?event=6"), []]]));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("bonus-empty"));
  });
  it("handles pre-season", async () => {
    stubFetch(world([], { events: [event({ id: 1, name: "Gameweek 1", is_current: false, deadline_time: "2026-12-01T00:00:00Z" })] }));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("bonus-preseason"));
  });
  it("falls back to unknown player/team names", async () => {
    stubFetch(world([[has("/fixtures/?event=6"), [fixture({ id: 9, team_h: 98, team_a: 99, stats: [bps([[777, 40]], [[778, 30]]), official([], [])] })]]]));
    await expect(await show(() => render())).toMatchFileSnapshot(golden("bonus-unknown-ids"));
  });
});

describe("history pages", () => {
  const list = async () => (await import("@/app/history/page")).default();
  const one = async (gw: string) => (await import("@/app/history/[gw]/page")).default({ params: Promise.resolve({ gw }) });

  it("lists snapshots newest first", async () => {
    stubFetch(world());
    await expect(await show(list)).toMatchFileSnapshot(golden("history-list"));
  });
  it("handles no snapshots", async () => {
    stubFetch(world([[ends("/history/467763"), { league_id: 467763, snapshots: [] }]]));
    await expect(await show(list)).toMatchFileSnapshot(golden("history-empty"));
  });
  it("surfaces a backend outage", async () => {
    stubFetch(world([[ends("/history/467763"), () => new Response("x", { status: 502 })]]));
    await expect(await show(list)).toMatchFileSnapshot(golden("history-outage"));
  });
  it("shows a snapshot", async () => {
    stubFetch(world());
    await expect(await show(() => one("5"))).toMatchFileSnapshot(golden("history-snapshot"));
  });
  it("explains a missing snapshot and 404s bad gameweeks", async () => {
    stubFetch(world([[has("/history/467763/7"), () => new Response("x", { status: 404 })]]));
    const out = [await show(() => one("7")), await show(() => one("0")), await show(() => one("39")), await show(() => one("abc"))].join("");
    await expect(out).toMatchFileSnapshot(golden("history-missing"));
  });
  it("generates titles", async () => {
    const { generateMetadata } = await import("@/app/history/[gw]/page");
    const t = [await generateMetadata({ params: Promise.resolve({ gw: "5" }) }), await generateMetadata({ params: Promise.resolve({ gw: "x" }) })];
    await expect(JSON.stringify(t) + "\n").toMatchFileSnapshot(golden("history-metadata").replace(".html", ".json"));
  });
});
