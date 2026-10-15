/**
 * Journey: reading one issue of The Times (/times/[issue]), rendered by the real page, service, view, IssueReader and
 * Flipbook, with FPL served by the shared in-memory season and the newspapers by a fixed fake gateway.
 *
 * 1. Reading an issue: every page present and numbered, neighbours of the same kind only, not-found with a way back,
 *    per-issue metadata, the text alternative's headings, keyboard page turns (never while typing), progress, every phase.
 * 2. The issue content is right: each page's text exactly once, alt text, the PDF, deep links clamped, print rules,
 *    es / fr / blotter parity, axe.
 *
 * Expected values are written out here (or derived from the fixture library and the catalogs), never from the app's model.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { IssueSummary } from "@/lib/domain";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import { CLIENT_MESSAGES } from "@/lib/domain/i18n/client";
import { clientTrip } from "@/lib/domain/i18n/client/trip";
import type { Locale } from "@/lib/domain/i18n/locales";
import { expectNoAxeViolations } from "../axe";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { LIBRARY, fakeTimes, summary } from "../times-fixtures";
import { PHASES, install, jsonRes, season, textOf, uninstall, type Routes, type World } from "./world";

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  uninstall();
  vi.doUnmock("@/lib/times");
  window.history.replaceState(null, "", "/");
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
const clientCatalog = (l: Lang) => (l.trip ? clientTrip(CLIENT_MESSAGES[l.locale], l.locale) : CLIENT_MESSAGES[l.locale]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Each page's printed text, one line per line, as scripts/times/build.mjs writes text.json. Unique per page. */
const pageText = (id: string, n: number) => `${id.toUpperCase()} PAGE ${n} HEADLINE\nColumn ${n} of ${id}, first paragraph.\nPage ${n} closing line ${"x".repeat(n)}.`;
const textRoute = (library: IssueSummary[]): Routes => [
  [(u) => /\/times\/[a-z0-9-]+\/text\.json$/.test(u), (u) => {
    const id = u.match(/\/times\/([a-z0-9-]+)\/text\.json$/)![1];
    const s = library.find((i) => i.id === id);
    return s ? jsonRes({ id, pages: Array.from({ length: s.pageCount }, (_, i) => pageText(id, i + 1)) }) : new Response("nope", { status: 404 });
  }],
];

type Props = { params: Promise<{ issue: string }>; searchParams: Promise<{ p?: string | string[] }> };
const props = (issue: string, p?: string | string[]): Props => ({ params: Promise.resolve({ issue }), searchParams: Promise.resolve(p === undefined ? {} : { p }) });

/** Fresh modules, the world (plus each issue's text) behind fetch, the newspapers behind the gateway, the request's language. */
async function load(world: World, { library = LIBRARY, lang = EN, extra = [] }: { library?: IssueSummary[]; lang?: Lang; extra?: Routes } = {}) {
  vi.resetModules();
  uninstall();
  install(world, [...extra, ...textRoute(library)]);
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(library) }));
  const mod = await import("@/app/times/[issue]/page");
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  const wrap = (el: ReactElement) => <I18nProvider locale={lang.locale} trip={lang.trip}>{el}</I18nProvider>;
  return { Issue: mod.default as (p: Props) => Promise<ReactElement>, generateMetadata: mod.generateMetadata, wrap };
}

/** The server render of an issue at a page. */
async function ssr(world: World, id: string, p?: string | string[], opts: { library?: IssueSummary[]; lang?: Lang } = {}) {
  const { Issue, wrap } = await load(world, opts);
  const html = renderToStaticMarkup(wrap(await Issue(props(id, p))));
  return { html, text: textOf(html), doc: new DOMParser().parseFromString(html, "text/html") };
}

/** The issue mounted in the browser (jsdom), for the client side: keys, text, thumbnails. */
async function mount(world: World, id: string, p?: string, opts: { library?: IssueSummary[]; lang?: Lang } = {}) {
  const { Issue, wrap } = await load(world, opts);
  const el = await Issue(props(id, p));
  return render(wrap(el));
}

/** Which page the reader is on, as the page says it: the current slot's image and the narrow counter. */
const onPage = (c: HTMLElement) => ({
  alt: c.querySelector("figure[data-current] img")?.getAttribute("alt") ?? null,
  counter: norm(c.querySelector("p[class*='status'] .narrowOnly")?.textContent),
  url: window.location.search,
});
const announcement = (c: HTMLElement) => norm(c.querySelector('[aria-live="polite"]')?.textContent);

