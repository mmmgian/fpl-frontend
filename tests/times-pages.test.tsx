/** The /times routes, rendered through the real container with a fixed library (so snapshots don't churn as issues are added). */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { englishLeaks, visibleTexts } from "./i18nLeaks";
import { testLanguage } from "./language";
import { LIBRARY, fakeTimes } from "./times-fixtures";

const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/></g, ">\n<").replace(/_R_[0-9a-z]+_/g, "_ID_") + "\n";
const golden = (name: string) => `./golden/${name}.html`;

async function load(library = LIBRARY) {
  vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(library) }));
  const library_ = (await import("@/app/times/page")).default;
  const issue = await import("@/app/times/[issue]/page");
  return { Library: library_, Issue: issue.default, generateMetadata: issue.generateMetadata };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/times"));

describe("/times", () => {
  it("front page: masthead, latest edition, filters, archive", async () => {
    const { Library } = await load();
    await expect(html(await Library({ searchParams: Promise.resolve({}) }))).toMatchFileSnapshot(golden("times-library"));
  });
  it("filtered by type", async () => {
    const { Library } = await load();
    await expect(html(await Library({ searchParams: Promise.resolve({ kind: "plan" }) }))).toMatchFileSnapshot(golden("times-library-plans"));
  });
  it("ignores an unknown type", async () => {
    const { Library } = await load();
    const unknown = html(await Library({ searchParams: Promise.resolve({ kind: "<script>alert(1)</script>" }) }));
    expect(unknown).toBe(html(await Library({ searchParams: Promise.resolve({}) }))); // same as no filter, and nothing echoed back
    expect(unknown).not.toContain("<script>");
  });
  it("offers no type filter when there is only one type to filter by", async () => {
    const { Library } = await load(LIBRARY.filter((i) => i.kind === "times"));
    const out = html(await Library({ searchParams: Promise.resolve({}) }));
    expect(out).not.toContain("Filter by type");
    expect(out).toContain("The archive");                          // the issues themselves are all still there
    vi.resetModules();                                             // a fresh page, with the mixed library behind it
    const mixed = html(await (await load()).Library({ searchParams: Promise.resolve({}) }));
    expect(mixed).toContain("Filter by type");                     // and it comes back as soon as there is a choice
  });
  it("an empty library", async () => {
    const { Library } = await load([]);
    await expect(html(await Library({ searchParams: Promise.resolve({}) }))).toMatchFileSnapshot(golden("times-library-empty"));
  });
});

