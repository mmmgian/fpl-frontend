/**
 * One past table (app/history/[gw]/page.tsx), opened at every moment of the season, then fed the snapshots the
 * history server really stores: rebuilt tables with approximate ranks, messy and nameless data, gaps in the shelf,
 * junk URLs, and a server that is down.
 *
 * Expected tables are worked out from the managers' own FPL histories (the world's /entry/{id}/history/ answers),
 * not from the stored snapshot the page reads, so the two sources check each other.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { formatNumber, messagesFor } from "@/lib/domain";
import { testLanguage } from "../language";
import { LEAGUE_ID, PHASES, install, jsonRes, requested, season, textOf, uninstall, type Routes, type World } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

const en = messagesFor("en");
const SLUG: Record<number, string> = { 7: "gaucho-f-c", 1: "barts-team", 2: "dang-football-club", 3: "saka-la-bolsita", 4: "papoy", 5: "fc-rtw" };
const NAME: Record<number, string> = { 7: "Gaucho F.C.", 1: "Bart's Team", 2: "Dang Football Club", 3: "Saka la bolsita", 4: "Papoy", 5: "FC RTW" };

async function openSnapshot(gw: string): Promise<{ markup: string; text: string }> {
  const page = (await import("@/app/history/[gw]/page")).default;
  const markup = renderToStaticMarkup((await page({ params: Promise.resolve({ gw }) })) as ReactElement);
  return { markup, text: textOf(markup) };
}

function tableRows(markup: string): { text: string; href: string | null; raw: string }[] {
  const start = markup.lastIndexOf("<tbody");
  if (start < 0) return [];
  const body = markup.slice(start, markup.indexOf("</tbody>", start));
  return body
    .split(/<tr\b/)
    .slice(1)
    .filter((c) => c.includes('scope="row"'))
    .map((c) => ({ raw: c, text: textOf(`<tr${c}`), href: c.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null }));
}

/** The pager: the gameweek it is on, and where its arrows go (null = no link that way). */
function pager(markup: string): { current: string; prev: string | null; next: string | null } | null {
  const nav = markup.match(/<nav[^>]*aria-label="[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  if (!nav) return null;
  const links = [...nav.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: textOf(m[2]) }));
  const current = textOf(nav.match(/aria-current="page"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
  return { current, prev: links.find((l) => l.text.startsWith("←"))?.href ?? null, next: links.find((l) => l.text.endsWith("→"))?.href ?? null };
}

function expectOneOf(text: string, variants: string[], what: string) {
  expect(variants.some((v) => text.includes(v)), `${what}: none of\n  ${variants.join("\n  ")}\nin:\n  ${text.slice(0, 1500)}`).toBe(true);
}

/** "Tue 6 Oct, 18:00 UTC": <LocalTime>'s default format as the server renders it. */
const when = (iso: string) =>
  `${new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

interface Expected { entry: number; name: string; rank: number; lastRank: number; gw: number; total: number }

/** The table after `gw`, from each manager's FPL history: totals, the week's points after hits, rank and last week's rank. */
async function expectedTable(world: World, gw: number): Promise<Expected[]> {
  const rows: { entry: number; total: number; before: number; gw: number }[] = [];
  for (const entry of Object.keys(NAME).map(Number)) {
    const url = `https://fantasy.premierleague.com/api/entry/${entry}/history/`;
    const route = world.routes.find(([m]) => m(url))!;
    const res = await (route[1] as (u: string) => Promise<Response> | Response)(url);
    const h = (await res.json()) as { current: { event: number; points: number; total_points: number; event_transfers_cost: number }[] };
    const at = h.current.find((r) => r.event === gw)!;
    const prev = h.current.find((r) => r.event === gw - 1);
    rows.push({ entry, total: at.total_points, before: prev?.total_points ?? 0, gw: at.points - at.event_transfers_cost });
  }
  const order = (key: "total" | "before") => new Map([...rows].sort((a, b) => b[key] - a[key] || a.entry - b.entry).map((r, i) => [r.entry, i + 1]));
  const now = order("total");
  const was = order("before");
  return rows.map((r) => ({ entry: r.entry, name: NAME[r.entry], rank: now.get(r.entry)!, lastRank: gw === 1 ? 0 : was.get(r.entry)!, gw: r.gw, total: r.total })).sort((a, b) => a.rank - b.rank);
}

const movement = (rank: number, last: number) => (last === 0 ? en.movement.newEntry : last === rank ? en.movement.noChange : last > rank ? en.movement.up(last - rank) : en.movement.down(rank - last));
const isList = (u: string) => u.endsWith(`/history/${LEAGUE_ID}`);
const isSnap = (gw: number) => (u: string) => u.endsWith(`/history/${LEAGUE_ID}/${gw}`);

