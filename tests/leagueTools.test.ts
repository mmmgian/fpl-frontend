import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLeagueTools, chipCell, chipTracker, compareRivals, injuryWatch, INJURY_ROWS, leagueDifferentials, leagueTemplate, parseVs, type LeagueManager, type LeagueSquad } from "@/lib/domain/leagueTools";
import type { Bootstrap, BootstrapChip, EntryHistory, EntryPicks, FplElement, Pick } from "@/lib/domain/types";
import { LEAGUE_TOOLS_CAP, startLeagueTools } from "@/lib/services/leagueTools";
import { STATS_DEADLINE_MS } from "@/lib/services/shared";
import { createToolsService } from "@/lib/services/tools";
import { event, standing } from "./fixtures";
import { fakeFpl } from "./support";
import { NOW, bootstrap as world, league, picksFor, schedule } from "./toolsWorld";

/** FPL's 2025/26 shape: every chip twice, once per half. */
const WINDOWS: BootstrapChip[] = ["wildcard", "freehit", "bboost", "3xc"].flatMap((name) => [
  { name, start_event: 1, stop_event: 19 },
  { name, start_event: 20, stop_event: 38 },
]);
const bs: Bootstrap = { ...world, chips: WINDOWS };

const manager = (i: number): LeagueManager => ({ entry: 100 + i, teamName: `Team ${i + 1}`, manager: `Manager ${i + 1}`, rank: i + 1 });
const pick = (element: number, position: number, captain = false): Pick => ({ element, position, multiplier: position > 11 ? 0 : captain ? 2 : 1, is_captain: captain, is_vice_captain: false });
const squad = (i: number, picks: Pick[], activeChip: string | null = null): LeagueSquad => ({ manager: manager(i), picks, activeChip });
const history = (chips: { name: string; event: number }[]): EntryHistory => ({ current: [], past: [], chips });

/** A legal 1-4-4-2 XI from the world's ids (1 keeper, 3-6 defenders, 8-11 midfielders, 13-14 forwards) plus a bench. */
const XI: Pick[] = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14].map((e, i) => pick(e, i + 1, e === 13)).concat([pick(2, 12), pick(7, 13), pick(12, 14), pick(15, 15)]);

describe("chip cells against FPL's windows", () => {
  const w = WINDOWS.filter((x) => x.name === "wildcard");
  it("is open until the window shuts, and says when the second one opens", () => {
    expect(chipCell(w, [], 7)).toEqual({ state: "open", until: 19, next: 20 });
  });
  it("shows the gameweek a chip was played in, and still points at the second half", () => {
    expect(chipCell(w, [{ name: "wildcard", event: 3 }], 7)).toEqual({ state: "used", gw: 3, next: 20 });
  });
  it("judges the second half on its own once the deadline is in it", () => {
    expect(chipCell(w, [{ name: "wildcard", event: 3 }], 25)).toEqual({ state: "open", until: 38, next: null });
    expect(chipCell(w, [{ name: "wildcard", event: 3 }, { name: "wildcard", event: 22 }], 25)).toEqual({ state: "used", gw: 22, next: null });
  });
  it("calls a chip that wasn't played in its window gone, and shows a window that hasn't opened as later", () => {
    expect(chipCell(w, [], 25).state).toBe("open");
    expect(chipCell([{ name: "wildcard", start_event: 20, stop_event: 38 }], [], 7)).toEqual({ state: "later", from: 20 });
    expect(chipCell([{ name: "wildcard", start_event: 1, stop_event: 5 }], [], 7)).toEqual({ state: "gone", next: null });
  });
  it("after the season, judges against the last window rather than a deadline that doesn't exist", () => {
    expect(chipCell(w, [], null)).toEqual({ state: "gone", next: null });
  });
  it("says 'none' when FPL lists no window for the chip", () => {
    expect(chipCell([], [], 7)).toEqual({ state: "none" });
  });
});