/** Neighbour links: [label, href]. */
const neighbourLinks = (doc: Document | HTMLElement, label: string) =>
  [...doc.querySelectorAll(`nav[aria-label="${label}"] a`)].map((a) => [norm(a.querySelector(".eyebrow")?.textContent), a.getAttribute("href")]);

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const clean = (html: string, what: string) => expect(html, `${what}: no undefined / NaN / [object …]`).not.toMatch(/undefined|NaN|\[object /);

// ================================================================================================ 1. reading an issue

it("reading an issue", async () => {
  const en = MESSAGES.en;
  const fb = CLIENT_MESSAGES.en.flipbook;

  // Every moment of the season: the reader opens, whole, and nothing on it depends on FPL.
  for (const phase of PHASES) {
    const p = `[${phase}]`;
    const v = await ssr(season(phase), "times-gw5");
    clean(v.html, p);
    expect([...v.doc.querySelectorAll("h1")].map((h) => norm(h.textContent)), `${p} one h1: the issue's title`).toEqual(["The Lobster Times"]);
    expect(norm(v.doc.querySelector("header p")?.textContent), `${p} eyebrow`).toBe("Newspaper · Gameweek 5");
    expect([...v.doc.querySelectorAll("header a")].map((a) => [norm(a.textContent), a.getAttribute("href")]), `${p} the way back`).toEqual([[en.times.back, "/times"]]);
    expect(v.doc.querySelector("section[aria-roledescription]")?.getAttribute("aria-label"), `${p} the reader is named after the issue`).toBe("The Lobster Times, Vol. V · Issue 5");
    expect(v.doc.querySelector("figure[data-current] img")?.getAttribute("alt"), `${p} opens on page 1`).toBe("Page 1 of 6");
    expect(norm(v.doc.querySelector(".narrowOnly")?.textContent), `${p} progress`).toBe("Page 1 of 6");
    expect(neighbourLinks(v.doc, en.times.more), `${p} neighbours`).toEqual([[en.times.previousIssue, "/times/times-gw4"]]);
    expect(v.html, `${p} the PDF`).toContain('href="/times/times-gw5/times-gw5.pdf"');
  }

  // Every page is there and numbered: open each by its link, and the no-JavaScript turner links its neighbours.
  for (const issue of LIBRARY) {
    for (let n = 1; n <= issue.pageCount; n++) {
      const p = `[${issue.id} p=${n}]`;
      const v = await ssr(season("final"), issue.id, String(n));
      clean(v.html, p);
      const current = v.doc.querySelector("figure[data-current] img");
      expect(current?.getAttribute("alt"), `${p} the page, numbered`).toBe(`Page ${n} of ${issue.pageCount}`);
      expect(current?.getAttribute("src"), `${p} the page's image`).toBe(`/times/${issue.id}/p-${String(n).padStart(3, "0")}-m.webp`);
      expect(current?.getAttribute("loading"), `${p} the page on show is not lazy`).toBe("eager");
      const slots = [...v.doc.querySelectorAll("figure img")].map((i) => i.getAttribute("alt"));
      const spread = n === 1 ? [1] : n % 2 === 0 ? [n, n + 1] : [n - 1, n];
      expect(slots, `${p} the spread in the markup (CSS shows one page when narrow)`).toEqual(spread.filter((k) => k <= issue.pageCount).map((k) => `Page ${k} of ${issue.pageCount}`));
      const noscript = v.html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
      const nsLinks = [...noscript.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      expect(nsLinks, `${p} the no-JavaScript turner`).toEqual([...(n > 1 ? [`/times/${issue.id}?p=${n - 1}`] : []), ...(n < issue.pageCount ? [`/times/${issue.id}?p=${n + 1}`] : [])]);
      expect(textOf(noscript), `${p} the no-JavaScript counter`).toContain(`Page ${n} of ${issue.pageCount}`);
      if (issue.pageCount === 1) {
        expect(v.doc.querySelector("button[aria-label='Next page'], button[aria-label='Previous page'], input[type=number]"), `${p} a one-page issue has nothing to turn`).toBeNull();
      }
    }
  }

  // Neighbours: only the same kind. A richer shelf with plans and a dossier on the same days.
  const SHELF: IssueSummary[] = [
    ...LIBRARY,
    summary({ id: "plan-gw4", title: "Plan Four", kind: "plan", gameweek: 4, published: "2026-09-12" }),
    summary({ id: "plan-gw5", title: "Plan Five", kicker: "GW5 plan", kind: "plan", gameweek: 5, published: "2026-09-21" }),
    summary({ id: "dossier-gw5", title: "GW5 Dossier", kind: "dossier", gameweek: 5, published: "2026-09-21" }),
  ];
  const NEIGHBOURS: Record<string, { older: string | null; newer: string | null }> = {
    "times-gw5": { older: "times-gw4", newer: null },
    "times-gw4": { older: null, newer: "times-gw5" },
    "plan-gw6": { older: "plan-gw5", newer: null },
    "plan-gw5": { older: "plan-gw4", newer: "plan-gw6" },
    "plan-gw4": { older: null, newer: "plan-gw5" },
    "dossier-gw6": { older: "dossier-gw5", newer: null },
    "dossier-gw5": { older: null, newer: "dossier-gw6" },
    "one-pager": { older: null, newer: null },
  };
  const kindOf = new Map(SHELF.map((i) => [i.id, i.kind]));
  for (const [id, want] of Object.entries(NEIGHBOURS)) {
    const p = `[neighbours of ${id}]`;
    const v = await ssr(season("final"), id, undefined, { library: SHELF });
    const links = neighbourLinks(v.doc, en.times.more);
    expect(links, p).toEqual([...(want.older ? [[en.times.previousIssue, `/times/${want.older}`]] : []), ...(want.newer ? [[en.times.nextIssue, `/times/${want.newer}`]] : [])]);
    for (const [, href] of links) expect(kindOf.get(href!.replace("/times/", "")), `${p} ${href} is the same kind`).toBe(kindOf.get(id));
    if (!want.older && !want.newer) expect(v.doc.querySelector(`nav[aria-label="${en.times.more}"]`), `${p} no empty neighbours nav`).toBeNull();
    const nb = [...v.doc.querySelectorAll(`nav[aria-label="${en.times.more}"] a`)].map((a) => norm(a.querySelector(".neighbourTitle")?.textContent));
    expect(nb, `${p} titles`).toEqual([want.older, want.newer].filter(Boolean).map((x) => SHELF.find((i) => i.id === x)!.title));
  }

  // Not found: an id that isn't on the shelf (or isn't an id at all) is a 404 with a way back to The Times.
  for (const id of ["nope", "times-gw99", "TIMES-GW5", "../times", "times-gw5/../x", "<script>alert(1)</script>", "", "times-gw5.pdf"]) {
    const { Issue, generateMetadata } = await load(season("final"));
    await expect(Issue(props(id)), `[${JSON.stringify(id)}] not found`).rejects.toThrow("NEXT_NOT_FOUND");
    const meta = await generateMetadata(props(id));
    expect(meta, `[${JSON.stringify(id)}] metadata of a missing issue is plain and private`).toEqual({ title: en.meta.times, robots: { index: false, follow: false } });
  }
  for (const lang of LANGS) {
    const t = catalog(lang);
    vi.resetModules();
    testLanguage.cookie = lang.locale;
    testLanguage.trip = lang.trip ? "1" : undefined;
    const NotFound = (await import("@/app/times/not-found")).default;
    const { container, unmount } = render(await NotFound());
    expect(within(container).getByRole("heading", { level: 1 }), `[${nameOf(lang)}] not-found heading`).toHaveTextContent(t.notFound.times.title);
    expect(within(container).getByRole("link", { name: t.times.back }), `[${nameOf(lang)}] back to The Times`).toHaveAttribute("href", "/times");
    expect(container.textContent, `[${nameOf(lang)}] explains`).toContain(t.notFound.times.body);
    unmount();
  }

  // Metadata: each issue its own title, description and cover; always private.
  const TITLES: Record<string, string> = {
    "times-gw5": "The Lobster Times, GW5",
    "times-gw4": "The Lobster League Times, GW4",
    "plan-gw6": "Hold Second, GW6",
    "dossier-gw6": "GW6 Dossier, GW6",
    "one-pager": "One Pager",
  };
  const titles = new Set<string>();
  for (const issue of LIBRARY) {
    const p = `[metadata ${issue.id}]`;
    const { generateMetadata } = await load(season("final"));
    const meta = await generateMetadata(props(issue.id));
    const description = issue.summary ?? en.meta.timesDescription;
    expect(meta.title, `${p} title`).toBe(TITLES[issue.id]);
    expect(meta.description, `${p} description`).toBe(description);
    expect(meta.robots, `${p} private`).toEqual({ index: false, follow: false });
    expect(meta.openGraph, `${p} shared-link preview`).toMatchObject({
      title: TITLES[issue.id], description, type: "article", publishedTime: issue.published,
      images: [{ url: `/times/${issue.id}/p-001-l.webp`, width: issue.cover.width, height: issue.cover.height, alt: TITLES[issue.id] }],
    });
    titles.add(String(meta.title));
  }
  expect(titles.size, "no two issues share a title").toBe(LIBRARY.length);
  {
    const { generateMetadata } = await load(season("final"), { lang: { locale: "es", trip: false } });
    expect((await generateMetadata(props("times-gw5"))).title, "[es metadata] the gameweek in Spanish").toBe("The Lobster Times, J5");
  }

  // The client: progress, keys, typing, the text alternative's headings, thumbnails. In every phase.
  for (const phase of PHASES) {
    const p = `[client ${phase}]`;
    window.history.replaceState(null, "", "/times/times-gw5");
    const user = userEvent.setup();
    const { container, unmount } = await mount(season(phase), "times-gw5");
    expect(onPage(container), `${p} starts on page 1`).toEqual({ alt: "Page 1 of 6", counter: "Page 1 of 6", url: "" });
    expect(announcement(container), `${p} nothing announced on load`).toBe("");
    const prev = within(container).getByRole("button", { name: fb.previousPage });
    const next = within(container).getByRole("button", { name: fb.nextPage });
    expect(prev, `${p} previous is inert on page 1`).toHaveAttribute("aria-disabled", "true");

    // → turns forward, page by page, from anywhere on the page; the address keeps up.
    for (let n = 2; n <= 6; n++) {
      await user.keyboard("{ArrowRight}");
      expect(onPage(container), `${p} → to page ${n}`).toEqual({ alt: `Page ${n} of 6`, counter: `Page ${n} of 6`, url: `?p=${n}` });
      expect(announcement(container), `${p} announces page ${n}`).toBe(`Page ${n} of 6`);
    }
    expect(next, `${p} next is inert on the last page`).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{ArrowRight}");
    expect(onPage(container).alt, `${p} → stops at the end`).toBe("Page 6 of 6");
    // ← turns back.
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(onPage(container), `${p} ← ← to page 4`).toEqual({ alt: "Page 4 of 6", counter: "Page 4 of 6", url: "?p=4" });
    // Not while typing in a field: the page-number box owns its arrows.
    const box = within(container).getByLabelText(fb.goToPage);
    await user.click(box);
    await user.keyboard("{ArrowRight}{ArrowLeft}{ArrowLeft}");
    expect(onPage(container).alt, `${p} arrows in the page box don't turn the page`).toBe("Page 4 of 6");
    await user.clear(box);
    await user.type(box, "2{Enter}");
    expect(onPage(container), `${p} jump to page 2`).toEqual({ alt: "Page 2 of 6", counter: "Page 2 of 6", url: "?p=2" });
    // …nor with a modifier (Alt+← is the browser's Back).
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}{Shift>}{ArrowRight}{/Shift}");
    expect(onPage(container).alt, `${p} modified arrows are the browser's`).toBe("Page 2 of 6");
    await user.keyboard("{ArrowLeft}");
    expect(onPage(container), `${p} back to page 1, and the address drops ?p`).toEqual({ alt: "Page 1 of 6", counter: "Page 1 of 6", url: "" });

    // The text alternative: per-page h2s under the issue's h1, never deeper, never skipping.
    await user.click(within(container).getByText(fb.readAsText));
    await within(container).findByText(pageText("times-gw5", 1).split("\n")[0]);
    const levels = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1]));
    expect(levels[0], `${p} the issue title is the first heading`).toBe(1);
    levels.forEach((l, i) => i && expect(l - levels[i - 1], `${p} heading ${i} (h${l}) does not skip a level`).toBeLessThanOrEqual(1));
    const textHeadings = [...container.querySelectorAll("details h2")].map((h) => norm(h.textContent));
    expect(textHeadings, `${p} text headings`).toEqual([fb.pageHeading(1)]);
    await user.keyboard("{ArrowRight}");
    await within(container).findByText(pageText("times-gw5", 2).split("\n")[0]);
    expect(container.querySelector("details .textPage[data-current] h2")?.textContent, `${p} the text follows the page`).toBe(fb.pageHeading(2));

    // Thumbnails: every page, numbered, the one on show marked.
    await user.click(within(container).getByRole("button", { name: fb.thumbs }));
    const thumbs = within(within(container).getByRole("navigation", { name: fb.thumbsLabel("The Lobster Times, Vol. V · Issue 5") })).getAllByRole("button");
    expect(thumbs.map((b) => b.getAttribute("aria-label")), `${p} a thumbnail per page`).toEqual([1, 2, 3, 4, 5, 6].map((n) => fb.goToPageN(n)));
    expect(thumbs.map((b) => b.getAttribute("aria-current")), `${p} the page on show is current`).toEqual([null, "true", null, null, null, null]);
    await user.click(thumbs[4]);
    expect(onPage(container), `${p} a thumbnail opens its page`).toEqual({ alt: "Page 5 of 6", counter: "Page 5 of 6", url: "?p=5" });
    unmount();
    cleanup();
  }

  // A one-page issue: no keys to listen for, no turner, still a page 1 of 1.
  {
    window.history.replaceState(null, "", "/times/one-pager");
    const user = userEvent.setup();
    const { container } = await mount(season("final"), "one-pager");
    await user.keyboard("{ArrowRight}");
    expect(onPage(container), "[one-pager] stays put").toEqual({ alt: "Page 1 of 1", counter: "Page 1 of 1", url: "" });
    expect(within(container).queryByRole("button", { name: fb.nextPage }), "[one-pager] no next").toBeNull();
    expect(container.querySelector("[aria-keyshortcuts]"), "[one-pager] no shortcuts advertised").toBeNull();
  }
}, 60_000);