it("opens past tables at every moment of the season: saved ones match the managers' histories, missing ones say so", async () => {
  for (const phase of PHASES) {
    const world = install(season(phase));
    const listRoute = world.routes.find(([m]) => m(`x/history/${LEAGUE_ID}`))![1] as { snapshots: { gw: number; taken_at: string }[] };
    const saved = listRoute.snapshots.map((s) => s.gw);
    // GW38's stored table in the season-over world is the world's own simplification (no GW38 points): stay before it.
    const gws = [1, 5, 6, 7].filter((g) => g < 38);
    for (const g of gws) {
      const p = `[${phase} /history/${g}]`;
      const { markup, text } = await openSnapshot(String(g));
      const others = saved.filter((n) => n !== g);
      const pg = pager(markup);
      const before = saved.filter((n) => n < g);
      const after = saved.filter((n) => n > g);

      // Always: the way back to the shelf, and the pager over the saved weeks only (none when there's nowhere to go).
      expect(markup, `${p} back link to the shelf`).toMatch(/<a[^>]*href="\/times#tables"[^>]*>← Past tables<\/a>/);
      if (others.length === 0) expect(pg, `${p} no pager without other saved tables`).toBeNull();
      else {
        expect(pg, `${p} pager`).not.toBeNull();
        expect(pg!.current, `${p} pager on GW${g}`).toBe(`GW${g}`);
        expect(pg!.prev, `${p} pager back to the nearest saved week`).toBe(before.length ? `/history/${Math.max(...before)}` : null);
        expect(pg!.next, `${p} pager on to the nearest saved week`).toBe(after.length ? `/history/${Math.min(...after)}` : null);
      }
      expect(markup, `${p} a past table never auto-refreshes`).not.toContain('aria-label="Refresh"');

      if (!saved.includes(g)) {
        expect(text, `${p} missing title`).toContain(en.history.missingTitle(g));
        expectOneOf(text, en.history.missingBody, `${p} missing body`);
        expect(markup, `${p} link to the live table`).toMatch(new RegExp(`<a[^>]*href="/"[^>]*>${en.common.seeLiveTable}</a>`));
        expect(text, `${p} eyebrow`).toContain(en.history.eyebrow);
        expect(text, `${p} title`).toContain(`Gameweek ${g}`);
        expect(tableRows(markup), `${p} no table`).toEqual([]);
        continue;
      }

      const exp = await expectedTable(world, g);
      const taken = listRoute.snapshots.find((s) => s.gw === g)!.taken_at;
      expect(text.includes(en.history.missingTitle(g)), `${p} not "missing"`).toBe(false);
      expect(text, `${p} league name as eyebrow, then the title`).toContain(`The Lobster League ${en.history.standings(g)}`);
      expect(text, `${p} saved when`).toContain(`${en.history.saved} ${when(taken)}`);
      if (g === 5) expect(text, `${p} saved on the Tuesday after`).toContain("Saved Tue 6 Oct, 18:00 UTC");
      expect(text, `${p} not rebuilt`).not.toContain(en.history.rebuiltTitle);

      const rows = tableRows(markup);
      expect(rows.length, `${p} six managers`).toBe(6);
      exp.forEach((e, i) => {
        const r = rows[i];
        const who = `${p} row ${i + 1} (${e.name})`;
        expect(r.text.startsWith(`${e.rank} `), `${who}: rank ${e.rank}, got "${r.text.slice(0, 16)}"`).toBe(true);
        expect(r.text, `${who}: name`).toContain(e.name);
        expect(r.text, `${who}: movement ${e.lastRank}→${e.rank}`).toContain(movement(e.rank, e.lastRank));
        expect(r.text.endsWith(`${formatNumber(e.gw)} ${formatNumber(e.total)}`), `${who}: ends "${e.gw} ${e.total}", got "…${r.text.slice(-14)}"`).toBe(true);
        // A past table's team links open the team sheet at that week, not the live one.
        expect(r.href, `${who}: team sheet at GW${g}`).toBe(`/team/${SLUG[e.entry]}?gw=${g}`);
      });
      // Gaucho F.C.'s GW6 hit is in the GW6 table's points after hits.
      if (g === 6) expect(rows.find((r) => r.text.includes("Gaucho F.C."))!.text.endsWith(`${exp.find((e) => e.entry === 7)!.gw} ${exp.find((e) => e.entry === 7)!.total}`), `${p} Gaucho's GW6 after the −4`).toBe(true);
      expect(text, `${p} no live-only columns`).not.toContain(en.table.form);

      // The one-paragraph summary.
      const [lead, second] = exp;
      const s = en.history.summary;
      expectOneOf(text, s.leader.map((f) => f(lead.name, en.common.points(lead.total))), `${p} summary leader`);
      const gap = lead.total - second.total;
      expectOneOf(text, gap === 0 ? s.level : s.gap.map((f) => f(en.common.points(gap))), `${p} summary gap ${gap}`);
      const best = Math.max(...exp.map((e) => e.gw));
      expectOneOf(text, exp.filter((e) => e.gw === best).flatMap((e) => s.best.map((f) => f(e.name, en.common.points(best)))), `${p} summary best week ${best}`);
      const moves = exp.filter((e) => e.lastRank > 0).map((e) => ({ name: e.name, d: e.lastRank - e.rank }));
      const up = Math.max(0, ...moves.map((m) => m.d));
      const down = Math.max(0, ...moves.map((m) => -m.d));
      if (up > 0) expectOneOf(text, moves.filter((m) => m.d === up).flatMap((m) => s.climber.map((f) => f(m.name, en.common.places(up)))), `${p} summary climber`);
      else for (const f of s.climber) expect(text, `${p} no climber at GW${g}`).not.toContain(f("", "").slice(0, 12));
      if (down > 0) expectOneOf(text, moves.filter((m) => -m.d === down).flatMap((m) => s.faller.map((f) => f(m.name, en.common.places(down)))), `${p} summary faller`);
    }
    // Only the history server was asked about the table: no FPL calls for a stored week.
    expect(requested.filter((u) => u.includes("/leagues-classic/")), `[${phase}] the live league isn't fetched for a past table`).toEqual([]);
    uninstall();
    vi.resetModules();
  }

  // Spanish and French: the same table in their words and number formats.
  for (const locale of ["es", "fr"] as const) {
    testLanguage.cookie = locale;
    const world = install(season("final"));
    const t = messagesFor(locale);
    const p = `[${locale} /history/5]`;
    const { markup, text } = await openSnapshot("5");
    const exp = await expectedTable(world, 5);
    expect(text, `${p} title`).toContain(t.history.standings(5));
    expect(text, `${p} saved label`).toContain(t.history.saved);
    expect(text, `${p} back link`).toContain(t.history.back);
    expectOneOf(text, t.history.summary.leader.map((f) => f(exp[0].name, t.common.points(exp[0].total))), `${p} summary leader`);
    const rows = tableRows(markup);
    exp.forEach((e, i) => expect(rows[i].text, `${p} row ${i + 1}`).toContain(e.name));
    expect(rows[0].href, `${p} team link carries the week`).toBe(`/team/${SLUG[exp[0].entry]}?gw=5`);
    const missing = await openSnapshot("6");
    expect(missing.text, `${p} missing title translated`).toContain(t.history.missingTitle(6));
    expect(missing.text, `${p} live-table link translated`).toContain(t.common.seeLiveTable);
    testLanguage.cookie = undefined;
    uninstall();
    vi.resetModules();
  }
});

