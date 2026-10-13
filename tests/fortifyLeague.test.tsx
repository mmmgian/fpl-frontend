/**
 * Hardening of the league page (/): data edge cases, upstream failures, freshness and accessibility, in normal and
 * blotter modes. Each case is a failure mode that was real (or is pinned so it stays fixed).
 */
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { LeagueView } from "@/components/views/LeagueView";
import { awardLine, storyLines } from "@/components/views/leagueCopy";
import { cleanStandings, isolateName, leagueHeadlines, leagueStats, summarizeStandings, zoneOf } from "@/lib/domain";
import type { EntryHistory, HistoryGameweek, StandingRow } from "@/lib/domain/types";
import { getLeagueStandings } from "@/lib/fpl";
import { createLeagueService } from "@/lib/services/league";
import type { LeagueModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";
import { bootstrap, event, standing } from "./fixtures";
import { clock, fakeFpl } from "./support";

const g = (ev: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event: ev, points, total_points: 0, rank: null, overall_rank: 5000, bank: 5, value: 1004, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
const hist = (gws: HistoryGameweek[], chips: EntryHistory["chips"] = []): EntryHistory => ({ current: gws, past: [], chips });
const league = (results: unknown[], over: { has_next?: boolean; name?: string } = {}) => ({
  league: { id: 1, name: over.name ?? "L" },
  standings: { has_next: over.has_next ?? false, results: results as StandingRow[] },
  new_entries: { results: [] as unknown[] },
});
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (el: HTMLElement | DocumentFragment) => el.textContent ?? "";

afterEach(() => {
  setRequestTrip(false);
  setRequestLocale("en");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ------------------------------------------------------------------------------------------- the rows as FPL sends them

describe("cleanStandings: rows read defensively at the boundary", () => {
  it("survives null, missing and NaN fields without inventing numbers", () => {
    const rows = cleanStandings([
      { entry: 1, entry_name: null, player_name: undefined, rank: 1, last_rank: null, event_total: Number.NaN, total: null },
      { entry: 2, entry_name: "Beta", player_name: "Bob", rank: 2, last_rank: 1, event_total: -4, total: 100 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entry: 1, entry_name: "#1", player_name: "", rank: 1, last_rank: 0, event_total: 0, total: 0 });
    expect(rows[1]).toMatchObject({ entry_name: "Beta", event_total: -4 }); // a hit-taking week stays negative
  });

  it("drops junk rows and a row repeated across pages (the first one wins)", () => {
    const rows = cleanStandings([null, 7, "x", { entry: "3" }, { entry: -1 }, { entry: 5, rank: 1, total: 50, entry_name: "A" }, { entry: 5, rank: 51, total: 10, entry_name: "A again" }]);
    expect(rows.map((r) => r.entry_name)).toEqual(["A"]);
    expect(cleanStandings(undefined)).toEqual([]);
    expect(cleanStandings({ results: [] })).toEqual([]);
  });

  it("keeps the table in rank order, and fills a missing rank from the position", () => {
    const rows = cleanStandings([
      { entry: 3, rank: 3, entry_name: "C" },
      { entry: 1, rank: 1, entry_name: "A" },
      { entry: 9, entry_name: "No rank" },
      { entry: 2, rank: 2, entry_name: "B" },
    ]);
    expect(rows.map((r) => r.entry_name)).toEqual(["A", "B", "C", "No rank"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("strips bidi override and control characters a name could use to spoof the text around it", () => {
    const [row] = cleanStandings([{ entry: 1, rank: 1, entry_name: "Evil\u202Egnp.exe\u0007", player_name: "\u2066Bob\u2069" }]);
    expect(row.entry_name).toBe("Evilgnp.exe");
    expect(row.player_name).toBe("Bob");
  });

  it("keeps emoji, accents and right-to-left names as they are", () => {
    const names = ["🦞 Lobster FC 🦞", "Zürich ñandú", "نادي القاهرة", "מכבי"];
    expect(cleanStandings(names.map((n, i) => ({ entry: i + 1, rank: i + 1, entry_name: n }))).map((r) => r.entry_name)).toEqual(names);
  });

  it("keeps the rebuilt-table flags only when they are set", () => {
    const [a, b] = cleanStandings([{ entry: 1, rank: 1, rank_approximate: true, last_rank_approximate: "yes" }, { entry: 2, rank: 2 }]);
    expect(a.rank_approximate).toBe(true);
    expect(a.last_rank_approximate).toBeUndefined();
    expect("rank_approximate" in b).toBe(false);
  });
});

describe("isolateName: names in sentences", () => {
  it("wraps right-to-left names in a bidi isolate so they can't reorder the sentence, and leaves others alone", () => {
    expect(isolateName("نادي القاهرة")).toBe("\u2068نادي القاهرة\u2069");
    expect(isolateName("Alpha 🦞")).toBe("Alpha 🦞");
  });

  it("is applied to storylines and award lines", () => {
    const rtl = "نادي";
    const rows = [standing({ entry: 1, entry_name: rtl, rank: 1, last_rank: 3, total: 300 }), standing({ entry: 2, entry_name: "Beta", rank: 2, last_rank: 1, total: 290 })];
    const lines = storyLines(leagueHeadlines(rows, null), (e) => rows.find((r) => r.entry === e)!.entry_name);
    expect(lines.join(" ")).toContain(`\u2068${rtl}\u2069`);
    expect(awardLine({ key: "weekWinner", entry: 1, value: 70, tiedWith: 0 }, rtl, 3)).toContain(`\u2068${rtl}\u2069`);
  });
});

// ------------------------------------------------------------------------------------------------ table rules

describe("standings rules at the edges", () => {
  it("single-member league: a summary, no title race, no zones", () => {
    const one = [standing({ entry: 1, rank: 1, last_rank: 0 })];
    expect(summarizeStandings(one)?.managers).toBe(1);
    expect(leagueHeadlines(one, null)).toEqual([]);
    expect(zoneOf(1, 1)).toBeUndefined();
  });

  it("everyone level: one 'level' line, nobody rises or falls", () => {
    const tied = Array.from({ length: 5 }, (_, i) => standing({ entry: i + 1, entry_name: `T${i}`, rank: 1, last_rank: 1, total: 0, event_total: 0 }));
    expect(leagueHeadlines(tied, null).map((h) => h.kind)).toEqual(["level", "bottom"]);
  });
});

describe("league stats at the edges", () => {
  const rows = [1, 2, 3, 4].map((e) => standing({ entry: e, entry_name: `T${e}`, rank: e, total: 300 - e }));

  it("a week everyone scored the same (a voided gameweek) has no winner and no wooden spoon", () => {
    const histories = new Map(rows.map((r) => [r.entry, hist([g(1, 50 + r.entry), g(2, 0)])]));
    const awards = leagueStats(rows, histories)!.awards.map((a) => a.key);
    expect(awards).not.toContain("weekWinner");
    expect(awards).not.toContain("woodenSpoon");
  });

  it("never hands one manager both the week and the wooden spoon", () => {
    const histories = new Map(rows.map((r) => [r.entry, hist([g(1, 40), g(2, 40)])]));
    const stats = leagueStats(rows, histories)!;
    const winner = stats.awards.find((a) => a.key === "weekWinner");
    const spoon = stats.awards.find((a) => a.key === "woodenSpoon");
    expect(winner && spoon && winner.entry === spoon.entry).toBeFalsy();
  });

  it("a week where the best score was a hit-taking minus is not 'won'", () => {
    const histories = new Map(rows.map((r) => [r.entry, hist([g(1, 50), g(2, 0, { event_transfers_cost: r.entry === 1 ? 0 : 4 * r.entry })])]));
    const stats = leagueStats(rows, histories)!;
    expect(stats.awards.find((a) => a.key === "weekWinner")).toBeUndefined();
    expect(stats.awards.find((a) => a.key === "woodenSpoon")).toMatchObject({ entry: 4, value: -16 });
  });

  it("null, missing or NaN numbers in a manager's history never come out as NaN", () => {
    const bad = { event: 2, points: null, event_transfers_cost: undefined, points_on_bench: Number.NaN, bank: null, value: undefined, event_transfers: null, overall_rank: null } as unknown as HistoryGameweek;
    const histories = new Map<number, EntryHistory>([
      [1, hist([g(1, 50), bad])],
      [2, hist([g(1, 40), g(2, 30)])],
      [3, hist([g(1, 30), g(2, 20)])],
      [4, hist([g(1, 20), { event: Number.NaN, points: 99 } as unknown as HistoryGameweek, g(2, 10)])],
    ]);
    const stats = leagueStats(rows, histories)!;
    expect(JSON.stringify(stats)).not.toMatch(/NaN|null,"worst"/);
    for (const s of Object.values(stats.byEntry)) {
      for (const n of [s.average, s.benchPoints, s.hitPoints, s.value, s.bank, s.weekPoints, ...s.form]) expect(Number.isFinite(n)).toBe(true);
    }
    expect(stats.byEntry[1].form).toEqual([50]); // the unreadable week is left out, not counted as 0
    expect(stats.byEntry[4].form).toEqual([20, 10]);
  });

  it("a late joiner (no early weeks) gets stats over the weeks they played", () => {
    const histories = new Map<number, EntryHistory>([
      [1, hist([g(1, 50), g(2, 60), g(3, 70)])],
      [2, hist([g(1, 40), g(2, 40), g(3, 40)])],
      [3, hist([g(1, 30), g(2, 20), g(3, 20)])],
      [4, hist([g(3, 90)])],
    ]);
    const stats = leagueStats(rows, histories)!;
    expect(stats.byEntry[4]).toMatchObject({ form: [90], average: 90, weekRank: 1 });
    expect(stats.awards.find((a) => a.key === "weekWinner")).toMatchObject({ entry: 4, value: 90 });
  });
});

// ------------------------------------------------------------------------------------------------ the use case

describe("league service: upstream failures and freshness", () => {
  const rows = [1, 2, 3].map((e) => standing({ entry: e, entry_name: `T${e}`, rank: e, total: 300 - e }));

  it("a table with null names and numbers loads (the boundary cleans it)", async () => {
    const raw = [{ entry: 1, entry_name: null, player_name: null, rank: 1, last_rank: null, event_total: null, total: null }, ...rows.slice(1)];
    const model = await createLeagueService(fakeFpl({ standings: async () => league(raw) }), { now: clock }).load(1);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.rows[0]).toMatchObject({ entry_name: "#1", total: 0 });
    expect(model.summary?.leader.total).toBe(0);
  });

  it("FPL's game-info file failing does not take the table down: it shows, without gameweek or extras", async () => {
    const model = await createLeagueService(fakeFpl({ standings: async () => league(rows), bootstrap: async () => { throw new Error("503 game updating"); }, history: async () => hist([g(1, 50)]) }), { now: clock }).load(1);
    expect(model).toMatchObject({ kind: "ok", gameweek: null, gameweekUnavailable: true, stats: null, currentGw: null });
    if (model.kind === "ok") expect(model.rows).toHaveLength(3);
  });

  it("a known gameweek says it is available", async () => {
    const model = await createLeagueService(fakeFpl({ standings: async () => league(rows) }), { now: clock }).load(1);
    expect(model).toMatchObject({ kind: "ok", gameweekUnavailable: false });
  });

  it("standings failing is still a loud error (the table is the page)", async () => {
    await expect(createLeagueService(fakeFpl({ standings: async () => { throw new Error("FPL 503"); } })).load(1)).rejects.toThrow("FPL 503");
  });

  const squadWorld = (dataChecked: boolean) => {
    const asked: string[] = [];
    const events = [event({ id: 1, is_current: false, finished: true, data_checked: true }), event({ id: 2, is_current: true, finished: true, data_checked: dataChecked, deadline_time: "2026-10-03T10:00:00Z" })];
    const fpl = fakeFpl({
      standings: async () => league(rows),
      bootstrap: async () => ({ ...bootstrap, events }),
      history: async () => hist([g(1, 50), g(2, 40)]),
      picks: async (_e, gw, settled) => (asked.push(`picks ${gw} ${settled}`), null),
      live: async (gw, settled) => (asked.push(`live ${gw} ${settled}`), { elements: [] }),
    });
    return { asked, load: () => createLeagueService(fpl, { now: clock }).load(1) };
  };

  it("while the week is provisional, its picks and live points are asked for fresh (bonus can still change)", async () => {
    const w = squadWorld(false);
    const model = await w.load();
    expect(new Set(w.asked)).toEqual(new Set(["live 2 false", "picks 2 false"]));
    expect(model).toMatchObject({ statsPhase: "provisional", gameweek: { status: "provisional" } });
  });

  it("once FPL has checked the data (final), they are asked for as settled and cached longer", async () => {
    const w = squadWorld(true);
    const model = await w.load();
    expect(new Set(w.asked)).toEqual(new Set(["live 2 true", "picks 2 true"]));
    expect(model).toMatchObject({ statsPhase: "final", gameweek: { status: "final" } });
  });
});

// ------------------------------------------------------------------------------------------------ the adapter

describe("FPL standings adapter: paging and malformed answers", () => {
  const page = (n: number, entries: number[], hasNext: boolean) => ({ league: { id: 1, name: "Big" }, standings: { has_next: hasNext, page: n, results: entries.map((e) => ({ entry: e, entry_name: `T${e}`, player_name: "P", rank: e, last_rank: e, event_total: 1, total: 1000 - e })) }, new_entries: { results: [] } });
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const stub = (byPage: (n: number) => Response) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string) => byPage(Number(/page_standings=(\d+)/.exec(String(url))?.[1] ?? 1))));

  it("reads every page of a league bigger than one page (120 managers, 3 pages)", async () => {
    stub((n) => jsonRes(page(n, range((n - 1) * 50 + 1, Math.min(n * 50, 120)), n < 3)));
    const s = await getLeagueStandings(1);
    expect(s.standings.results).toHaveLength(120);
    expect(s.standings.has_next).toBe(false);
  });

  it("drops a manager repeated on the next page (the table moved between the two requests)", async () => {
    stub((n) => jsonRes(n === 1 ? page(1, range(1, 50), true) : page(2, range(50, 60), false)));
    const s = await getLeagueStandings(1);
    expect(s.standings.results).toHaveLength(60);
    expect(new Set(s.standings.results.map((r) => r.entry)).size).toBe(60);
  });

  it("keeps the first page and says there is more when a later page fails", async () => {
    stub((n) => (n === 1 ? jsonRes(page(1, range(1, 50), true)) : new Response("busy", { status: 503 })));
    const s = await getLeagueStandings(1);
    expect(s.standings.results).toHaveLength(50);
    expect(s.standings.has_next).toBe(true);
  });

  it("a malformed first page is a clear upstream error, not a TypeError deep inside", async () => {
    for (const body of [{}, { standings: {} }, { league: { name: "x" }, standings: { results: "nope" } }, []]) {
      stub(() => jsonRes(body));
      await expect(getLeagueStandings(1)).rejects.toMatchObject({ name: "FplError", status: 502 });
    }
  });

  it("a malformed later page ends the paging instead of failing the table", async () => {
    stub((n) => jsonRes(n === 1 ? page(1, range(1, 50), true) : { oops: true }));
    const s = await getLeagueStandings(1);
    expect(s.standings.results).toHaveLength(50);
    expect(s.standings.has_next).toBe(true);
  });

  it("stops at the page cap and says the table is cut short", async () => {
    stub((n) => jsonRes(page(n, range((n - 1) * 50 + 1, n * 50), true)));
    const s = await getLeagueStandings(1, 3);
    expect(s.standings.results).toHaveLength(150);
    expect(s.standings.has_next).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ the view

const model = (over: Partial<Extract<LeagueModel, { kind: "ok" }>> = {}): LeagueModel => {
  const rows = over.rows ?? [standing({ entry: 1, entry_name: "Alpha", rank: 1, last_rank: 0, total: 50 })];
  return {
    kind: "ok", leagueId: 1, name: "L", gameweek: { name: "Gameweek 6", status: "live" }, gameweekUnavailable: false, rows, truncated: false, newEntries: 0,
    summary: rows[0] ? { leader: { entryName: rows[0].entry_name, total: rows[0].total }, best: { entryName: rows[0].entry_name, total: rows[0].event_total }, managers: rows.length } : null,
    stats: null, currentGw: 6, statsPhase: null, headlines: leagueHeadlines(rows, null), variety: 12345, ...over,
  };
};

describe("LeagueView at the edges", () => {
  it("does not claim pre-season when the gameweek just couldn't be read; it polls slowly to recover", () => {
    const { container } = render(<LeagueView model={model({ gameweek: null, gameweekUnavailable: true, currentGw: null })} />);
    expect(text(container)).not.toMatch(/Pre-season/);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("polls slowly while provisional so the page flips to final by itself, and stops once final", () => {
    const provisional = render(<LeagueView model={model({ gameweek: { name: "Gameweek 6", status: "provisional" } })} />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    provisional.unmount();
    render(<LeagueView model={model({ gameweek: { name: "Gameweek 6", status: "final" } })} />);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("still says pre-season before the season", () => {
    render(<LeagueView model={model({ gameweek: null, currentGw: null })} />);
    expect(screen.getByText("Pre-season")).toBeInTheDocument();
  });

  it("a GW1 table (nobody has a previous rank) shows no movement and no NaN", () => {
    const rows = [1, 2, 3].map((e) => standing({ entry: e, entry_name: `T${e}`, rank: e, last_rank: 0, total: 70 - e, event_total: 70 - e }));
    const { container } = render(<LeagueView model={model({ rows, gameweek: { name: "Gameweek 1", status: "live" }, currentGw: 1 })} />);
    expect(text(container)).not.toMatch(/NaN|undefined|null/);
  });

  it("a large league (55 managers) renders every row once, with zones", () => {
    const rows = Array.from({ length: 55 }, (_, i) => standing({ entry: i + 1, entry_name: `Team ${i + 1}`, rank: i + 1, total: 1000 - i }));
    render(<LeagueView model={model({ rows })} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(55);
  });

  it("negative gameweek scores read with a real minus sign", () => {
    const rows = [standing({ entry: 1, rank: 1, total: 40, event_total: 8 }), standing({ entry: 2, entry_name: "Hit", rank: 2, total: 30, event_total: -4 })];
    render(<LeagueView model={model({ rows })} />);
    expect(within(screen.getByRole("table")).getByText("−4")).toBeInTheDocument();
  });

  it("names with markup are text, never HTML", () => {
    const rows = [standing({ entry: 1, entry_name: `<img src=x onerror="alert(1)">`, player_name: "<script>alert(1)</script>", rank: 1 })];
    const html = renderToStaticMarkup(<LeagueView model={model({ rows })} />);
    expect(html).not.toMatch(/<img src=x|<script>/);
    expect(html).toContain("&lt;img src=x");
  });

  describe.each([false, true])("accessibility (blotter %s)", (trip) => {
    beforeEach(() => setRequestTrip(trip));
    const rows = [1, 2, 3, 4].map((e) => standing({ entry: e, entry_name: e === 2 ? "نادي القاهرة" : `🦞 T${e}`, rank: e, last_rank: e, total: 300 - e }));
    const histories = new Map(rows.map((r) => [r.entry, hist([g(1, 40 + r.entry), g(2, 50 - r.entry)])]));

    it("has no axe violations with stats but no awards (headings stay in order)", async () => {
      const stats = { ...leagueStats(rows, histories)!, awards: [] };
      const { container } = render(<LeagueView model={model({ rows, stats, statsPhase: "final" })} />);
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with everything on", async () => {
      const stats = leagueStats(rows, histories)!;
      const { container } = render(<LeagueView model={model({ rows, stats, statsPhase: "final", headlines: leagueHeadlines(rows, stats) })} />);
      await expectNoAxeViolations(container);
    });

    it("has no axe violations for a single-member league and for an empty one", async () => {
      const one = render(<LeagueView model={model()} />);
      await expectNoAxeViolations(one.container);
      one.unmount();
      const empty = render(<LeagueView model={model({ rows: [], summary: null, headlines: [] })} />);
      await expectNoAxeViolations(empty.container);
    });
  });

  it.each(["es", "fr"] as const)("the unavailable-gameweek state is translated (%s)", (locale) => {
    setRequestLocale(locale);
    const { container } = render(<LeagueView model={model({ gameweek: null, gameweekUnavailable: true, currentGw: null })} />);
    expect(text(container)).not.toMatch(/Pre-season|Pretemporada|Avant-saison/);
  });
});