describe("the chip tracker", () => {
  const managers = [manager(0), manager(1), manager(2)];
  it("counts who holds each chip at the next deadline and what each has left", () => {
    const h = new Map([
      [100, { chips: [{ name: "wildcard", event: 2 }] }],
      [101, { chips: [] }],
    ]);
    const c = chipTracker(managers, h, WINDOWS, 7)!;
    expect(c.known).toBe(2);
    expect(c.windowsKnown).toBe(true);
    expect(c.holders).toEqual({ wildcard: 1, freehit: 2, bboost: 2, "3xc": 2 });
    expect(c.rows.map((r) => r.left)).toEqual([7, 8, null]);
    expect(c.rows[0].played).toEqual([{ name: "wildcard", gw: 2 }]);
    // a manager whose history didn't arrive stays listed, unavailable rather than chipless
    expect(c.rows[2]).toMatchObject({ entry: 102, played: null, cells: null, left: null });
  });
  it("never assumes windows: without them it lists only the chips played", () => {
    const c = chipTracker(managers, new Map([[100, { chips: [{ name: "bboost", event: 4 }] }]]), undefined, 7)!;
    expect(c.windowsKnown).toBe(false);
    expect(c.holders).toBeNull();
    expect(c.rows[0]).toMatchObject({ played: [{ name: "bboost", gw: 4 }], cells: null, left: null });
  });
  it("ignores malformed windows and history rows rather than trusting them", () => {
    const bad = [{ name: "wildcard", start_event: 9, stop_event: 3 }, { name: "freehit", start_event: Number.NaN, stop_event: 4 }] as BootstrapChip[];
    expect(chipTracker(managers, new Map([[100, { chips: [] }]]), bad, 7)!.windowsKnown).toBe(false);
    const junk = [{ name: "wildcard", event: 2 }, { name: 5, event: 1 }, null, { name: "freehit", event: 1.5 }] as unknown as { name: string; event: number }[];
    expect(chipTracker(managers, new Map([[100, { chips: junk }]]), WINDOWS, 7)!.rows[0].played).toEqual([{ name: "wildcard", gw: 2 }]);
  });
  it("is null when no history arrived at all", () => {
    expect(chipTracker(managers, new Map(), WINDOWS, 7)).toBeNull();
  });
});

describe("the injury watch", () => {
  const flagged = (over: Partial<FplElement>): Bootstrap => ({ ...world, elements: world.elements.map((e) => (e.id === over.id ? { ...e, ...over } : e)) });
  it("lists only flagged players the league owns, most started first, with FPL's own news and chance", () => {
    let b = flagged({ id: 8, status: "d", chance_of_playing_next_round: 75, news: " Knock - 75% chance of playing " });
    b = { ...b, elements: b.elements.map((e) => (e.id === 15 ? { ...e, status: "s", news: "Suspended until 20 Oct" } : e)) };
    const rows = injuryWatch(b, [squad(0, [pick(8, 1), pick(15, 12), pick(99, 13)]), squad(1, [pick(8, 2, true), pick(15, 14)]), squad(2, [pick(1, 1)])]);
    expect(rows.map((r) => [r.name, r.status, r.chance, r.owners, r.starters, r.captains])).toEqual([
      ["Player8", "d", 75, 2, 2, 1],
      ["Player15", "s", null, 2, 0, 0],
      ["Injured", "i", null, 1, 0, 0],
    ]);
    expect(rows[0].news).toBe("Knock - 75% chance of playing");
    expect(rows[0].teams).toEqual(["Team 1", "Team 2"]);
  });
  it("skips element ids FPL doesn't know, and counts a duplicated pick once", () => {
    const rows = injuryWatch(world, [squad(0, [pick(99, 1), pick(99, 2), pick(12345, 3)])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 99, owners: 1, starters: 1 });
  });
  it("is empty, not an error, when nobody is flagged", () => {
    expect(injuryWatch(world, [squad(0, XI)])).toEqual([]);
  });
});