// ================================================================================================ 2. the content is right

it("the issue content is right", async () => {
  const fb = CLIENT_MESSAGES.en.flipbook;

  // Each page's text appears exactly once, under its own heading, marked as English; no other page's text leaks in.
  for (const issue of LIBRARY) {
    for (let n = 1; n <= issue.pageCount; n++) {
      const p = `[text ${issue.id} p=${n}]`;
      window.history.replaceState(null, "", `/times/${issue.id}`);
      const user = userEvent.setup();
      const { container, unmount } = await mount(season("final"), issue.id, String(n), { lang: { locale: "fr", trip: false } });
      await user.click(within(container).getByText(CLIENT_MESSAGES.fr.flipbook.readAsText));
      const lines = pageText(issue.id, n).split("\n");
      await within(container).findByText(lines[0]);
      const all = container.textContent ?? "";
      for (const line of lines) expect(count(all, line), `${p} "${line}" exactly once`).toBe(1);
      for (let k = 1; k <= issue.pageCount; k++) if (k !== n) expect(all.includes(pageText(issue.id, k).split("\n")[0]), `${p} no text of page ${k}`).toBe(false);
      const current = container.querySelector("details .textPage[data-current]")!;
      expect(norm(current.querySelector("h2")?.textContent), `${p} its heading`).toBe(CLIENT_MESSAGES.fr.flipbook.pageHeading(n));
      expect([...current.querySelectorAll("p")].map((x) => [x.textContent, x.getAttribute("lang")]), `${p} line by line, in English`).toEqual(lines.map((l) => [l, "en"]));
      unmount();
      cleanup();
    }
  }
  // Wide screens show a spread: both pages' texts, each once.
  {
    window.history.replaceState(null, "", "/times/times-gw5");
    const { Issue, wrap } = await load(season("final"));
    vi.stubGlobal("matchMedia", (query: string) => ({ media: query, matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(wrap(await Issue(props("times-gw5", "4"))));
    const user = userEvent.setup();
    expect(norm(container.querySelector(".wideOnly")?.textContent), "[wide] progress names the spread").toBe("Pages 4 and 5 of 6");
    await user.click(within(container).getByText(fb.readAsText));
    await within(container).findByText(pageText("times-gw5", 5).split("\n")[0]);
    await within(container).findByText(pageText("times-gw5", 4).split("\n")[0]);
    const all = container.textContent ?? "";
    for (const n of [4, 5]) for (const line of pageText("times-gw5", n).split("\n")) expect(count(all, line), `[wide p4-5] "${line}" once`).toBe(1);
    expect([...container.querySelectorAll("details h2")].map((h) => h.textContent), "[wide] a heading per page of the spread").toEqual([fb.pageHeading(4), fb.pageHeading(5)]);
    await user.keyboard("{ArrowLeft}");
    expect(norm(container.querySelector(".wideOnly")?.textContent), "[wide] ← goes back a whole spread").toBe("Pages 2 and 3 of 6");
    expect(window.location.search, "[wide] address").toBe("?p=2");
    cleanup();
    uninstall();
  }
  // The text can't be loaded: it says so and offers a retry, never shows another page's words.
  {
    window.history.replaceState(null, "", "/times/times-gw5");
    const { Issue, wrap } = await load(season("final"), { extra: [[(u) => u.endsWith("/text.json"), () => new Response("down", { status: 503 })]] });
    const user = userEvent.setup();
    const { container } = render(wrap(await Issue(props("times-gw5"))));
    await user.click(within(container).getByText(fb.readAsText));
    expect(await within(container).findByRole("alert"), "[text down] says so").toHaveTextContent(fb.textError);
    expect(within(container).getByRole("button", { name: fb.retry }), "[text down] retry").toBeInTheDocument();
    cleanup();
  }

  // Images: every page image is named "Page N of M"; decorative ones are empty-alt inside a named control.
  for (const issue of LIBRARY) {
    window.history.replaceState(null, "", `/times/${issue.id}`);
    const user = userEvent.setup();
    const { container, unmount } = await mount(season("final"), issue.id);
    if (issue.pageCount > 1) await user.click(within(container).getByRole("button", { name: fb.thumbs }));
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.length, `[alt ${issue.id}] images`).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.hasAttribute("alt"), `[alt ${issue.id}] ${img.getAttribute("src")} has an alt attribute`).toBe(true);
      const alt = img.getAttribute("alt")!;
      if (alt === "") expect(img.closest("button[aria-label]"), `[alt ${issue.id}] ${img.getAttribute("src")} decorative only inside a named button`).not.toBeNull();
      else expect(alt, `[alt ${issue.id}] ${img.getAttribute("src")}`).toMatch(new RegExp(`^Page \\d+ of ${issue.pageCount}$`));
      expect(Number(img.getAttribute("width")) > 0 && Number(img.getAttribute("height")) > 0, `[alt ${issue.id}] ${img.getAttribute("src")} reserves its size`).toBe(true);
    }
    // The PDF: one download link, with its size.
    const pdf = [...container.querySelectorAll(`a[href="/times/${issue.id}/${issue.id}.pdf"]`)];
    expect(pdf.length, `[pdf ${issue.id}] one download link`).toBe(1);
    expect(pdf[0].hasAttribute("download"), `[pdf ${issue.id}] downloads`).toBe(true);
    expect(norm(pdf[0].textContent), `[pdf ${issue.id}] names the size`).toBe(fb.downloadPdf(issue.id === "times-gw5" ? "3.2 MB" : "512 KB"));
    expect(within(container).getByRole("link", { name: fb.openFull(1) }), `[full ${issue.id}] full-size page`).toHaveAttribute("href", `/times/${issue.id}/p-001-l.webp`);
    unmount();
    cleanup();
  }

  // Deep links: ?p=N opens page N, clamped into the issue; malformed values open page 1. Nothing echoed.
  const DEEP: [string | string[], number][] = [
    ["1", 1], ["3", 3], ["6", 6], ["7", 6], ["999", 6], ["9999", 6], ["0", 1], ["-4", 1], ["0003", 3], ["", 1], ["abc", 1], ["2.5", 1], ["1e3", 1],
    [" 3", 1], ["99999", 1], ["<img src=x onerror=alert(1)>", 1], ["javascript:alert(1)", 1], [["4", "2"], 4], [["x", "3"], 1],
  ];
  for (const [raw, want] of DEEP) {
    const p = `[?p=${JSON.stringify(raw)}]`;
    const v = await ssr(season("final"), "times-gw5", raw);
    expect(v.doc.querySelector("figure[data-current] img")?.getAttribute("alt"), `${p} opens page ${want}`).toBe(`Page ${want} of 6`);
    expect(norm(v.doc.querySelector(".narrowOnly")?.textContent), `${p} progress`).toBe(`Page ${want} of 6`);
    expect(v.html, `${p} nothing echoed`).not.toMatch(/onerror|javascript:|alert\(1\)/);
    clean(v.html, p);
  }
  // The range is each issue's own: [id, ?p, page, of].
  for (const [id, raw, want, total] of [["one-pager", "5", 1, 1], ["one-pager", "1", 1, 1], ["times-gw4", "3", 3, 4], ["times-gw4", "5", 4, 4], ["plan-gw6", "5", 5, 5], ["dossier-gw6", "3", 2, 2]] as const) {
    const v = await ssr(season("final"), id, raw);
    expect(v.doc.querySelector("figure[data-current] img")?.getAttribute("alt"), `[${id} ?p=${raw}] in a ${total}-page issue`).toBe(`Page ${want} of ${total}`);
  }

  // Print: only the pages. The flipbook hides its controls, tools, text and thumbnails; the site's chrome and the reader's
  // issue-to-issue navigation hide too; and every page in view prints.
  const css = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
  const printBlocks = (src: string) => {
    const out: string[] = [];
    for (let i = src.indexOf("@media print"); i !== -1; i = src.indexOf("@media print", i + 1)) {
      let depth = 0;
      let j = src.indexOf("{", i);
      const start = j;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      out.push(src.slice(start + 1, j));
    }
    return out.join("\n");
  };
  const hidden = (src: string, selector: string) => {
    const block = printBlocks(src);
    return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, sel, body]) => sel.split(",").map((s) => s.trim()).includes(selector) && /display\s*:\s*none/.test(body));
  };
  const flip = css("components/ui/Flipbook/Flipbook.module.css");
  for (const sel of [".controls", ".tools", ".text"]) expect(hidden(flip, sel), `[print] Flipbook hides ${sel}`).toBe(true);
  expect(hidden(css("components/ui/Flipbook/PageThumbs.module.css"), ".nav"), "[print] thumbnails hidden").toBe(true);
  expect(hidden(css("components/ui/SiteHeader.module.css"), ".header") || /display\s*:\s*none/.test(printBlocks(css("components/ui/SiteHeader.module.css"))), "[print] the site header hides").toBe(true);
  expect(hidden(css("app/layout.module.css"), ".footer"), "[print] the footer hides").toBe(true);
  expect(hidden(css("components/views/times.module.css"), ".neighbours"), "[print] previous / next issue hide").toBe(true);
  expect(printBlocks(flip), "[print] every page of the spread prints").toMatch(/\.root\[data-layout\]\s+\.slot\s*\{[^}]*display\s*:\s*block/);
  expect(printBlocks(flip), "[print] no turn animation on paper").toMatch(/\.spread\s*\{[^}]*animation\s*:\s*none/);
  expect(hidden(flip, ".slot") || hidden(flip, ".viewport") || hidden(flip, ".root"), "[print] the pages themselves never hide").toBe(false);
  {
    // …and the classes the CSS hides are the ones the reader actually renders.
    const v = await ssr(season("final"), "times-gw5", "3");
    for (const cls of ["controls", "tools", "text", "neighbours", "slot", "spread", "viewport", "root"]) expect(v.doc.querySelector(`.${cls}`), `[print] .${cls} is on the page`).not.toBeNull();
  }

  // Languages: the same issue, the same pages, links and numbers, every word in the reader's language.
  const english = await ssr(season("final"), "times-gw5", "3");
  const struct = (doc: Document) => ({
    imgs: [...doc.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    links: [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    h1: [...doc.querySelectorAll("h1")].map((h) => norm(h.textContent)),
  });
  for (const lang of LANGS) {
    const L = `[${nameOf(lang)}]`;
    const t = catalog(lang);
    const c = clientCatalog(lang).flipbook;
    const v = await ssr(season("final"), "times-gw5", "3", { lang });
    clean(v.html, L);
    expect(struct(v.doc), `${L} same pages and links as English`).toEqual(struct(english.doc));
    expect(norm(v.doc.querySelector("header a")?.textContent), `${L} back`).toBe(t.times.back);
    expect(norm(v.doc.querySelector("header p")?.textContent), `${L} eyebrow`).toBe(t.times.eyebrow(t.times.kindSingular.times, 5));
    expect(v.doc.querySelector("figure[data-current] img")?.getAttribute("alt"), `${L} page alt`).toBe(c.pageOf(3, 6));
    expect(norm(v.doc.querySelector(".narrowOnly")?.textContent), `${L} progress`).toBe(c.pageOf(3, 6));
    expect(norm(v.doc.querySelector(".wideOnly")?.textContent), `${L} spread progress`).toBe(c.pagesOf(2, 3, 6));
    expect(norm(v.doc.querySelector(`a[href$=".pdf"]`)?.textContent), `${L} PDF`).toBe(c.downloadPdf(lang.locale === "fr" ? "3,2 Mo" : "3.2 MB"));
    expect(v.text.includes(t.times.englishOnly), `${L} says the pages are English only when the reader isn't`).toBe(lang.locale !== "en");
    expect(neighbourLinks(v.doc, t.times.more), `${L} neighbours`).toEqual([[t.times.previousIssue, "/times/times-gw4"]]);
    // This fixture id has no translated words on purpose: the edition line stays as printed in every language.
    expect(norm(v.doc.querySelector(".meta span")?.textContent), `${L} the edition line`).toBe("Vol. V · Issue 5");
    expect(v.doc.querySelector("section[aria-roledescription]")?.getAttribute("aria-roledescription"), `${L} role description`).toBe(c.roleDescription);
    if (lang.locale !== "en" && !lang.trip) {
      const DATA = LIBRARY.flatMap((i) => [i.title, i.kicker, i.summary]).filter((x): x is string => Boolean(x));
      expect(englishLeaks(english.html, v.html, lang.locale, { allow: [...DATA, "The Times", "The Lobster Times"] }), `${L} no English left behind`).toEqual([]);
    }
    if (lang.trip) {
      const plain = await ssr(season("final"), "times-gw5", "3", { lang: { locale: lang.locale, trip: false } });
      expect(v.html, `${L} the blotter has its own words`).not.toBe(plain.html);
    }
  }
  // An issue the app has words for: its kicker translated, its title not.
  {
    const real = LIBRARY.map((i) => (i.id === "times-gw5" ? { ...i, id: "lobster-times-gw5" } : i));
    for (const [locale, kicker] of [["en", "Vol. V · Issue 5"], ["es", "Vol. V · Edición 5"], ["fr", "Vol. V · Numéro 5"]] as const) {
      const v = await ssr(season("final"), "lobster-times-gw5", undefined, { library: real, lang: { locale, trip: false } });
      expect(norm(v.doc.querySelector(".meta span")?.textContent), `[${locale} real id] edition line`).toBe(kicker);
      expect(norm(v.doc.querySelector("h1")?.textContent), `[${locale} real id] title as printed`).toBe("The Lobster Times");
      expect(v.doc.querySelector("section[aria-roledescription]")?.getAttribute("aria-label"), `[${locale} real id] reader label`).toBe(`The Lobster Times, ${kicker}`);
    }
  }

  // Accessibility: the reader in each language, closed and with text and thumbnails open, on a newspaper and a one-pager.
  for (const lang of [EN, { locale: "es", trip: false }, { locale: "fr", trip: true }] as Lang[]) {
    for (const id of ["times-gw5", "one-pager"]) {
      window.history.replaceState(null, "", `/times/${id}`);
      const user = userEvent.setup();
      const { container, unmount } = await mount(season("live-playing"), id, id === "times-gw5" ? "3" : undefined, { lang });
      await expectNoAxeViolations(container);
      const c = clientCatalog(lang).flipbook;
      await user.click(within(container).getByText(c.readAsText));
      await within(container).findByText(pageText(id, id === "times-gw5" ? 3 : 1).split("\n")[0]);
      if (id === "times-gw5") await user.click(within(container).getByRole("button", { name: c.thumbs }));
      await expectNoAxeViolations(container);
      unmount();
      cleanup();
    }
  }
}, 60_000);

