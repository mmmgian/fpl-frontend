/**
 * Design conformance, part 4: the scales. Font sizes, line-heights, corner radii and spacing come from short lists, so the
 * pages keep one rhythm. This is a RATCHET: each stylesheet's count of off-scale values may never exceed the number recorded
 * below, and when you fix some the test makes you lower the number, so the debt can only shrink. Files that are not listed
 * have no off-scale values and must stay that way.
 *
 * To fix a failure: use a size from FONT_SIZES_PX, a --space-* token (or an even px up to 32), a --radius* token, a unitless
 * line-height of 1 to 1.8 (all in tests/visual/scales.ts). To lower a baseline after fixing, edit the number here.
 */
import { describe, expect, it } from "vitest";
import { GLOBALS, MODULE_FILES, TRIP, parseCss } from "./css";
import { FONT_SIZES_PX, countsFor, offScale, type Kind } from "./scales";

type Debt = Partial<Record<Kind, number>>;

/** Off-scale values still in the stylesheets, by file. Anything not listed is at 0. */
const BASELINE: Record<string, Debt> = {
  "components/ui/Badge.module.css": { spacing: 1 },
  "components/ui/Button.module.css": { spacing: 3 },
  "components/ui/Charts.module.css": { "font-size": 4, spacing: 1 },
  "components/ui/DataTable.module.css": { spacing: 6 },
  "components/ui/FdrChip.module.css": { radius: 1, spacing: 3 },
  "components/ui/Flipbook/Flipbook.module.css": { spacing: 1 },
  "components/ui/Flipbook/PageThumbs.module.css": { spacing: 2 },
  "components/ui/LanguageSwitcher.module.css": { spacing: 3 },
  "components/ui/MiniBars.module.css": { "font-size": 4 },
  "components/ui/SiteHeader.module.css": { spacing: 2 },
  "components/ui/Skeleton.module.css": { spacing: 1 },
  "components/ui/StatList.module.css": { "font-size": 1 },
  "components/ui/StateMessage.module.css": { "font-size": 1 },
  "components/ui/ThemeToggle.module.css": { spacing: 1 },
  "components/views/bonus.module.css": { radius: 1, spacing: 5 },
  "components/views/fixtureFeed.module.css": { spacing: 1 },
  "components/views/fixtures.module.css": { spacing: 5 },
  "components/views/insights.module.css": { spacing: 7 },
  "components/views/interview.module.css": { radius: 2, spacing: 3 },
  "components/views/leagueExtras.module.css": { "font-size": 1, spacing: 3 },
  "components/views/sheet.module.css": { radius: 1, spacing: 3 },
  "components/views/times.module.css": { "font-size": 2, spacing: 4 },
  "components/views/views.module.css": { "font-size": 2, spacing: 2 },
};

const FILES = [GLOBALS, TRIP, ...MODULE_FILES];
const KINDS: Kind[] = ["font-size", "line-height", "radius", "spacing"];
/** The stylesheets of the pages worked on most recently: their baseline is zero and must stay zero. */
const CLEAN = [
  "components/views/tools.module.css",
  "components/views/tools/layout.module.css",
  "components/views/tools/leagueTools.module.css",
  "components/views/tools/planning.module.css",
  "components/ui/DeadlineTimer.module.css",
  "components/ui/LiveRefresh.module.css",
];

describe("the design scales (a ratchet: the debt can only shrink)", () => {
  it.each(FILES)("%s: off-scale font sizes, line-heights, radii and spacing never exceed the recorded baseline, and the baseline is lowered when they drop", (file) => {
    const found = countsFor(file);
    for (const kind of KINDS) {
      const allowed = BASELINE[file]?.[kind] ?? 0;
      const here = found.items.filter((i) => i.kind === kind).map((i) => `${i.file}:${i.line} "${i.selector}" ${i.prop}: ${i.value} (${i.why})`);
      expect(found[kind] <= allowed, `${file} has ${found[kind]} off-scale ${kind} value(s), baseline ${allowed}. Use the scale (see tests/visual/scales.ts):\n  ${here.join("\n  ")}`).toBe(true);
      expect(found[kind] >= allowed, `${file} is down to ${found[kind]} off-scale ${kind} value(s) (baseline ${allowed}): lower its entry in BASELINE to ${found[kind]} so it cannot creep back`).toBe(true);
    }
  });

  it.each(CLEAN)("%s is fully on the scale (baseline 0)", (file) => {
    expect(BASELINE[file], `${file} must not be given a baseline`).toBeUndefined();
    expect(countsFor(file).items.map((i) => `${i.selector} ${i.prop}: ${i.value} (${i.why})`)).toEqual([]);
  });

  it("every baseline entry names a real stylesheet", () => {
    expect(Object.keys(BASELINE).filter((f) => !FILES.includes(f))).toEqual([]);
  });
});

describe("the scale checker itself", () => {
  const found = (css: string) => offScale(parseCss(css, `<sc-${Math.random()}>`)).map((o) => `${o.kind}:${o.value}`);

  it("flags a font size off the list and accepts the list, rem equivalents and clamp()", () => {
    expect(found(".a { font-size: 17px; } .b { font-size: 0.8125rem; } .c { font-size: clamp(26px, 6vw, 40px); } .d { font-size: 1.0625rem; }")).toEqual(["font-size:17px", "font-size:1.0625rem"]);
    expect(FONT_SIZES_PX).toContain(13);
  });
  it("flags a line-height with units or outside 1 to 1.8", () => {
    expect(found(".a { line-height: 24px; } .b { line-height: 2.2; } .c { line-height: 1.45; } .d { line-height: normal; }")).toEqual(["line-height:24px", "line-height:2.2"]);
  });
  it("flags a radius that is neither a token nor on the short list", () => {
    expect(found(".a { border-radius: 14px; } .b { border-radius: var(--radius-in); } .c { border-radius: 50%; } .d { border-radius: 9999px; } .e { border-radius: 8px 3px; }")).toEqual(["radius:14px"]);
  });
  it("flags odd or over-32px-free spacing and accepts tokens, even px, auto and calc()", () => {
    expect(found(".a { padding: 5px 14px; } .b { margin: 0 auto var(--space-3); } .c { gap: 6px 12px; } .d { margin: calc(-1 * var(--space-2)) 0; } .e { padding: 1.1rem; }")).toEqual(["spacing:5px", "spacing:1.1rem"]);
  });
});
