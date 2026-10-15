/**
 * Design conformance, part 3: nothing forces a 320px phone to scroll sideways. Read from the stylesheets: no fixed size or
 * grid track wider than a card's content box applies on a phone, and a row that refuses to wrap has to be a short one or must
 * catch its own overflow.
 */
import { describe, expect, it } from "vitest";
import { GLOBALS, MODULE_FILES, parseCss, readRules } from "./css";
import { SHORT_ROWS, allRules, describeFinding, fixedSizes, justified, nowrapContainers, wideTracks } from "./overflow";

const FILES = [GLOBALS, ...MODULE_FILES];

describe("nothing forces a 320px phone to scroll sideways", () => {
  it.each(FILES)("%s: no fixed width, min-width or flex-basis is wider than a card on a phone", (file) => {
    expect(fixedSizes(readRules(file)).map(describeFinding)).toEqual([]);
  });

  it.each(FILES)("%s: no grid has columns that cannot shrink to one column on a phone", (file) => {
    expect(wideTracks(readRules(file)).map(describeFinding)).toEqual([]);
  });

  it.each(FILES)("%s: a row that will not wrap is a short one, or clips or scrolls its own overflow", (file) => {
    const bad = nowrapContainers(readRules(file)).filter((r) => !justified(r));
    expect(
      bad.map((r) => `${r.file}:${r.line} "${r.selector}" keeps its items on one line at 320px with nothing to catch the overflow. Let it wrap below 640px (put nowrap in @media (min-width: 640px)), add overflow-x: auto, or list it in SHORT_ROWS (tests/visual/overflow.ts) with a reason`),
    ).toEqual([]);
  });

  it("the gameweek run in the fixture-swings tables wraps on a phone and stays on one line from 640px", () => {
    const rules = readRules("components/views/tools/planning.module.css").filter((r) => r.selector === ".run");
    const wrapAt = (w: number) => {
      let wrap = "nowrap";
      for (const r of rules) if (r.context.every((c) => !c.startsWith("@media") || /min-width: 640px/.test(c) === (w >= 640))) wrap = r.decls.find((d) => d.prop === "flex-wrap")?.value ?? wrap;
      return wrap;
    };
    expect(wrapAt(320)).toBe("wrap");
    expect(wrapAt(1000)).toBe("nowrap");
    expect(nowrapContainers(rules, 320)).toEqual([]);
    expect(nowrapContainers(rules, 1000)).toHaveLength(1);
  });

  it("every documented short row still exists (the list cannot rot)", () => {
    const rules = allRules(FILES);
    for (const s of SHORT_ROWS) expect(rules.some((r) => r.file === s.file && s.selector.test(r.selector)), `${s.file} ${s.selector} (${s.reason})`).toBe(true);
  });
});

describe("the overflow checks themselves", () => {
  const rules = (css: string) => parseCss(css, `<ov-${Math.random()}>`);

  it("flags a fixed 400px width on a base rule, and not one that only applies from 768px", () => {
    expect(fixedSizes(rules(".a { width: 400px; }"))).toHaveLength(1);
    expect(fixedSizes(rules(".a { min-width: 20rem; }"))).toHaveLength(1);
    expect(fixedSizes(rules("@media (min-width: 768px) { .a { width: 400px; } }"))).toEqual([]);
    expect(fixedSizes(rules(".a { width: min(100%, 400px); max-width: 400px; width: 19px; }"))).toEqual([]);
  });

  it("flags a grid of wide auto-fit columns unless they are wrapped in min(100%, …)", () => {
    expect(wideTracks(rules(".g { grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); }"))).toHaveLength(1);
    expect(wideTracks(rules(".g { grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }"))).toEqual([]);
    expect(wideTracks(rules(".g { grid-template-columns: 10rem 10rem minmax(0, 1fr); }"))).toHaveLength(1);
  });

  it("flags a flex row that will not wrap, and accepts one that scrolls or ellipsises", () => {
    expect(nowrapContainers(rules(".r { display: flex; flex-wrap: nowrap; min-width: 0; }"))).toHaveLength(1);
    expect(nowrapContainers(rules(".r { display: inline-flex; white-space: nowrap; }"))).toHaveLength(1);
    expect(nowrapContainers(rules(".r { display: flex; flex-wrap: nowrap; overflow-x: auto; }"))).toEqual([]);
    expect(nowrapContainers(rules(".t { white-space: nowrap; }"))).toEqual([]); // plain text, not a row of items
    expect(nowrapContainers(rules("@media (min-width: 640px) { .r { display: flex; flex-wrap: nowrap; } }"))).toEqual([]);
  });
});
