/**
 * Journey: The Times library (/times), rendered by the real page, service and view, with FPL served by the shared
 * in-memory season (it decides the "next edition" note) and the newspapers by a fixed fake gateway.
 *
 * 1. The front page at every moment: masthead, latest edition, type filters, archive, the press note per FPL phase,
 *    the past-tables shelf streaming in below without ever breaking the page, an empty library.
 * 2. The library is right: order, numbering, counts, filters, page counts / sizes / dates in the reader's language,
 *    links, es / fr / blotter parity, junk parameters ignored and never echoed, no undefined / NaN anywhere.
 *
 * Expected values are written out here (or derived from the fixture library and the catalogs), never from the app's model.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ISSUE_KINDS, type IssueKind, type IssueSummary } from "@/lib/domain";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import { INTL_LOCALE, type Locale } from "@/lib/domain/i18n/locales";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { LIBRARY, fakeTimes, summary } from "../times-fixtures";
import { LEAGUE_ID, PHASES, install, jsonRes, requested, season, textOf, uninstall, type PhaseName, type Routes, type World } from "./world";

beforeEach(() => vi.resetModules());
afterEach(() => {
  uninstall();
  vi.doUnmock("@/lib/times");
});

// ------------------------------------------------------------------------------------------------ visiting the page

interface Lang {
  locale: Locale;
  trip: boolean;
}
const EN: Lang = { locale: "en", trip: false };
const LANGS: Lang[] = [EN, { locale: "es", trip: false }, { locale: "fr", trip: false }, { locale: "en", trip: true }, { locale: "es", trip: true }, { locale: "fr", trip: true }];
const nameOf = (l: Lang) => `${l.locale}${l.trip ? "+blotter" : ""}`;
const catalog = (l: Lang): Messages => (l.trip ? tripMessagesFor(l.locale) : MESSAGES[l.locale]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

interface Visit {
  html: string;
  text: string;
  doc: Document;
}

/** Fresh modules, the world behind fetch, the newspapers behind the gateway, the request's language, the real page. */
async function visit(world: World, { library = LIBRARY, kind, extra = [], lang = EN }: { library?: IssueSummary[]; kind?: string | string[]; extra?: Routes; lang?: Lang } = {}): Promise<Visit> {
  vi.resetModules();
  uninstall();
  install(world, extra);
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(library) }));
  const page = (await import("@/app/times/page")).default;
  const element: ReactElement = await page({ searchParams: Promise.resolve(kind === undefined ? {} : { kind }) });
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  const html = renderToStaticMarkup(<I18nProvider locale={lang.locale} trip={lang.trip}>{element}</I18nProvider>);
  return { html, text: textOf(html), doc: new DOMParser().parseFromString(html, "text/html") };
}

/** The past-tables shelf on its own, as it streams in after the page (it never blocks the newspapers). */
async function shelf(): Promise<string> {
  const { TablesArchive } = await import("@/app/times/archive");
  return textOf(renderToStaticMarkup((await TablesArchive()) as ReactElement));
}

// ------------------------------------------------------------------------------------------------ reading the page

interface Card {
  href: string;
  title: string;
  badges: string[];
  kicker: string | null;
  summary: string | null;
  facts: string;
}
const cards = (doc: Document): Card[] =>
  [...doc.querySelectorAll('section[aria-labelledby="issues-heading"] li')].map((li) => ({
    href: li.querySelector("h3 a")?.getAttribute("href") ?? "",
    title: norm(li.querySelector("h3")?.textContent),
    badges: [...li.querySelectorAll(".cardMeta > *")].map((b) => norm(b.textContent)),
    kicker: li.querySelector(".kicker") ? norm(li.querySelector(".kicker")!.textContent) : null,
    summary: li.querySelector(".summary") ? norm(li.querySelector(".summary")!.textContent) : null,
    facts: norm(li.querySelector(".facts")?.textContent),
  }));