describe("the league template and differentials", () => {
  it("needs two squads: one squad is its own template", () => {
    expect(leagueTemplate(world, [squad(0, XI)])).toBeNull();
    expect(leagueDifferentials(world, [squad(0, XI)])).toBeNull();
    expect(leagueTemplate(world, [])).toBeNull();
  });
  it("builds the most-owned legal eleven, with each player's share and every team's coverage", () => {
    // the second team has an id FPL does not know in place of 3, so 3 is owned by two of three
    const other = XI.map((p) => (p.element === 3 ? { ...p, element: 12345 } : p));
    const t = leagueTemplate(world, [squad(0, XI), squad(1, other), squad(2, XI)])!;
    expect(t.managers).toBe(3);
    expect(t.formation).toMatch(/^[345]-[2-5]-[123]$/);
    const players = t.lines.flatMap((l) => l.players);
    const ids = players.map((p) => p.id);
    expect(ids).toHaveLength(11);
    expect(ids.filter((id) => id <= 2)).toHaveLength(1);                  // one keeper
    expect(ids).not.toContain(12345);                                    // unknown to FPL
    expect(players.find((p) => p.id === 13)!.share).toBe(100);
    expect(players.every((p) => p.id === 3 ? p.share === 66.7 : p.share === 100)).toBe(true);
    expect(t.coverage.map((c) => c.owned)).toEqual([11, ids.includes(3) ? 10 : 11, 11]);
  });
  it("falls back to the most-owned eleven, without a formation, when no legal one can be made", () => {
    const noKeeper = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((e, i) => pick(e, i + 1));
    const t = leagueTemplate(world, [squad(0, noKeeper), squad(1, noKeeper)])!;
    expect(t.formation).toBeNull();
    expect(t.lines.flatMap((l) => l.players)).toHaveLength(11);
  });
  it("finds each team's unique players, ignoring ids FPL doesn't know", () => {
    const a = [pick(13, 1, true), pick(8, 2), pick(12345, 3)];
    const b = [pick(13, 1, true), pick(9, 12)];
    const d = leagueDifferentials(world, [squad(0, a), squad(1, b)])!;
    expect(d.map((m) => m.players.map((p) => [p.name, p.starter, p.captain]))).toEqual([[["Player8", true, false]], [["Player9", false, false]]]);
  });
});

describe("head to head", () => {
  it("parses ?vs strictly: two different positive ids, nothing else", () => {
    expect(parseVs("101,102")).toEqual([101, 102]);
    expect(parseVs(["101", "102"])).toEqual([101, 102]);
    expect(parseVs(" 101 , 102 ")).toEqual([101, 102]);
    for (const bad of [undefined, null, "", "101", "101,101", "101,102,103", "0,5", "-1,2", "1.5,2", "1e3,2", "abc,1", "01,2", "12345678901,2", "1,2".padEnd(41, " "), "<script>,1"]) {
      expect(parseVs(bad as string), String(bad)).toBeNull();
    }
  });
  it("splits shared and unique players, names the captains and reads chips in hand", () => {
    const chips = chipTracker([manager(0), manager(1)], new Map([[100, { chips: [{ name: "wildcard", event: 2 }] }]]), WINDOWS, 7);
    const c = compareRivals(world, squad(0, [pick(13, 1, true), pick(8, 2)], "bboost"), squad(1, [pick(13, 1), pick(9, 2, true)]), chips);
    expect(c.shared.map((p) => p.name)).toEqual(["Player13"]);
    expect(c.a).toMatchObject({ captain: "Player13", activeChip: "bboost", chipsOpen: ["freehit", "bboost", "3xc"] });
    expect(c.b).toMatchObject({ captain: "Player9", activeChip: null, chipsOpen: null });
    expect(c.a.only.map((p) => p.name)).toEqual(["Player8"]);
  });
  it("flags a vs that isn't two of the league's read squads, and ignores an empty one", () => {
    const managers = [manager(0), manager(1), manager(2)];
    const squads = new Map([[100, { picks: XI, active_chip: null }], [101, { picks: XI, active_chip: null }]]);
    const build = (vs?: string | string[]) => buildLeagueTools({ bootstrap: bs, total: 3, managers, gw: 6, nextGw: 7, squads, histories: new Map(), vs })!.rivals!;
    expect(build("100,101")).toMatchObject({ selected: [100, 101], invalid: false });
    expect(build("100,101").compare).not.toBeNull();
    expect(build("100,102")).toMatchObject({ selected: null, invalid: true, compare: null }); // 102's squad wasn't read
    expect(build("100,999")).toMatchObject({ invalid: true });
    expect(build("junk")).toMatchObject({ invalid: true });
    expect(build("")).toMatchObject({ invalid: false, selected: null });
    expect(build()).toMatchObject({ invalid: false, selected: null });
    expect(build().options.map((o) => o.entry)).toEqual([100, 101]);
  });
});

