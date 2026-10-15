/**
 * Design conformance, part 1: contrast of the colours the stylesheets declare (not just the palette's token pairs, which
 * tests/theme.test.tsx already proves). Every `color` in every CSS module, globals.css and trip.css is read, resolved against each
 * look's palette, laid over the background the CSS puts behind it, and measured.
 */
import { describe, expect, it } from "vitest";
import { over, ratio } from "../colour";
import { contrastFailures, describeFailure, scanned } from "./contrast";
import { LOOKS, MODULE_FILES, GLOBALS, TRIP, NO_RULE, colourOf, parseCss, readRules } from "./css";

const FILES = [GLOBALS, TRIP, ...MODULE_FILES];

describe("text colours declared in the stylesheets read in every theme", () => {
  it.each(FILES)("%s: text is at least 4.5:1 (3:1 when large) on its background in light, night, dark and the blotter view", (file) => {
    expect(contrastFailures([file]).map(describeFailure)).toEqual([]);
  });

  it("the checker really measures the stylesheets (hundreds of colour pairs, not a silent skip)", () => {
    scanned.measured = 0;
    contrastFailures(FILES);
    expect(scanned.measured).toBeGreaterThan(400);
  });

  it("text on the accent badge (the first set-piece taker's number) reads in every theme", () => {
    const rule = readRules("components/views/tools/planning.module.css").find((r) => r.selector === '.taker[data-order="1"] .orderBadge')!;
    expect(rule, "the badge rule exists").toBeDefined();
    const all = contrastFailures(["components/views/tools/planning.module.css"]).filter((f) => f.selector.includes("orderBadge"));
    expect(all.map(describeFailure)).toEqual([]);
  });

  it("--on-accent (text on an accent fill) is at least 4.5:1 on --accent in every look", () => {
    for (const look of LOOKS) {
      const p = look.palette;
      expect(p["--on-accent"], `${look.name}: --on-accent is defined`).toBeDefined();
      const on = colourOf(p["--on-accent"], NO_RULE, look)!;
      const accent = colourOf(p["--accent"], NO_RULE, look)!;
      expect(ratio(over(on, accent), accent), `${look.name}: ${p["--on-accent"]} on ${p["--accent"]}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the contrast checker itself", () => {
  const check = (css: string) => {
    const file = `<inline-${Math.random()}>`;
    parseCss(css, file);
    return contrastFailures([file]);
  };
  const dark = LOOKS.find((l) => l.name === "dark")!;
  const light = LOOKS.find((l) => l.name === "light")!;

  it("fails white text on a pale accent fill (what the dark theme does to #fff on --accent)", () => {
    const f = check(".b { background: var(--accent); color: #fff; }");
    expect(f.map((x) => x.look)).toEqual(expect.arrayContaining(["dark", "night"]));
    expect(f.find((x) => x.look === "dark")!.ratio).toBeLessThan(3);
    expect(f.some((x) => x.look === "light")).toBe(false);
  });

  it("judges a hover rule on the background of its base rule", () => {
    const f = check(".b { background: #ffffff; color: #000000; } .b:hover { color: #eeeeee; }");
    expect(f.map((x) => x.selector)).toContain(".b:hover");
  });

  it("composites translucent text and translucent backgrounds over the page before measuring", () => {
    expect(check(".t { color: rgba(0, 0, 0, 0.2); }").length).toBeGreaterThan(0);
    expect(check(".t { color: var(--text); background: color-mix(in srgb, var(--accent) 6%, var(--surface-solid)); }")).toEqual([]);
  });

  it("relaxes to 3:1 for large bold text only", () => {
    const grey = "color: #8a8a8a; background: #ffffff;"; // 3.4:1
    expect(check(`.x { ${grey} font-size: 14px; }`).length).toBeGreaterThan(0);
    expect(check(`.x { ${grey} font-size: 20px; font-weight: 800; }`)).toEqual([]);
  });

  it("skips what it cannot resolve instead of guessing", () => {
    expect(check(".x { color: var(--nope); }")).toEqual([]);
    expect(check(".x { color: #fff; background: linear-gradient(red, blue); }")).toEqual([]);
    expect(check(".x { color: currentColor; }")).toEqual([]);
  });

  it("reads hex, rgb, hsl and color-mix", () => {
    const c = (v: string, look = light) => colourOf(v, NO_RULE, look)!;
    expect(c("#fff")).toEqual([255, 255, 255, 1]);
    expect(c("rgb(10 20 30 / 50%)")).toEqual([10, 20, 30, 0.5]);
    expect(c("hsl(0 100% 50%)")).toEqual([255, 0, 0, 1]);
    expect(c("color-mix(in srgb, #000 62%, transparent)")[3]).toBeCloseTo(0.62);
    expect(c("color-mix(in srgb, #ffffff 50%, #000000)").slice(0, 3)).toEqual([127.5, 127.5, 127.5]);
    expect(c("var(--accent)", dark)).toEqual([255, 122, 209, 1]);
  });
});