it("reader ergonomics, outline and print rules in normal and blotter modes", async () => {
  // Test 3: the reader page has one h1 and a sane outline, labelled landmarks, every image described, zero axe
  // violations, neighbour links that print nothing, and a clean render, in the normal and the altered view.
  const { expectNoAxeViolations } = await import("../axe");
  const { readFileSync } = await import("node:fs");
  const id = LIBRARY[0].id;
  for (const lang of [EN, { locale: "en", trip: true } as Lang]) {
    const where = nameOf(lang);
    const v = await ssr(season("final"), id, undefined, { lang });
    await expectNoAxeViolations(v.doc.body);

    const levels = [...v.doc.querySelectorAll("h1, h2, h3, h4")].map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1).length, `${where}: exactly one h1`).toBe(1);
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1], `${where}: heading ${i} does not skip a level`).toBeLessThanOrEqual(1));

    // every navigation landmark is named, so a screen reader can tell them apart
    for (const nav of v.doc.querySelectorAll("nav")) expect(nav.getAttribute("aria-label") || nav.getAttribute("aria-labelledby"), `${where}: a nav landmark has a name`).toBeTruthy();
    // every page image is described; the flipbook announces the page politely, once
    for (const img of v.doc.querySelectorAll("img")) expect(img.hasAttribute("alt"), `${where}: image has an alt attribute`).toBe(true);
    expect(v.doc.querySelectorAll('[aria-live="polite"]').length, `${where}: one polite announcer`).toBeGreaterThanOrEqual(1);
    clean(v.html, where);
  }

  // on paper only the pages print: the neighbour links and the reader's controls stay on the screen
  const css = readFileSync("components/views/times.module.css", "utf8");
  const print = css.slice(css.indexOf("@media print"));
  expect(print, "a print block exists").toContain("@media print");
  expect(print, "neighbour links are hidden when printing").toMatch(/\.neighbours\s*\{[^}]*display:\s*none/);
}, 60_000);

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