describe("building the set", () => {
  it("is null for an empty league", () => {
    expect(buildLeagueTools({ bootstrap: bs, total: 0, managers: [], gw: 6, nextGw: 7, squads: new Map(), histories: new Map() })).toBeNull();
  });
  it("with one manager shows chips and injuries but no template, differentials or head to head", () => {
    const t = buildLeagueTools({ bootstrap: bs, total: 1, managers: [manager(0)], gw: 6, nextGw: 7, squads: new Map([[100, { picks: [...XI, pick(99, 15)], active_chip: null }]]), histories: new Map([[100, { chips: [] }]]) })!;
    expect(t.chips?.rows).toHaveLength(1);
    expect(t.injuries?.rows.map((r) => r.id)).toEqual([99]);
    expect([t.template, t.differentials, t.rivals]).toEqual([null, null, null]);
  });
  it("leaves out a late joiner's missing squad but keeps them in the chip list", () => {
    const managers = [manager(0), manager(1), manager(2)];
    const t = buildLeagueTools({ bootstrap: bs, total: 3, managers, gw: 6, nextGw: 7, squads: new Map([[100, { picks: XI, active_chip: null }], [101, { picks: XI, active_chip: null }]]), histories: new Map([[102, { chips: [] }]]) })!;
    expect(t.squads).toBe(2);
    expect(t.template?.managers).toBe(2);
    expect(t.chips?.rows.map((r) => r.played === null)).toEqual([true, true, false]);
  });
  it("before the season (no squads) says so with a null gameweek and no squad tools", () => {
    const t = buildLeagueTools({ bootstrap: bs, total: 2, managers: [manager(0), manager(1)], gw: null, nextGw: 1, squads: new Map(), histories: new Map([[100, { chips: [] }]]) })!;
    expect(t).toMatchObject({ gw: null, squads: 0, injuries: null, template: null, differentials: null, rivals: null });
    expect(t.chips?.holders).toEqual({ wildcard: 1, freehit: 1, bboost: 1, "3xc": 1 });
  });
  it("caps the injury list but still says how many matched", () => {
    const many: Bootstrap = { ...bs, elements: bs.elements.concat(Array.from({ length: 30 }, (_, i) => ({ ...bs.elements[0], id: 200 + i, web_name: `Hurt${i}`, status: "i" }))) };
    const picks = Array.from({ length: 30 }, (_, i) => pick(200 + i, i + 1));
    const t = buildLeagueTools({ bootstrap: many, total: 1, managers: [manager(0)], gw: 6, nextGw: 7, squads: new Map([[100, { picks, active_chip: null }]]), histories: new Map() })!;
    expect(t.injuries).toMatchObject({ matching: 30 });
    expect(t.injuries!.rows).toHaveLength(INJURY_ROWS);
  });
});