it("handles rebuilt and messy snapshots, gaps, junk URLs and a history server that is down", async () => {
  // A. Junk gameweeks in the URL: not found, and nothing asked of the server.
  {
    install(season("final"));
    for (const bad of ["0", "39", "100", "-1", "1.5", "abc", "", "5a", "%35", "0x5"]) {
      requested.length = 0;
      const page = (await import("@/app/history/[gw]/page")).default;
      await expect(page({ params: Promise.resolve({ gw: bad }) }), `[url "${bad}"] not found`).rejects.toThrow("NEXT_NOT_FOUND");
      expect(requested, `[url "${bad}"] no backend call`).toEqual([]);
    }
    // A leading zero is the same week.
    const { text } = await openSnapshot("05");
    expect(text, `[url "05"] GW5`).toContain(en.history.standings(5));
    uninstall();
    vi.resetModules();
  }

  // B. A rebuilt table: the note, the level groups, approximate ranks and movement.
  {
    const p = "[rebuilt]";
    const rows = [
      { entry: 1, entry_name: "Bart's Team", player_name: "Bart Simp", rank: 1, last_rank: 2, total: 1340, event_total: 74 },
      { entry: 5, entry_name: "FC RTW", player_name: "Rita Tew", rank: 2, last_rank: 1, total: 1320, event_total: 62, rank_approximate: true },
      { entry: 4, entry_name: "Papoy", player_name: "Pablo Poy", rank: 3, last_rank: 3, total: 1320, event_total: 45, rank_approximate: true, last_rank_approximate: true },
      { entry: 3, entry_name: "Saka la bolsita", player_name: "Sofia Saka", rank: 4, last_rank: 5, total: 1310, event_total: 68 },
      { entry: 2, entry_name: "Dang Football Club", player_name: "Khang Dang", rank: 5, last_rank: 4, total: 1305, event_total: 51 },
      { entry: 7, entry_name: "Gaucho F.C.", player_name: "Gian Jaen", rank: 6, last_rank: 6, total: 1290, event_total: 56 },
    ];
    const snap = {
      gw: 4, taken_at: "2026-10-01T12:00:00Z", league_id: LEAGUE_ID,
      data: {
        league: { id: LEAGUE_ID, name: "The Lobster League" },
        standings: { has_next: false, page: 1, results: rows },
        reconstructed: { built_at: "2026-10-02T08:30:00Z", unresolved_ties: [{ total: 1320, entries: [5, 4] }, { total: 999, entries: [999, 5] }, { total: "x", entries: [1, 2] }] },
      },
    };
    install(season("final"), [[isSnap(4), snap]]);
    const { markup, text } = await openSnapshot("4");
    expect(text, `${p} rebuilt meta uses the build time`).toContain(`${en.history.rebuilt} ${when("2026-10-02T08:30:00Z")}`);
    expect(text, `${p} not "saved"`).not.toContain(`${en.history.saved} `);
    expect(text, `${p} note title`).toContain(en.history.rebuiltTitle);
    expect(text, `${p} note body`).toContain(en.history.rebuiltBody);
    expect(text, `${p} level group, unknown entries and junk groups dropped`).toContain(`${en.history.levelLead}${en.history.levelEm}${en.history.level(en.history.levelGroup(`FC RTW${en.history.and}Papoy`, "1,320"))}`.replace(/\s+/g, " "));
    expect(text, `${p} only one group`).not.toContain("999 pts");
    expect(text, `${p} movement note`).toContain(en.history.movementNote);
    const r = tableRows(markup);
    expect(r.length, `${p} six rows`).toBe(6);
    expect(r[0].text, `${p} exact rank`).not.toContain(en.table.approxSr.trim());
    expect(r[1].text, `${p} approximate rank`).toContain(`2 ≈ ${en.table.approxSr.trim()}`);
    expect(r[1].text, `${p} approximate movement`).toContain(`${en.movement.approxPrefix}${en.movement.down(1)}`);
    expect(r[2].text, `${p} approximate no-change`).toContain(en.movement.noChangeApprox);
    expect(r[3].text, `${p} exact movement elsewhere`).toContain(en.movement.up(1));
    expect(r[3].text, `${p} no approx prefix on exact rows`).not.toContain(en.movement.approxPrefix);
    expect(r.map((x) => x.href), `${p} links at GW4`).toEqual([1, 5, 4, 3, 2, 7].map((e) => `/team/${SLUG[e]}?gw=4`));
    expect(text, `${p} thousands separators`).toContain("74 1,340");
    uninstall();
    vi.resetModules();
  }

  // C. A messy stored table: unsorted, duplicated, nameless, RTL and bidi-override names, junk rows, no league name.
  {
    const p = "[messy snapshot]";
    const snap = {
      gw: 3, taken_at: 12345,
      data: {
        league: { name: "   " },
        standings: {
          results: [
            { entry: 12, entry_name: "Third", player_name: "C", rank: 3, last_rank: 1, total: 150, event_total: 30 },
            { entry: 10, entry_name: "فريق الصقور", player_name: "Omar", rank: 1, last_rank: 3, total: 210, event_total: 90 },
            { entry: 11, entry_name: "Evil\u202Egnp.exe", player_name: "M", rank: 2, last_rank: 2, total: 200, event_total: 40 },
            { entry: 10, entry_name: "Duplicate", player_name: "X", rank: 9, last_rank: 9, total: 1, event_total: 1 },
            { entry: 13, entry_name: null, player_name: null, rank: null, last_rank: null, total: null, event_total: null },
            { entry: -1, entry_name: "Negative", rank: 4 },
            "junk",
            null,
          ],
        },
      },
    };
    install(season("final"), [[isSnap(3), snap]]);
    const { markup, text } = await openSnapshot("3");
    const r = tableRows(markup);
    expect(r.map((x) => x.text.split(" ")[0]), `${p} ranks in order, unranked last`).toEqual(["1", "2", "3", "4"]);
    expect(r[0].text, `${p} RTL leader first`).toContain("فريق الصقور");
    expect(r[1].text, `${p} bidi override stripped`).toContain("Evilgnp.exe");
    expect(markup, `${p} no override char`).not.toContain("\u202E");
    expect(r[2].text, `${p} third`).toContain("Third");
    expect(r[3].text, `${p} nameless entry by id`).toContain("#13");
    expect(r[3].text.endsWith("0 0"), `${p} missing numbers as 0`).toBe(true);
    expect(text, `${p} duplicate and junk dropped`).not.toMatch(/Duplicate|Negative/);
    // No league name stored: titled in the page's language, never an English stand-in name.
    expect(text, `${p} eyebrow falls back`).toContain(`${en.history.eyebrow} ${en.history.standings(3)}`);
    expect(text, `${p} no saved time for a junk timestamp`).not.toContain(`${en.history.saved} `);
    // The RTL leader is isolated inside the summary sentence.
    expectOneOf(markup, en.history.summary.leader.map((f) => f("\u2068فريق الصقور\u2069", en.common.points(210))), `${p} isolated leader in summary`);
    expectOneOf(markup, en.history.summary.climber.map((f) => f("\u2068فريق الصقور\u2069", en.common.places(2))), `${p} isolated climber`);
    expectOneOf(text, en.history.summary.faller.map((f) => f("Third", en.common.places(2))), `${p} faller`);
    uninstall();
    vi.resetModules();
  }

  // D. A stored table with no rows at all: an empty table, no summary, no crash.
  {
    const p = "[empty snapshot]";
    install(season("final"), [[isSnap(2), { gw: 2, taken_at: "2026-09-15T18:00:00Z", data: null }]]);
    const { markup, text } = await openSnapshot("2");
    expect(tableRows(markup), `${p} no rows`).toEqual([]);
    expect(text, `${p} empty table message`).toContain(en.table.empty);
    for (const f of en.history.summary.leader) expect(text, `${p} no summary`).not.toContain(f("", "").trim().slice(0, 10) || "\u0000");
    uninstall();
    vi.resetModules();
  }

  // E. Gaps on the shelf: the pager steps over unsaved weeks; the list failing only costs the pager.
  {
    const world = season("final");
    const list = { league_id: LEAGUE_ID, snapshots: [1, 2, 4, 5].map((gw) => ({ gw, taken_at: "2026-09-01T00:00:00Z" })) };
    install(world, [[isList, list], [isSnap(3), () => new Response("none", { status: 404 })]]);
    let pg = pager((await openSnapshot("4")).markup);
    expect(pg, "[gaps /history/4] pager skips GW3").toEqual({ current: "GW4", prev: "/history/2", next: "/history/5" });
    pg = pager((await openSnapshot("2")).markup);
    expect(pg, "[gaps /history/2] pager skips GW3 forward").toEqual({ current: "GW2", prev: "/history/1", next: "/history/4" });
    const missing = await openSnapshot("3");
    expect(missing.text, "[gaps /history/3] missing").toContain(en.history.missingTitle(3));
    expect(pager(missing.markup), "[gaps /history/3] pager either side of the gap").toEqual({ current: "GW3", prev: "/history/2", next: "/history/4" });
    uninstall();
    vi.resetModules();

    install(season("final"), [[isList, () => new Response("down", { status: 503 })]]);
    const noList = await openSnapshot("5");
    expect(noList.text, "[list down] the table still shows").toContain(en.history.standings(5));
    expect(tableRows(noList.markup).length, "[list down] all rows").toBe(6);
    expect(pager(noList.markup), "[list down] no pager").toBeNull();
    expect(noList.markup, "[list down] back link stays").toContain('href="/times#tables"');
    uninstall();
    vi.resetModules();
  }

  // F. The snapshot itself can't be read: the page fails loudly (to the error boundary), it never claims "not saved".
  const failures: [string, Routes[number][1]][] = [
    ["503", () => new Response("down", { status: 503 })],
    ["HTML 200", () => new Response("<html>waking</html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["array body", () => jsonRes([1, 2])],
    ["network", () => Promise.reject(new TypeError("fetch failed"))],
  ];
  for (const [name, handler] of failures) {
    install(season("final"), [[isSnap(5), handler]]);
    const page = (await import("@/app/history/[gw]/page")).default;
    await expect(page({ params: Promise.resolve({ gw: "5" }) }), `[snapshot ${name}] throws to the error boundary`).rejects.toThrow();
    uninstall();
    vi.resetModules();
  }
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
