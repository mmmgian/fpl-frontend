/**
 * Composition rules over rendered markup (a parsed Document): the things that make a page look wrong even when every number
 * is right. Each rule returns plain-English problems; an empty list is a pass.
 */
import { MODULE_FILES, compounds, declOf, readRules, stripState, type CssRule } from "./css";
import { PHONE, nowrapContainers } from "./overflow";

const ALL = MODULE_FILES.flatMap(readRules);
const classRules = new Map<string, CssRule[]>();
for (const r of ALL) {
  const last = compounds(r.selector).at(-1) ?? "";
  for (const m of stripState(last).matchAll(/\.([\w-]+)/g)) (classRules.get(m[1]) ?? classRules.set(m[1], []).get(m[1])!).push(r);
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const where = (el: Element) => `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).join(".")}` : ""}>`;
const rulesOf = (el: Element) => [...el.classList].flatMap((c) => classRules.get(c) ?? []);

/** A Card (wrapped by the test harness in `<div data-design-card>`) names itself with a heading or an aria label. */
export function unlabelledCards(doc: Document): string[] {
  return [...doc.querySelectorAll("[data-design-card] > *")]
    .filter((card) => !card.querySelector("h1, h2, h3, h4, h5, h6") && !card.getAttribute("aria-label") && !card.getAttribute("aria-labelledby"))
    .map((c) => `a Card with no title and no aria-label: ${where(c)} "${norm(c.textContent).slice(0, 60)}"`);
}

/** A Card with nothing in it: no text and no table rows (it would render as an empty glass box). */
export function emptyCards(doc: Document): string[] {
  return [...doc.querySelectorAll("[data-design-card] > *")]
    .filter((card) => norm(card.textContent) === "" && !card.querySelector("tbody tr, img, svg"))
    .map((c) => `an empty Card: ${where(c)}`);
}

/** More than 6 columns on a 320px screen need the first column pinned while the rest scrolls (stickyFirst), or columns that drop away (hide-sm / hide-md). */
export function overwideTables(doc: Document): string[] {
  const out: string[] = [];
  doc.querySelectorAll("table").forEach((t) => {
    const heads = [...t.querySelectorAll("thead tr:first-child > th, thead tr:first-child > td")];
    const visible = heads.filter((h) => !h.classList.contains("hide-sm") && !h.classList.contains("hide-md")).length;
    const caption = norm(t.querySelector("caption")?.textContent) || where(t);
    if (visible > 6 && !t.classList.contains("stickyFirst")) out.push(`table "${caption}" shows ${visible} columns on a phone with no hide-sm columns and no stickyFirst`);
  });
  return out;
}

export function primaryHeadings(doc: Document): string[] {
  const h1 = [...doc.querySelectorAll("h1")];
  return h1.length === 1 ? [] : [`${h1.length} <h1> elements (${h1.map((h) => `"${norm(h.textContent)}"`).join(", ")}), expected exactly 1`];
}

/** Heading levels in document order never skip a level on the way down (h2 straight to h4), and start at h1. */
export function headingJumps(doc: Document): string[] {
  const out: string[] = [];
  let prev = 0;
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const level = Number(h.tagName[1]);
    if (level > prev + 1) out.push(`"${norm(h.textContent).slice(0, 50)}" is an h${level} straight after ${prev === 0 ? "nothing" : `an h${prev}`}`);
    prev = level;
  });
  return out;
}

/** The same paragraph twice in a row reads as a rendering bug. */
export function repeatedParagraphs(doc: Document): string[] {
  const ps = [...doc.querySelectorAll("p")].map((p) => ({ p, text: norm(p.textContent) })).filter((x) => x.text.length > 0);
  const out: string[] = [];
  for (let i = 1; i < ps.length; i++) if (ps[i].text === ps[i - 1].text) out.push(`two paragraphs in a row say "${ps[i].text.slice(0, 60)}"`);
  return out;
}

const BREAKS = (el: Element): boolean =>
  rulesOf(el).some((r) => {
    const wrap = declOf(r, "overflow-wrap")?.value ?? declOf(r, "word-wrap")?.value;
    const word = declOf(r, "word-break")?.value;
    const ox = declOf(r, "overflow")?.value ?? declOf(r, "overflow-x")?.value;
    return wrap === "anywhere" || wrap === "break-word" || word === "break-all" || word === "break-word" || (declOf(r, "text-overflow")?.value === "ellipsis" && ox === "hidden");
  });

/** A word over 40 characters pushes its box wider than a phone, unless it (or an ancestor) is allowed to break or ellipsise. */
export function unbreakableStrings(doc: Document): string[] {
  const out: string[] = [];
  const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement!;
    if (el.closest("script, style, svg, [hidden]")) continue;
    for (const word of (n.textContent ?? "").split(/\s+/)) {
      if (word.length <= 40) continue;
      let cur: Element | null = el;
      let ok = false;
      for (; cur && !ok; cur = cur.parentElement) ok = BREAKS(cur);
      if (!ok) out.push(`"${word.slice(0, 50)}…" (${word.length} characters, no spaces) in ${where(el)} with no overflow-wrap`);
    }
  }
  return out;
}

/** An <img> reserves its space (width and height attributes, or a class/wrapper with a size or aspect-ratio), so the page does not jump as it loads. */
export function unsizedImages(doc: Document): string[] {
  const inline = (el: Element) => /aspect-ratio|\bwidth:[^;]+;[^]*\bheight:/.test(el.getAttribute("style") ?? "");
  const sized = (el: Element) => inline(el) || rulesOf(el).some((r) => declOf(r, "aspect-ratio") || (declOf(r, "width") && declOf(r, "height")));
  return [...doc.querySelectorAll("img")]
    .filter((img) => {
      if (Number(img.getAttribute("width")) > 0 && Number(img.getAttribute("height")) > 0) return false;
      for (let el: Element | null = img; el && el !== doc.body; el = el.parentElement) if (sized(el)) return false;
      return true;
    })
    .map((img) => `<img src="${img.getAttribute("src")}"> has no width/height and no sized wrapper (it shifts the layout when it loads)`);
}

/** On a 320px phone a row that refuses to wrap holds at most 4 items (a run of five chips cannot fit in a table cell). */
export function longNowrapRows(doc: Document, width = PHONE): string[] {
  const classes = new Set(nowrapContainers(ALL, width).flatMap((r) => [...(compounds(r.selector).at(-1) ?? "").matchAll(/\.([\w-]+)/g)].map((m) => m[1])));
  const out: string[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    if (![...el.classList].some((c) => classes.has(c))) return;
    if (el.children.length > 4) out.push(`${where(el)} keeps ${el.children.length} items on one line at ${width}px`);
  });
  return out;
}

export const RULES: [name: string, rule: (doc: Document) => string[]][] = [
  ["every Card has a title or an aria-label", unlabelledCards],
  ["no Card is empty", emptyCards],
  ["no table shows more than 6 columns on a phone without a fallback", overwideTables],
  ["the page has exactly one primary heading", primaryHeadings],
  ["headings never skip a level", headingJumps],
  ["no paragraph is repeated straight after itself", repeatedParagraphs],
  ["no unbroken string over 40 characters can push a box wider than the phone", unbreakableStrings],
  ["every image reserves its size", unsizedImages],
  ["no row that refuses to wrap holds more than 4 items on a phone", longNowrapRows],
];