describe("the league tools' requests", () => {
  afterEach(() => vi.useRealTimers());
  const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => standing({ entry: 100 + i, entry_name: `Team ${i + 1}`, player_name: `Manager ${i + 1}`, rank: i + 1, total: 500 - i }));

  it(`asks about the top ${LEAGUE_TOOLS_CAP} managers at most, each once, and says how much of the league that is`, async () => {
    const picks = vi.fn(async (e: number) => picksFor(e));
    const hist = vi.fn(async () => history([]));
    const run = startLeagueTools(fakeFpl({ picks, history: hist }), { bootstrap: bs, rows: rowsOf(LEAGUE_TOOLS_CAP + 1), nextGw: 7 });
    await run.picksOf(100); // a second tool asking for the same squad reuses the request
    const t = (await run.ready)!;
    expect(t).toMatchObject({ total: LEAGUE_TOOLS_CAP + 1, covered: LEAGUE_TOOLS_CAP, squads: LEAGUE_TOOLS_CAP });
    expect(picks).toHaveBeenCalledTimes(LEAGUE_TOOLS_CAP);
    expect(hist).toHaveBeenCalledTimes(LEAGUE_TOOLS_CAP);
    expect(picks.mock.calls.some(([e]) => e === 100 + LEAGUE_TOOLS_CAP)).toBe(false);
  });

  it("dedupes repeated league rows and ignores rows without a usable entry", async () => {
    const r = rowsOf(3);
    const picks = vi.fn(async (e: number) => picksFor(e));
    const t = (await startLeagueTools(fakeFpl({ picks, history: async () => history([]) }), { bootstrap: bs, rows: [...r, r[0], { ...r[1], entry: 0 }], nextGw: 7 }).ready)!;
    expect(t).toMatchObject({ total: 3, covered: 3 });
    expect(picks).toHaveBeenCalledTimes(3);
  });

  it("marks managers whose picks or history fail, 404 or come back malformed as unavailable, and carries on", async () => {
    const picks = async (e: number): Promise<EntryPicks | null> => {
      if (e === 101) throw new Error("500");
      if (e === 102) return null; // 404: joined after this gameweek
      if (e === 103) return { ...picksFor(e), picks: "nope" as unknown as Pick[] };
      return picksFor(e);
    };
    const hist = async (e: number) => {
      if (e === 100) throw new Error("timeout");
      if (e === 101) return null;
      return history([{ name: "wildcard", event: 3 }]);
    };
    const t = (await startLeagueTools(fakeFpl({ picks, history: hist }), { bootstrap: bs, rows: rowsOf(5), nextGw: 7 }).ready)!;
    expect(t.squads).toBe(2); // 100 and 104
    expect(t.chips!.rows.map((r) => r.played === null)).toEqual([true, true, false, false, false]);
    expect(t.template?.managers).toBe(2);
  });

  it("is null, never a thrown error, when nothing at all can be read", async () => {
    const fail = async () => { throw new Error("down"); };
    const t = await startLeagueTools(fakeFpl({ picks: fail, history: fail }), { bootstrap: bs, rows: rowsOf(4), nextGw: 7 }).ready;
    expect(t).toMatchObject({ squads: 0, chips: null, injuries: null, template: null, differentials: null, rivals: null });
    expect(await startLeagueTools(fakeFpl(), { bootstrap: bs, rows: [], nextGw: 7 }).ready).toBeNull();
  });

  it("stops waiting at the page's deadline and uses what has arrived", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const picks = async (e: number) => (e === 102 ? never : picksFor(e));
    const hist = async (e: number) => (e === 101 ? never : history([]));
    const run = startLeagueTools(fakeFpl({ picks, history: hist }), { bootstrap: bs, rows: rowsOf(3), nextGw: 7 });
    let done = false;
    void run.ready.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(STATS_DEADLINE_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const t = (await run.ready)!;
    expect(t.squads).toBe(2);
    expect(t.chips!.rows.map((r) => r.played === null)).toEqual([false, true, false]);
  });

  it("before the season asks for no picks at all", async () => {
    const pre: Bootstrap = { ...bs, events: [event({ id: 1, name: "Gameweek 1", is_current: false, is_next: true, finished: false, deadline_time: "2026-08-15T10:00:00Z" })] };
    const picks = vi.fn(async (e: number) => picksFor(e));
    const t = (await startLeagueTools(fakeFpl({ picks, history: async () => history([]) }), { bootstrap: pre, rows: rowsOf(2), nextGw: 1 }).ready)!;
    expect(picks).not.toHaveBeenCalled();
    expect(t).toMatchObject({ gw: null, squads: 0 });
    expect(t.chips?.rows).toHaveLength(2);
  });
});

describe("the league tools in the tools service", () => {
  it("adds them to the model, passes ?vs through, and doesn't ask twice for squads EO also needs", async () => {
    const picks = vi.fn(async (e: number) => picksFor(e));
    const svc = createToolsService(fakeFpl({ bootstrap: async () => bs, standings: async () => league(6), allFixtures: async () => schedule, picks, history: async () => history([]) }), { now: () => NOW });
    const m = await svc.load(1, { vs: "100,101" });
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.leagueTools).toMatchObject({ total: 6, covered: 6, squads: 6 });
    expect(m.leagueTools?.rivals).toMatchObject({ selected: [100, 101], invalid: false });
    expect(m.leagueTools?.chips?.holders).toEqual({ wildcard: 6, freehit: 6, bboost: 6, "3xc": 6 });
    expect(picks).toHaveBeenCalledTimes(6);
  });
});