describe("/times/[issue]", () => {
  const props = (issue: string, p?: string) => ({ params: Promise.resolve({ issue }), searchParams: Promise.resolve(p ? { p } : {}) });

  it("opens an issue at the requested page", async () => {
    const { Issue } = await load();
    await expect(html(await Issue(props("times-gw5", "3")))).toMatchFileSnapshot(golden("times-issue-page-3"));
  });
  it("opens a one-page issue", async () => {
    const { Issue } = await load();
    await expect(html(await Issue(props("one-pager")))).toMatchFileSnapshot(golden("times-issue-single-page"));
  });
  it("clamps a page number that is out of range, and ignores junk", async () => {
    const { Issue } = await load();
    expect(html(await Issue(props("times-gw5", "999")))).toContain('alt="Page 6 of 6"');
    expect(html(await Issue(props("times-gw5", "-4")))).toContain('alt="Page 1 of 6"');
    expect(html(await Issue(props("times-gw5", "<img src=x onerror=alert(1)>")))).toContain('alt="Page 1 of 6"');
  });
  it.each(["nope", "../library", "..%2F..%2Fetc%2Fpasswd", "UPPER", "a/b", "times-gw5/../x", ""])("is not found for %j", async (id) => {
    const { Issue } = await load();
    await expect(Issue(props(id))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("keeps the private material out of search results", async () => {
    const { generateMetadata, Issue } = await load();
    expect(await generateMetadata(props("times-gw5"))).toMatchObject({ title: "The Lobster Times", robots: { index: false, follow: false } });
    expect(await generateMetadata(props("nope"))).toMatchObject({ title: "The Times", robots: { index: false } });
    expect(Issue).toBeTypeOf("function");
  });
  it("the library page is noindex too", async () => {
    const mod = await import("@/app/times/page");
    expect(await mod.generateMetadata()).toMatchObject({ title: "The Times", robots: { index: false, follow: false } });
  });
});

describe("/times in Spanish and French", () => {
  const props = (issue: string, p?: string) => ({ params: Promise.resolve({ issue }), searchParams: Promise.resolve(p ? { p } : {}) });
  /** The library's own words (titles are proper names; this fixture's kickers and summaries have no translations on purpose). */
  const DATA = LIBRARY.flatMap((i) => [i.title, i.kicker, i.summary]).filter((x): x is string => Boolean(x));

  async function inLanguage(locale: "en" | "es" | "fr", run: (m: Awaited<ReturnType<typeof load>>) => Promise<ReactElement>) {
    testLanguage.cookie = locale;
    const m = await load();
    const element = await run(m);
    const { I18nProvider } = await import("@/components/ui/I18nProvider");
    return html(<I18nProvider locale={locale}>{element}</I18nProvider>);
  }

  const cases: [string, (m: Awaited<ReturnType<typeof load>>) => Promise<ReactElement>][] = [
    ["front page", (m) => m.Library({ searchParams: Promise.resolve({}) })],
    ["filtered by type", (m) => m.Library({ searchParams: Promise.resolve({ kind: "plan" }) })],
    ["a type with nothing in it", (m) => m.Library({ searchParams: Promise.resolve({ kind: "recap" }) })],
    ["an issue, including the flipbook reader", (m) => m.Issue(props("times-gw5", "3"))],
    ["a one-page issue", (m) => m.Issue(props("one-pager"))],
  ];

  describe.each(cases)("%s", (_n, run) => {
    it.each(["es", "fr"] as const)("is in %s all the way through", async (locale) => {
      const english = await inLanguage("en", run);
      const translated = await inLanguage(locale, run);
      expect(translated).not.toBe(english);
      expect(englishLeaks(english, translated, locale, { allow: [...DATA, "The Times", "The Lobster Times"] })).toEqual([]);
      const was = new Set(visibleTexts(english));
      expect(visibleTexts(translated).filter((t) => !was.has(t)).length).toBeGreaterThan(3);
    });
  });

  it("empty library", async () => {
    testLanguage.cookie = "fr";
    vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes([]) }));
    const Library = (await import("@/app/times/page")).default;
    const out = html(await Library({ searchParams: Promise.resolve({}) }));
    expect(out).toContain("Rien n&#x27;est encore parti à l&#x27;impression");
    expect(out).not.toContain("Nothing has gone to print");
  });

  it("says in the reader's language that the printed pages are English, and only then", async () => {
    const run = (m: Awaited<ReturnType<typeof load>>) => m.Issue(props("times-gw5"));
    expect(await inLanguage("es", run)).toContain("Las páginas de esta edición están impresas en inglés.");
    expect(await inLanguage("fr", run)).toContain("Les pages de cette édition sont imprimées en anglais.");
    expect(await inLanguage("en", run)).not.toMatch(/printed in English/);
  });

  it("translates the blurb of an issue it has words for, and keeps the title", async () => {
    const real = LIBRARY.map((i) => (i.id === "times-gw5" ? { ...i, id: "lobster-times-gw5" } : i));
    testLanguage.cookie = "es";
    vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(real) }));
    const Library = (await import("@/app/times/page")).default;
    const out = html(await Library({ searchParams: Promise.resolve({}) }));
    expect(out).toContain("Vol. V · Edición 5");
    expect(out).toContain("La gaceta de la liga");
    expect(out).toContain("The Lobster Times"); // the masthead and the title stay as printed
  });

  it("formats dates and sizes in the reader's language", async () => {
    const run = (m: Awaited<ReturnType<typeof load>>) => m.Library({ searchParams: Promise.resolve({ kind: "times" }) });
    const fr = await inLanguage("fr", run);
    expect(fr).toMatch(/\d+ pages/);
    expect(fr).toMatch(/21 sept\.? 2026|16 sept\.? 2026/);
    expect(fr).toContain("Ko");
    const es = await inLanguage("es", run);
    expect(es).toMatch(/sept\.? 2026|set\.? 2026/i);
    // A 3.4 MB PDF: a decimal comma in French, a decimal point in Central American Spanish, "Mo" for French megabytes.
    const reader = (m: Awaited<ReturnType<typeof load>>) => m.Issue(props("times-gw5"));
    expect(await inLanguage("fr", reader)).toContain("3,2 Mo");
    expect(await inLanguage("es", reader)).toContain("3.2 MB");
    expect(await inLanguage("fr", reader)).toContain("Télécharger le PDF (3,2 Mo)");
  });
});
