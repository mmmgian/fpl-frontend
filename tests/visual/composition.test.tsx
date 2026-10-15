/**
 * Design conformance, part 5: composition. The real pages (league, team, tools with its streamed slots, bonus, fixtures grid and
 * feed, club, Times library, a past table), rendered from the shared season in the regular and the blotter view, must follow
 * the layout rules in tests/visual/composition.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { RULES, emptyCards, headingJumps, longNowrapRows, overwideTables, primaryHeadings, repeatedParagraphs, unbreakableStrings, unlabelledCards, unsizedImages } from "./composition";
import { PAGE_NAMES, renderPage, type Mode, type RenderedPage } from "./pages";

const MODES: Mode[] = ["normal", "blotter"];
const rendered = new Map<string, RenderedPage>();

beforeAll(async () => {
  for (const name of PAGE_NAMES) for (const mode of MODES) rendered.set(`${name}/${mode}`, await renderPage(name, mode));
}, 120_000);

describe.each(RULES)("%s", (_title, rule) => {
  describe.each(PAGE_NAMES)("on the %s page", (name) => {
    it.each(MODES)("in %s mode", (mode) => {
      const page = rendered.get(`${name}/${mode}`)!;
      expect(rule(page.doc), `${name} (${mode})`).toEqual([]);
    });
  });
});

describe("the rules have something to look at", () => {
  it("the rendered pages hold Cards, tables, images and headings (a harness that renders nothing would pass every rule)", () => {
    const count = (name: string, sel: string) => rendered.get(`${name}/normal`)!.doc.querySelectorAll(sel).length;
    expect(count("tools", "[data-design-card]")).toBeGreaterThan(8);
    expect(count("team", "[data-design-card]")).toBeGreaterThan(8);
    expect(count("tools", "table")).toBeGreaterThan(8);
    expect(count("league", "table")).toBe(1);
    expect(count("tools", "img")).toBeGreaterThan(50);
    for (const name of PAGE_NAMES) expect(count(name, "h1"), name).toBe(1);
    expect(count("history", "tbody tr"), "the past table has rows (not the 'missing' page)").toBeGreaterThan(3);
  });
});

describe("the composition checks themselves", () => {
  const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

  it("finds an untitled Card, an empty Card and an oversized table", () => {
    const d = doc(`<div data-design-card><section class="card"><p>just text</p></section></div><div data-design-card><section class="card"><header><h2>Named</h2></header></section></div><div data-design-card><section class="card" aria-label="x"></section></div>`);
    expect(unlabelledCards(d)).toHaveLength(1);
    expect(emptyCards(d)).toHaveLength(1);
    const cols = (n: number, cls = "") => `<table class="${cls}"><caption>t</caption><thead><tr>${Array.from({ length: n }, () => "<th>c</th>").join("")}</tr></thead></table>`;
    expect(overwideTables(doc(cols(7)))).toHaveLength(1);
    expect(overwideTables(doc(cols(7, "stickyFirst")))).toEqual([]);
    expect(overwideTables(doc(cols(6)))).toEqual([]);
  });

  it("finds a second h1, a skipped heading level and a repeated paragraph", () => {
    expect(primaryHeadings(doc("<h1>a</h1><h1>b</h1>"))).toHaveLength(1);
    expect(headingJumps(doc("<h1>a</h1><h3>b</h3>"))).toHaveLength(1);
    expect(headingJumps(doc("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"))).toEqual([]);
    expect(repeatedParagraphs(doc("<p>same</p><p>same</p><p>other</p>"))).toHaveLength(1);
  });

  it("finds a 60-character word that nothing lets break, and an image with no size", () => {
    const long = "x".repeat(60);
    expect(unbreakableStrings(doc(`<p>${long}</p>`))).toHaveLength(1);
    expect(unbreakableStrings(doc(`<p class="teamLink">${long}</p>`))).toEqual([]); // .teamLink sets overflow-wrap: anywhere
    expect(unsizedImages(doc(`<img src="/a.png">`))).toHaveLength(1);
    expect(unsizedImages(doc(`<img src="/a.png" width="10" height="10">`))).toEqual([]);
  });

  it("finds five chips in a row that will not wrap", () => {
    expect(longNowrapRows(doc(`<div class="groupTag"><i></i><i></i><i></i><i></i><i></i></div>`))).toHaveLength(1);
    expect(longNowrapRows(doc(`<div class="run"><i></i><i></i><i></i><i></i><i></i></div>`))).toEqual([]);
  });
});