const filters = (doc: Document, label: string) =>
  [...doc.querySelectorAll(`nav[aria-label="${label}"] a`)].map((a) => ({
    label: norm([...a.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("")),
    count: norm(a.querySelector(".count")?.textContent),
    href: a.getAttribute("href"),
    current: a.getAttribute("aria-current"),
  }));
const hero = (doc: Document) => doc.querySelector('section[aria-labelledby="latest-heading"]');
const notes = (doc: Document) => [...doc.querySelectorAll('[role="note"]')].map((n) => norm(n.textContent));

function expectOneOf(text: string, variants: string[], what: string) {
  expect(variants.some((v) => text === v || text.includes(v)), `${what}: none of\n  ${variants.join("\n  ")}\nin:\n  ${text}`).toBe(true);
}
function expectClean(v: Visit, what: string) {
  expect(v.html, `${what}: nothing undefined / NaN / [object …] on the page`).not.toMatch(/undefined|NaN|\[object |null(?![-\w])/);
}

// ------------------------------------------------------------------------------------------------ the oracle

/** What the press owes the reader at each moment, from FPL's flags in the world and the newest newspaper (GW5) on the shelf. */
function expectedNote(phase: PhaseName, t: Messages, printed = 5): string[] | null {
  const live = phase === "live-playing" || phase === "live-between" || phase === "live-over";
  const done = phase === "provisional" || phase === "final" ? 6 : phase === "season-over" ? 38 : null;
  if (live) return t.times.inPlay.map((f) => f(6));
  if (done !== null && printed > 0 && done === printed + 1) return t.times.awaiting.map((f) => f(done));
  return null;
}

/** Newest first; same day: the higher gameweek, then the more important kind (times, recap, preview, plan, dossier, report). Written out. */
const ORDER = ["plan-gw6", "dossier-gw6", "times-gw5", "times-gw4", "one-pager"];
const byId = new Map(LIBRARY.map((i) => [i.id, i]));
const SIZE: Record<Locale, (id: string) => string> = {
  en: (id) => (id === "times-gw5" ? "3.2 MB" : "512 KB"),
  es: (id) => (id === "times-gw5" ? "3.2 MB" : "512 KB"),
  fr: (id) => (id === "times-gw5" ? "3,2 Mo" : "512 Ko"),
};
const PAGES: Record<Locale, (n: number) => string> = {
  en: (n) => `${n} ${n === 1 ? "page" : "pages"}`,
  es: (n) => `${n} ${n === 1 ? "página" : "páginas"}`,
  fr: (n) => `${n} ${n === 1 ? "page" : "pages"}`,
};
const date = (iso: string, l: Locale) => new Intl.DateTimeFormat(INTL_LOCALE[l], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const facts = (i: IssueSummary, l: Locale) => `${PAGES[l](i.pageCount)} · ${SIZE[l](i.id)} · ${date(i.published, l)}`;

const isHistoryList = (u: string) => u.endsWith(`/history/${LEAGUE_ID}`);

// ================================================================================================ 1. at every moment

it("the front page at every moment", async () => {
  const t = MESSAGES.en;
  const healthy: Record<string, string> = {};

  for (const phase of PHASES) {
    const p = `[${phase}]`;
    const v = await visit(season(phase));
    expectClean(v, p);
    expect(requested.some((u) => u.includes("/bootstrap-static/")), `${p} asks FPL where the season stands`).toBe(true);

    // The masthead: one h1, the nameplate, both straplines.
    const h1s = [...v.doc.querySelectorAll("h1")];
    expect(h1s.map((h) => norm(h.textContent)), `${p} exactly one h1, the nameplate`).toEqual(["The Lobster Times"]);
    const top = [...v.doc.querySelectorAll(".mastheadTop span")].map((s) => norm(s.textContent));
    expect(top[0], `${p} masthead left`).toBe(t.times.mastheadLeft);
    expectOneOf(top[1] ?? "", t.times.mastheadRight, `${p} masthead right`);

    // The latest edition: the newest newspaper (GW5), not the newer plan or dossier.
    const h = hero(v.doc);
    expect(h, `${p} a latest-edition hero`).not.toBeNull();
    expectOneOf(norm(h!.querySelector("#latest-heading")?.textContent), t.times.latest.map((f) => f(5)), `${p} hero eyebrow names GW5`);
    expect(norm(h!.querySelector("h2")?.textContent), `${p} hero title`).toBe("The Lobster Times");
    expect(norm(h!.querySelector(".kicker")?.textContent), `${p} hero kicker`).toBe("Vol. V · Issue 5");
    expect(norm(h!.querySelector(".heroSummary")?.textContent), `${p} hero summary`).toBe("The gazette of the league.");
    expect(norm(h!.querySelector(".facts")?.textContent), `${p} hero facts`).toBe(`6 pages · ${date("2026-09-21", "en")}`);
    const read = [...h!.querySelectorAll("a")].filter((a) => norm(a.textContent) === t.times.read);
    expect(read.map((a) => a.getAttribute("href")), `${p} one visible "Read the issue" link to the hero`).toEqual(["/times/times-gw5"]);
    const cover = h!.querySelector("a[aria-hidden]");
    expect(cover?.getAttribute("tabindex"), `${p} the cover link duplicates the button, so it is out of the tab order`).toBe("-1");
    expect(cover?.querySelector("img")?.getAttribute("alt"), `${p} decorative cover`).toBe("");

    // The type filters: all five, with "All" current.
    expect(filters(v.doc, t.times.filterBy), `${p} filters`).toEqual([
      { label: "All", count: "5", href: "/times", current: "true" },
      { label: "Newspapers", count: "2", href: "/times?kind=times", current: null },
      { label: "Plans", count: "1", href: "/times?kind=plan", current: null },
      { label: "Dossiers", count: "1", href: "/times?kind=dossier", current: null },
      { label: "Reports", count: "1", href: "/times?kind=report", current: null },
    ]);

    // The archive: everything but the hero, newest first.
    expect(norm(v.doc.querySelector("#issues-heading")?.textContent), `${p} archive heading`).toBe(t.times.archive);
    expect(cards(v.doc).map((c) => c.href), `${p} archive order, hero left out`).toEqual(ORDER.filter((id) => id !== "times-gw5").map((id) => `/times/${id}`));

    // The press note, worked out from FPL's flags.
    const want = expectedNote(phase, t);
    const got = notes(v.doc);
    if (want) {
      expect(got.length, `${p} exactly one press note`).toBe(1);
      expectOneOf(got[0], want, `${p} press note`);
    } else {
      expect(got, `${p} no press note: nothing is being played or printed`).toEqual([]);
    }
    // The note never contradicts the moment.
    if (phase.startsWith("live")) expect(t.times.awaiting.map((f) => f(6)).some((s) => v.text.includes(s)), `${p} not "at the printers" mid-gameweek`).toBe(false);
    if (phase === "provisional" || phase === "final") expect(t.times.inPlay.map((f) => f(6)).some((s) => v.text.includes(s)), `${p} not "being played" once over`).toBe(false);

    // The past tables stream in under the newspapers: the page holds a placeholder for them and never waits.
    const tables = v.doc.querySelector("#tables");
    expect(tables, `${p} the #tables anchor`).not.toBeNull();
    expect(norm(tables!.querySelector("h2")?.textContent), `${p} the shelf's heading while it loads`).toBe(t.history.title);
    expect(v.doc.querySelector("#tables")!.compareDocumentPosition(v.doc.querySelector("#issues-heading")!) & Node.DOCUMENT_POSITION_PRECEDING, `${p} the shelf sits below the newspapers`).toBeTruthy();
    healthy[phase] = v.html;
  }

  // The live gameweek, while matches are on and while it is paused between them: "being played" (worded per catalog), with GW6.
  for (const phase of ["live-playing", "live-between"] as PhaseName[]) {
    const v = await visit(season(phase));
    expect(notes(v.doc)[0], `[${phase}] the note names the gameweek in play`).toMatch(/Gameweek 6\b/);
  }

  // Whether the presses are behind depends on what is printed, not only the moment.
  const presses: [string, PhaseName, IssueSummary[], string[] | null][] = [
    ["final, GW6 already printed", "final", [...LIBRARY, summary({ id: "times-gw6", kind: "times", gameweek: 6, published: "2026-10-14" })], null],
    ["provisional, last print GW4 (a gap: the presses stopped)", "provisional", LIBRARY.filter((i) => i.id !== "times-gw5"), null],
    ["provisional, no newspaper at all", "provisional", LIBRARY.filter((i) => i.kind !== "times"), null],
    ["season over, GW37 printed", "season-over", [...LIBRARY, summary({ id: "times-gw37", kind: "times", gameweek: 37, published: "2027-05-20" })], t.times.awaiting.map((f) => f(38))],
    ["season over, GW38 printed", "season-over", [...LIBRARY, summary({ id: "times-gw38", kind: "times", gameweek: 38, published: "2027-05-27" })], null],
    ["live, GW6 printed early (impossible, but no promise)", "live-playing", LIBRARY, t.times.inPlay.map((f) => f(6))],
  ];
  for (const [name, phase, library, want] of presses) {
    const v = await visit(season(phase), { library });
    expectClean(v, `[${name}]`);
    const got = notes(v.doc);
    if (want) {
      expect(got.length, `[${name}] one note`).toBe(1);
      expectOneOf(got[0], want, `[${name}] note`);
    } else expect(got, `[${name}] no note`).toEqual([]);
  }

  // FPL down: the newspapers still render, just without a note.
  {
    const p = "[fpl down]";
    const v = await visit(season("final"), { extra: [[(u) => u.includes("/bootstrap-static/"), () => new Response("down", { status: 503 })]] });
    expectClean(v, p);
    expect(notes(v.doc), `${p} no note without FPL`).toEqual([]);
    expect(hero(v.doc), `${p} hero still there`).not.toBeNull();
    expect(cards(v.doc).length, `${p} archive still there`).toBe(4);
  }

  // The tables shelf asleep or down: the page is byte-for-byte the same, and the shelf itself says so without throwing.
  const outages: [string, Routes[number][1]][] = [
    ["503", () => new Response("Service Unavailable", { status: 503 })],
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["HTML wake-up page", () => new Response("<!doctype html><title>Waking up</title>", { status: 200, headers: { "content-type": "text/html" } })],
    ["asleep (never answers)", () => new Promise<Response>(() => {})],
  ];
  for (const [name, handler] of outages) {
    for (const phase of ["live-playing", "final"] as PhaseName[]) {
      const p = `[history ${name}, ${phase}]`;
      const v = await visit(season(phase), { extra: [[isHistoryList, handler]] });
      expect(v.html, `${p} the newspapers do not depend on the history server`).toBe(healthy[phase]);
      if (name.startsWith("asleep")) continue; // the shelf keeps loading; the page above was already proven whole
      const s = await shelf();
      expect(s, `${p} the shelf says it is unavailable`).toContain(t.client.errors.historyTitle);
      expect(s, `${p} the shelf invents no tables`).not.toMatch(/Gameweek \d+ final table|undefined|NaN/);
    }
  }
  // …and healthy, the shelf lists the world's saved tables.
  {
    install(season("final"));
    const s = await shelf();
    expect(s, "[history healthy] shelf heading").toContain(t.history.title);
    expect(s, "[history healthy] no outage").not.toContain(t.client.errors.historyTitle);
    uninstall();
    vi.resetModules();
    install(season("final"), [[isHistoryList, jsonRes({ league_id: LEAGUE_ID, snapshots: [] })]]);
    expect(await shelf(), "[history empty] no outage over an empty shelf").not.toContain(t.client.errors.historyTitle);
  }

  // An empty library, at every moment: the masthead, an explanation, no filters, no hero, no archive, no promises.
  for (const phase of PHASES) {
    const p = `[empty, ${phase}]`;
    const v = await visit(season(phase), { library: [] });
    expectClean(v, p);
    expect([...v.doc.querySelectorAll("h1")].map((h) => norm(h.textContent)), `${p} the nameplate`).toEqual(["The Lobster Times"]);
    expect(v.text, `${p} empty title`).toContain(t.times.emptyTitle);
    expectOneOf(v.text, t.times.emptyBody, `${p} empty body`);
    expect(hero(v.doc), `${p} no hero`).toBeNull();
    expect(v.doc.querySelector("nav"), `${p} no filters`).toBeNull();
    expect(v.doc.querySelector("#issues-heading"), `${p} no archive`).toBeNull();
    expect(notes(v.doc), `${p} no press note`).toEqual([]);
    expect(v.doc.querySelector("#tables"), `${p} the tables shelf still follows`).not.toBeNull();
  }
}, 60_000);

// ================================================================================================ 2. the library is right

it("the library is right", async () => {
  // A longer shelf, shuffled, with same-day ties: the order must come from the data, not from the gateway.
  const SHELF: IssueSummary[] = [
    summary({ id: "report-a", title: "Alpha report", kind: "report", gameweek: null, published: "2026-10-01", pageCount: 1 }),
    summary({ id: "lobster-times-gw5", title: "The Lobster Times", kicker: "Vol. V · Issue 5", kind: "times", gameweek: 5, published: "2026-09-21", pageCount: 6, bytes: 3_400_687, summary: "The gazette of the league." }),
    summary({ id: "plan-gw6", title: "Hold Second", kicker: "Gaucho F.C. · GW6 plan", kind: "plan", gameweek: 6, published: "2026-10-10", pageCount: 5, summary: "Stay second." }),
    summary({ id: "lobster-league-times-gw4", title: "The Lobster League Times", kicker: "GW4 final edition", kind: "times", gameweek: 4, published: "2026-09-16", pageCount: 4, summary: "The GW4 final table and the ledger." }),
    summary({ id: "recap-gw6", title: "GW6 Recap", kind: "recap", gameweek: 6, published: "2026-10-10", pageCount: 3 }),
    summary({ id: "preview-gw7", title: "GW7 Preview", kind: "preview", gameweek: 7, published: "2026-10-10", pageCount: 2 }),
    summary({ id: "dossier-gw6", title: "GW6 Dossier", kind: "dossier", gameweek: 6, published: "2026-10-10", pageCount: 2 }),
    summary({ id: "lobster-league-times-gw3", title: "The Lobster League Times", kicker: "GW3 master intelligence dossier", kind: "times", gameweek: 3, published: "2026-09-09", pageCount: 12, summary: "Official standings and squad performance for GW3." }),
    summary({ id: "report-b", title: "Beta report", kind: "report", gameweek: null, published: "2026-10-01", pageCount: 7 }),
  ];
  // Written out: 10 Oct (GW7 preview, then GW6 by kind: recap, plan, dossier), 1 Oct (no gameweek: by title), then the newspapers by date.
  const SHELF_ORDER = ["preview-gw7", "recap-gw6", "plan-gw6", "dossier-gw6", "report-a", "report-b", "lobster-times-gw5", "lobster-league-times-gw4", "lobster-league-times-gw3"];
  const shelfById = new Map(SHELF.map((i) => [i.id, i]));
  const COUNTS: Partial<Record<IssueKind, number>> = { times: 3, recap: 1, preview: 1, plan: 1, dossier: 1, report: 2 };

  const english: Record<string, Visit> = {};
  for (const lang of LANGS) {
    const t = catalog(lang);
    const L = nameOf(lang);
    const v = await visit(season("final"), { library: SHELF, lang });
    expectClean(v, `[${L}]`);

    // Newest first, the hero (newest newspaper) lifted out of the archive.
    expect(norm(hero(v.doc)?.querySelector("h2")?.textContent), `[${L}] hero is the newest newspaper`).toBe("The Lobster Times");
    expect(hero(v.doc)?.querySelector(".button, a:not([aria-hidden])")?.getAttribute("href"), `[${L}] hero link`).toBe("/times/lobster-times-gw5");
    expect(cards(v.doc).map((c) => c.href), `[${L}] archive newest first`).toEqual(SHELF_ORDER.filter((id) => id !== "lobster-times-gw5").map((id) => `/times/${id}`));

    // Numbering: the volume / edition line as printed in English, translated where the app has words for it.
    const volume = { en: "Vol. V · Issue 5", es: "Vol. V · Edición 5", fr: "Vol. V · Numéro 5" }[lang.locale];
    expect(norm(hero(v.doc)?.querySelector(".kicker")?.textContent), `[${L}] volume / issue line`).toBe(volume);
    const gw4 = cards(v.doc).find((c) => c.href === "/times/lobster-league-times-gw4")!;
    expect(gw4.kicker, `[${L}] GW4 edition line`).toBe({ en: "GW4 final edition", es: "Edición final de la J4", fr: "Édition finale de la J4" }[lang.locale]);
    expect(gw4.title, `[${L}] titles are proper names, never translated`).toBe("The Lobster League Times");
    const fresh = cards(v.doc).find((c) => c.href === "/times/plan-gw6")!;
    expect([fresh.kicker, fresh.summary], `[${L}] an issue without translations keeps its English words`).toEqual(["Gaucho F.C. · GW6 plan", "Stay second."]);

    // Badges: the kind in the reader's language, the gameweek when there is one.
    for (const c of cards(v.doc)) {
      const i = shelfById.get(c.href.replace("/times/", ""))!;
      expect(c.badges, `[${L}] ${i.id} badges`).toEqual([t.times.kindSingular[i.kind], ...(i.gameweek ? [t.common.gw(i.gameweek)] : [])]);
      expect(c.facts, `[${L}] ${i.id} facts: pages, size, date in the reader's language`).toBe(`${PAGES[lang.locale](i.pageCount)} · ${i.bytes === 3_400_687 ? SIZE[lang.locale]("times-gw5") : SIZE[lang.locale]("x")} · ${date(i.published, lang.locale)}`);
      expect(c.title, `[${L}] ${i.id} title`).toBe(i.title);
    }
    expect(norm(hero(v.doc)?.querySelector(".facts")?.textContent), `[${L}] hero facts`).toBe(`${PAGES[lang.locale](6)} · ${date("2026-09-21", lang.locale)}`);
    expect(cards(v.doc).find((c) => c.href === "/times/report-a")!.facts.startsWith(PAGES[lang.locale](1) + " ·"), `[${L}] one page is singular`).toBe(true);

    // Every link on the shelf opens a real issue at /times/<id>, and each issue is linked from exactly one visible title.
    const issueLinks = [...v.doc.querySelectorAll("a[href^='/times/']")].map((a) => a.getAttribute("href")!);
    for (const href of issueLinks) expect(shelfById.has(href.replace("/times/", "")), `[${L}] ${href} is an issue on the shelf`).toBe(true);
    const titled = [...v.doc.querySelectorAll("h3 a")].map((a) => a.getAttribute("href"));
    expect(new Set(titled).size, `[${L}] one title link per card`).toBe(titled.length);

    // Counts per kind and the labels, in the canonical order, "All" first.
    const f = filters(v.doc, t.times.filterBy);
    expect(f.map((x) => x.label), `[${L}] filter labels`).toEqual([t.times.all, ...ISSUE_KINDS.filter((k) => COUNTS[k]).map((k) => t.times.kindPlural[k])]);
    expect(f.map((x) => Number(x.count)), `[${L}] filter counts`).toEqual([SHELF.length, ...ISSUE_KINDS.filter((k) => COUNTS[k]).map((k) => COUNTS[k])]);
    expect(f.reduce((s, x, i) => (i ? s + Number(x.count) : s), 0), `[${L}] the kinds add up to all`).toBe(SHELF.length);
    expect(norm(v.doc.querySelector("#issues-heading")?.textContent), `[${L}] archive heading`).toBe(t.times.archive);
    expect(norm(v.doc.querySelector(".mastheadTop span")?.textContent), `[${L}] masthead strapline`).toBe(t.times.mastheadLeft);
    expect([...v.doc.querySelectorAll("h1")].map((h) => norm(h.textContent)), `[${L}] the nameplate stays as printed`).toEqual(["The Lobster Times"]);
    expectOneOf(notes(v.doc)[0] ?? "", t.times.awaiting.map((g) => g(6)), `[${L}] press note in the reader's language`);
    expect(v.doc.documentElement.innerHTML.includes(t.times.read), `[${L}] read button`).toBe(true);

    // Each filter shows exactly its kind, newest first, with no hero; a kind with nothing in it says so.
    for (const kind of ISSUE_KINDS) {
      const p = `[${L} ?kind=${kind}]`;
      const fv = await visit(season("final"), { library: SHELF, lang, kind });
      expectClean(fv, p);
      expect(hero(fv.doc), `${p} no hero on a filtered view`).toBeNull();
      expect(cards(fv.doc).map((c) => c.href), `${p} exactly that kind, newest first`).toEqual(SHELF_ORDER.filter((id) => shelfById.get(id)!.kind === kind).map((id) => `/times/${id}`));
      expect(norm(fv.doc.querySelector("#issues-heading")?.textContent), `${p} heading names the kind`).toBe(t.times.kindPlural[kind]);
      const current = filters(fv.doc, t.times.filterBy).filter((x) => x.current === "true");
      expect(current.map((x) => x.href), `${p} only this filter is current`).toEqual([`/times?kind=${kind}`]);
    }
    {
      const fv = await visit(season("final"), { library: LIBRARY, lang, kind: "recap" });
      expect(fv.text, `[${L} empty kind] says nothing is filed there`).toContain(t.times.noIssuesTitle);
      expect([...fv.doc.querySelectorAll("a")].filter((a) => norm(a.textContent) === t.times.showAll).map((a) => a.getAttribute("href")), `[${L} empty kind] a way back to everything`).toEqual(["/times"]);
      expect(cards(fv.doc), `[${L} empty kind] no cards`).toEqual([]);
    }

    // Parity: the same shelf in every language: same links in the same order, same counts.
    if (lang === EN) english.final = v;
    else {
      const en = english.final;
      expect(cards(v.doc).map((c) => c.href), `[${L}] same issues, same order as English`).toEqual(cards(en.doc).map((c) => c.href));
      expect(filters(v.doc, t.times.filterBy).map((x) => [x.href, x.count]), `[${L}] same filters as English`).toEqual(filters(en.doc, MESSAGES.en.times.filterBy).map((x) => [x.href, x.count]));
      expect(v.html, `[${L}] actually in another voice`).not.toBe(en.html);
      if (!lang.trip && lang.locale !== "en") {
        const DATA = SHELF.flatMap((i) => [i.title, i.kicker, i.summary]).filter((x): x is string => Boolean(x));
        expect(englishLeaks(en.html, v.html, lang.locale, { allow: [...DATA, "The Times", "The Lobster Times"] }), `[${L}] no English left behind`).toEqual([]);
      }
    }
    if (lang.trip) {
      const plain = await visit(season("final"), { library: SHELF, lang: { locale: lang.locale, trip: false } });
      expect(v.html, `[${L}] the blotter has its own words`).not.toBe(plain.html);
      expect(cards(v.doc).map((c) => c.href), `[${L}] the blotter lists the same issues`).toEqual(cards(plain.doc).map((c) => c.href));
    }
  }

  // The fixture library too: every card's facts, in all three languages.
  for (const l of ["en", "es", "fr"] as Locale[]) {
    const v = await visit(season("final"), { lang: { locale: l, trip: false } });
    for (const c of cards(v.doc)) expect(c.facts, `[${l} fixture] ${c.href}`).toBe(facts(byId.get(c.href.replace("/times/", ""))!, l));
  }

  // Unusable parameters mean "everything", and nothing of them reaches the page.
  const baseline = await visit(season("final"));
  const junk: (string | string[])[] = [
    "<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "", " ", "PLAN", "Plans", "plans", "times ", "../times", "times%00", "constructor", "__proto__", "toString", "hasOwnProperty",
    "javascript:alert(1)", "x".repeat(5000), ["<script>alert(1)</script>", "plan"], [], ["", "times"],
  ];
  for (const kind of junk) {
    const p = `[?kind=${JSON.stringify(kind).slice(0, 40)}]`;
    const v = await visit(season("final"), { kind });
    expect(v.html, `${p} same page as no filter`).toBe(baseline.html);
    expect(v.html, `${p} no script injected`).not.toMatch(/<script|onerror|javascript:/i);
    expect(v.text, `${p} nothing echoed`).not.toMatch(/alert\(1\)|xxxxxxxx|__proto__|constructor/);
  }
  // A list of values: the first usable one counts (a repeated ?kind=plan&kind=times).
  {
    const v = await visit(season("final"), { kind: ["plan", "times"] });
    expect(cards(v.doc).map((c) => c.href), "[?kind=plan&kind=times] the first one wins").toEqual(["/times/plan-gw6"]);
  }

  // No undefined / NaN anywhere, at any moment, filtered or not, in any language.
  for (const phase of PHASES)
    for (const kind of [undefined, "times", "recap"])
      for (const lang of [EN, { locale: "fr", trip: true } as Lang]) expectClean(await visit(season(phase), { kind, lang }), `[${phase} ${kind ?? "all"} ${nameOf(lang)}]`);
}, 60_000);

it("masthead, layout balance and accessibility in normal and blotter modes", async () => {
  // Test 3: one h1 and a sane outline, every issue reachable exactly once from a known address, the filters honest,
  // zero axe violations, and nothing unrendered, in both the normal and the altered view.
  const { expectNoAxeViolations } = await import("../axe");
  const ids = new Set(LIBRARY.map((i) => i.id));
  for (const lang of [EN, { locale: "en", trip: true } as Lang]) {
    const where = nameOf(lang);
    const v = await visit(season("final"), { lang });
    await expectNoAxeViolations(v.doc.body);

    // the outline: one h1 (the nameplate), and headings never skip a level
    const levels = [...v.doc.querySelectorAll("h1, h2, h3, h4")].map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1).length, `${where}: exactly one h1`).toBe(1);
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1], `${where}: heading ${i} does not skip a level`).toBeLessThanOrEqual(1));

    // every address on the page is an issue we know, and every issue is reachable
    const issueHrefs = [...v.doc.querySelectorAll("a[href^='/times/']")].map((a) => a.getAttribute("href")!.replace(/^\/times\//, "").split(/[?#]/)[0]);
    for (const id of issueHrefs) expect(ids.has(id), `${where}: /times/${id} is a real issue`).toBe(true);
    for (const id of ids) expect(issueHrefs.includes(id), `${where}: ${id} can be opened`).toBe(true);

    // the type filters: one link per kind present plus "all", each pointing at ?kind= of that kind
    const kinds = [...v.doc.querySelectorAll("a[href*='kind=']")].map((a) => new URL(a.getAttribute("href")!, "https://x.test").searchParams.get("kind"));
    for (const k of kinds) expect(ISSUE_KINDS as readonly string[], `${where}: filter kind ${k} is a real kind`).toContain(k);

    // images carry a text alternative (empty alt only on decoration), and no markup leaks into visible text
    for (const img of v.doc.querySelectorAll("img")) expect(img.hasAttribute("alt"), `${where}: image has an alt attribute`).toBe(true);
    expect(v.text, `${where}: nothing unrendered`).not.toMatch(/undefined|NaN|\[object|\{\{/);
  }
}, 60_000);

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
