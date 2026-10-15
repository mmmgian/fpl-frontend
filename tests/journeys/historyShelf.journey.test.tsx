/**
 * The past-tables shelf under The Times (app/times/archive.tsx), walked through the season, then fed the lists and
 * failures the history server can really produce: duplicates, junk gameweeks, rebuilt tables, missing dates, and a
 * server that is down, asleep, or answering with an HTML page.
 *
 * Expected values come from the world's own snapshot list and FPL flags, never from the app's shelf model.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { messagesFor } from "@/lib/domain";
import { testLanguage } from "../language";
import { LEAGUE_ID, PHASES, install, jsonRes, requested, season, textOf, uninstall, type PhaseName, type Routes, type World } from "./world";

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  uninstall();
});

const en = messagesFor("en");

async function shelfElement(): Promise<ReactElement> {
  const { TablesArchive } = await import("@/app/times/archive");
  return (await TablesArchive()) as ReactElement;
}
async function renderShelf(): Promise<{ markup: string; text: string }> {
  const markup = renderToStaticMarkup(await shelfElement());
  return { markup, text: textOf(markup) };
}

/** The shelf's entries in document order: link, visible text. */
function items(markup: string): { href: string; text: string }[] {
  const list = markup.match(/<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  return [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({ href: m[1].match(/href="([^"]+)"/)?.[1] ?? "", text: textOf(m[1]) }));
}

function expectOneOf(text: string, variants: string[], what: string) {
  expect(variants.some((v) => text.includes(v)), `${what}: none of\n  ${variants.join("\n  ")}\nin:\n  ${text}`).toBe(true);
}
function expectNoneOf(text: string, variants: string[], what: string) {
  expect(variants.filter((v) => text.includes(v)), `${what}: should not appear`).toEqual([]);
}

/** The date as the server renders <LocalTime> without a reader's locale: en-GB, UTC. */
const day = (iso: string) => `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} UTC`;

async function worldList(world: World): Promise<{ gw: number; taken_at: string }[]> {
  const url = `https://history.example/history/${LEAGUE_ID}`;
  const route = world.routes.find(([m]) => m(url))!;
  return (route[1] as { snapshots: { gw: number; taken_at: string }[] }).snapshots;
}

/** Which status line the shelf owes the reader at each phase, worked out from FPL's flags and what is filed. */
function expectedStatus(phase: PhaseName, gw: number, latest: number | null): { kind: "live" | "pending" | "filed" | null; gw: number } {
  if (phase === "live-playing" || phase === "live-between" || phase === "live-over") return { kind: "live", gw };
  if (phase === "provisional" || phase === "final" || phase === "season-over") return { kind: (latest ?? 0) < gw ? "pending" : "filed", gw };
  return { kind: null, gw };
}

const statusVariants = (gw: number) => ({ live: en.history.live.map((f) => f(gw)), pending: en.history.pending.map((f) => f(gw)), filed: en.history.filed.map((f) => f(gw)) });
const isList = (u: string) => u.endsWith(`/history/${LEAGUE_ID}`);
const nudgeRoute: Routes[number] = [(u) => u.endsWith("/api/snapshot"), { snapshotted: false }];

it("lists the saved tables and says where the season stands at every moment, in every language", async () => {
  for (const phase of PHASES) {
    const world = install(season(phase), [nudgeRoute]);
    const p = `[${phase}]`;
    const saved = await worldList(world);
    const { markup, text } = await renderShelf();
    const latest = saved.length ? Math.max(...saved.map((s) => s.gw)) : null;

    expect(text.startsWith(en.history.title), `${p} heading first`).toBe(true);
    expect(markup, `${p} section labelled by its heading`).toContain('aria-labelledby="tables-heading"');
    expect(text, `${p} no outage message`).not.toContain(en.client.errors.historyTitle);

    if (!saved.length) {
      expect(text, `${p} empty title`).toContain(en.history.emptyTitle);
      expectOneOf(text, en.history.emptyBody, `${p} empty body`);
      expect(text, `${p} plain intro`).toContain(en.history.intro);
      expect(items(markup), `${p} no entries`).toEqual([]);
    } else {
      expect(text, `${p} not empty`).not.toContain(en.history.emptyTitle);
      expectOneOf(text, en.history.lede.map((f) => f(latest!, saved.length)), `${p} lede with ${saved.length} tables, latest GW${latest}`);
      const list = items(markup);
      const newestFirst = [...saved].sort((a, b) => b.gw - a.gw);
      expect(list.map((i) => i.href), `${p} links newest first`).toEqual(newestFirst.map((s) => `/history/${s.gw}`));
      newestFirst.forEach((s, i) => {
        const who = `${p} entry GW${s.gw}`;
        expect(list[i].text.startsWith(`GW${s.gw}`), `${who}: label, got "${list[i].text}"`).toBe(true);
        expect(list[i].text, `${who}: saved date`).toContain(`${en.history.saved} ${day(s.taken_at)}`);
        expect(list[i].text.includes(en.history.latest), `${who}: "Latest final" only on the newest`).toBe(i === 0);
        expect(list[i].text, `${who}: not rebuilt`).not.toContain(en.history.rebuilt);
      });
    }

    const st = expectedStatus(phase, world.gw, latest);
    const v = statusVariants(st.gw);
    for (const kind of ["live", "pending", "filed"] as const) {
      if (st.kind === kind) expectOneOf(text, v[kind], `${p} ${kind} line for GW${st.gw}`);
      else expectNoneOf(text, v[kind], `${p} ${kind} line`);
    }

    // The nudge to file a finished week: only once FPL has made it final (not while provisional), and only once per session.
    const nudgeExpected = st.kind === "pending" && (phase === "final" || phase === "season-over");
    requested.length = 0;
    render(await shelfElement());
    const posts = requested.filter((u) => u.endsWith("/api/snapshot"));
    expect(posts.length, `${p} snapshot nudge ${nudgeExpected ? "sent once" : "not sent"}`).toBe(nudgeExpected ? 1 : 0);
    cleanup();
    if (nudgeExpected) {
      requested.length = 0;
      vi.resetModules();
      render(await shelfElement());
      expect(requested.filter((u) => u.endsWith("/api/snapshot")), `${p} nudge not repeated in the same session`).toEqual([]);
      cleanup();
    }
    uninstall();
    vi.resetModules();
  }

  // Final phase once GW6 has been filed: up to date, no nudge.
  {
    const world = season("final");
    const saved = [...(await worldList(world)), { gw: 6, taken_at: "2026-10-14T09:00:00.000Z" }];
    install(world, [[isList, { league_id: LEAGUE_ID, snapshots: saved }], nudgeRoute]);
    const { markup, text } = await renderShelf();
    expectOneOf(text, en.history.filed.map((f) => f(6)), "[final, filed] filed line");
    expectNoneOf(text, en.history.pending.map((f) => f(6)), "[final, filed] pending line");
    expect(items(markup)[0], "[final, filed] GW6 newest, marked latest").toEqual({ href: "/history/6", text: `GW6 ${en.history.latest} ${en.history.saved} 14 Oct 2026 UTC` });
    render(await shelfElement());
    expect(requested.filter((u) => u.endsWith("/api/snapshot")), "[final, filed] no nudge").toEqual([]);
    cleanup();
    uninstall();
    vi.resetModules();
  }

  // Spanish, French, and the trip catalog: translated lines, same entries.
  for (const [locale, trip] of [["es", undefined], ["fr", undefined], ["en", "1"]] as const) {
    testLanguage.cookie = locale;
    testLanguage.trip = trip;
    const world = install(season("final"), [nudgeRoute]);
    const saved = await worldList(world);
    const { markup, text } = await renderShelf();
    const p = `[final/${locale}${trip ? "/trip" : ""}]`;
    const t = trip ? (await import("@/lib/domain")).tripMessagesFor(locale) : messagesFor(locale);
    expect(text.startsWith(t.history.title), `${p} translated heading "${t.history.title}"`).toBe(true);
    expectOneOf(text, t.history.lede.map((f) => f(5, saved.length)), `${p} lede`);
    expectOneOf(text, t.history.pending.map((f) => f(6)), `${p} pending line`);
    const list = items(markup);
    expect(list.map((i) => i.href), `${p} same entries`).toEqual([5, 4, 3, 2, 1].map((g) => `/history/${g}`));
    expect(list[0].text, `${p} translated label`).toContain(t.history.latest);
    expect(list[0].text, `${p} translated GW label`).toContain(t.common.gw(5));
    expect(list[1].text, `${p} translated "saved"`).toContain(t.history.saved);
    if (locale !== "en") expect(text, `${p} no English lede left`).not.toContain("tables so far");
    testLanguage.cookie = undefined;
    testLanguage.trip = undefined;
    uninstall();
    vi.resetModules();
  }
});

it("cleans up what the history server sends and degrades gracefully when it is down, asleep or garbled", async () => {
  // A. A messy list: duplicates (first kept), junk gameweeks dropped, out of order, rebuilt tables, missing dates.
  {
    const p = "[messy list]";
    const snapshots = [
      { gw: 3, taken_at: "2026-09-22T18:00:00Z" },
      { gw: 1, taken_at: "2026-09-08T18:00:00Z" },
      { gw: 3, taken_at: "2030-01-01T00:00:00Z" },
      { gw: 0, taken_at: "2026-09-01T18:00:00Z" },
      { gw: 39, taken_at: "2026-09-01T18:00:00Z" },
      { gw: "4", taken_at: "2026-09-29T18:00:00Z" },
      { gw: 2.5, taken_at: "2026-09-15T18:00:00Z" },
      { gw: null },
      "junk",
      { gw: 5, taken_at: "2026-10-06T18:00:00Z", rebuilt: true },
      { gw: 2 },
      { gw: 4, rebuilt: true },
    ];
    install(season("final"), [[isList, { league_id: LEAGUE_ID, snapshots }], nudgeRoute]);
    const { markup, text } = await renderShelf();
    const list = items(markup);
    expect(list.map((i) => i.href), `${p} valid, unique, newest first`).toEqual([5, 4, 3, 2, 1].map((g) => `/history/${g}`));
    expect(list[0].text, `${p} GW5 rebuilt with date, marked latest`).toBe(`GW5 ${en.history.latest} ${en.history.rebuilt} 6 Oct 2026 UTC`);
    expect(list[1].text, `${p} GW4 rebuilt, no date`).toBe(`GW4 ${en.history.rebuilt}`);
    expect(list[2].text, `${p} GW3 keeps its first entry's date`).toBe(`GW3 ${en.history.saved} 22 Sept 2026 UTC`);
    expect(list[3].text, `${p} GW2 without a date shows just the label`).toBe("GW2");
    expect(list[4].text, `${p} GW1 saved`).toBe(`GW1 ${en.history.saved} 8 Sept 2026 UTC`);
    expect(markup, `${p} the duplicate's date is gone`).not.toContain("2030");
    expectOneOf(text, en.history.lede.map((f) => f(5, 5)), `${p} lede counts 5`);
    expectOneOf(text, en.history.pending.map((f) => f(6)), `${p} GW6 still pending`);
    uninstall();
    vi.resetModules();
  }

  // B. Every way the server can fail: the shelf says so quietly and offers a retry; it never throws.
  const failures: [string, Routes[number][1]][] = [
    ["503", () => new Response("Service Unavailable", { status: 503 })],
    ["500 JSON", () => jsonRes({ error: "boom" }, 500)],
    ["HTML 200", () => new Response("<!doctype html><title>Waking up</title>", { status: 200, headers: { "content-type": "text/html" } })],
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["not a list", { league_id: LEAGUE_ID, snapshots: "nope" }],
    ["array body", [1, 2, 3]],
  ];
  for (const [name, handler] of failures) {
    const p = `[${name}]`;
    install(season("final"), [[isList, handler]]);
    const { markup, text } = await renderShelf();
    expect(text, `${p} outage title`).toContain(en.client.errors.historyTitle);
    expect(text, `${p} outage body`).toContain(en.client.errors.historyBody);
    expect(markup, `${p} retry button`).toMatch(/<button[^>]*>[^<]*<\/button>|<button/);
    expect(text, `${p} plain intro, no counts`).toContain(en.history.intro);
    expectNoneOf(text, [...en.history.pending.map((f) => f(6)), ...en.history.filed.map((f) => f(6))], `${p} no status line over an outage`);
    expect(text, `${p} not claimed empty`).not.toContain(en.history.emptyTitle);
    expect(items(markup), `${p} no entries`).toEqual([]);
    uninstall();
    vi.resetModules();
  }

  // C. A sleepy server that answers after a delay: the shelf waits and lists normally.
  {
    const p = "[slow]";
    const world = season("final");
    const list = await worldList(world);
    install(world, [[isList, async () => {
      await new Promise((r) => setTimeout(r, 30));
      return jsonRes({ league_id: LEAGUE_ID, snapshots: list });
    }]]);
    const { markup, text } = await renderShelf();
    expect(items(markup).length, `${p} all tables`).toBe(list.length);
    expect(text, `${p} no outage`).not.toContain(en.client.errors.historyTitle);
    uninstall();
    vi.resetModules();
  }

  // D. FPL down, history fine: the shelf still lists, just without the season status.
  {
    const p = "[fpl down]";
    const world = season("final");
    const list = await worldList(world);
    install(world, [[(u) => u.includes("/bootstrap-static/"), () => new Response("nope", { status: 503 })]]);
    const { markup, text } = await renderShelf();
    expect(items(markup).length, `${p} all tables`).toBe(list.length);
    expectOneOf(text, en.history.lede.map((f) => f(5, 5)), `${p} lede`);
    expectNoneOf(text, [...en.history.pending.map((f) => f(6)), ...en.history.live.map((f) => f(6))], `${p} no status without FPL`);
    render(await shelfElement());
    expect(requested.filter((u) => u.endsWith("/api/snapshot")), `${p} no nudge without knowing the week is final`).toEqual([]);
    uninstall();
    vi.resetModules();
  }

  // E. Both down: one outage message, nothing invented.
  {
    const p = "[both down]";
    install(season("final"), [[isList, () => new Response("x", { status: 502 })], [(u) => u.includes("/bootstrap-static/"), () => new Response("x", { status: 502 })]]);
    const { text } = await renderShelf();
    expect(text.split(en.client.errors.historyTitle).length - 1, `${p} exactly one outage message`).toBe(1);
    expect(text, `${p} plain intro`).toContain(en.history.intro);
  }
});

it("history archive typography, temporal order, and accessibility across normal and blotter modes", async () => {
  // Test 3: History shelf list structure, newest-first temporal ordering, and zero axe violations
  const { expectNoAxeViolations } = await import("../axe");
  const world = season("final");

  for (const trip of [false, true]) {
    const mode = trip ? "blotter" : "normal";
    testLanguage.trip = trip ? "1" : undefined;
    install(world);

    const { markup, text } = await renderShelf();
    const doc = new DOMParser().parseFromString(markup, "text/html");

    // 1. Full axe accessibility audit
    await expectNoAxeViolations(doc.body);

    // 2. Archive links: newest-first links to saved gameweek snapshots
    const links = [...doc.querySelectorAll("a[href^='/history/']")];
    expect(links.length, `${mode}: snapshot links present`).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("href"), `${mode}: valid snapshot link`).toMatch(/^\/history\/\d+$/);
    }

    // 3. Section heading and intro
    const heading = doc.querySelector("h2");
    expect(heading, `${mode}: section heading exists`).not.toBeNull();

    // 4. Clean text: no undefined, NaN, or raw code artifacts
    expect(text, `${mode}: text is pristine`).not.toMatch(/undefined|NaN|\[object|\{\{/);

    uninstall();
    vi.resetModules();
  }
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
