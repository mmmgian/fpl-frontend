/**
 * Design conformance, part 2: the design tokens.
 *
 * Token discipline: component CSS gets its colours from var(--token), so the dark, night-reader and blotter themes can repaint
 * it. A literal colour in a text, background or border is a colour that ignores the theme. Neutral shadows and scrims
 * (black or white with an alpha, inside a shadow, filter or gradient overlay) are allowed; the blotter view's own fixed
 * palette (anything scoped to :root[data-trip="on"], and app/trip.css) is allowed; everything else needs an entry in ALLOW
 * with a reason.
 *
 * Token existence: every var(--x) a stylesheet uses must be defined (in globals.css, trip.css, the same file, or set from a
 * component's inline style), and the public token names cannot be removed or renamed without this test saying so.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tryColor } from "../colour";
import { GLOBALS, LOOKS, MODULE_FILES, ROOT, TRIP, parseCss, readRules, type CssRule } from "./css";
import { glob } from "./files";

// ------------------------------------------------------------------------------------------------ literal colours

/** Properties whose value is (or may contain) a colour. */
const COLOUR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?|box-shadow|text-shadow|filter|-webkit-text-stroke(-color)?|--[\w-]+)$/;
/** Where a neutral black/white alpha is a shadow or a scrim, not a surface. */
const SHADOW_PROPS = /^(box-shadow|text-shadow|filter)$/;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)|(?<![-\w])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|magenta|silver|gold)\b(?![-\w(])/g;

export interface Literal {
  file: string;
  selector: string;
  line: number;
  prop: string;
  literal: string;
}

const isNeutral = (literal: string) => {
  const c = tryColor(literal);
  return !!c && ((c[0] === 0 && c[1] === 0 && c[2] === 0) || (c[0] === 255 && c[1] === 255 && c[2] === 255));
};

/** Literal colours in a rule that are not neutral shadow/scrim alphas. */
export function literalsIn(rule: CssRule): Literal[] {
  const out: Literal[] = [];
  for (const d of rule.decls) {
    if (!COLOUR_PROPS.test(d.prop)) continue;
    const gradient = /gradient\(/.test(d.value);
    for (const m of d.value.matchAll(LITERAL)) {
      if (isNeutral(m[0]) && (SHADOW_PROPS.test(d.prop) || gradient)) continue;
      out.push({ file: rule.file, selector: rule.selector, line: rule.line, prop: d.prop, literal: m[0] });
    }
  }
  return out;
}

/** Justified literals. `selector` narrows an entry to the rules it names; without it the entry covers the whole file. */
export const ALLOW: { file: string; selector?: RegExp; reason: string }[] = [
  { file: "components/views/tools.module.css", selector: /^\.pitch$/, reason: "the pitch is the one place green is part of the picture (grass), in every theme" },
  { file: "components/ui/SiteHeader.module.css", selector: /^\.logo$/, reason: "the logo is a fixed brand image on its own cream plate, not a themed surface" },
  { file: "components/views/interview.module.css", selector: /^\.caption$/, reason: "the caption pill sits on a photograph, so it brings its own black scrim and white text (21:1) in every theme" },
  { file: "components/views/interview.module.css", selector: /^\.(reply|ask)\[/, reason: "each press-conference personality has a fixed identity colour; it is only mixed into --surface-solid as a tint or border, never used as text" },
  { file: "components/ui/MiniBars.module.css", selector: /^\d+%$/, reason: "bars-hue is a keyframe animation that only blotter-scoped rules in this file refer to" },
  { file: "components/views/leagueExtras.module.css", selector: /^(\.dare\b.*|\.visionGlyph|\d+%)$/, reason: "dares and vision glyphs are rendered only in the blotter view (ManagerStatsPanel, trip), which paints a fixed neon palette" },
];

const blotterScoped = (l: Literal) => l.file === TRIP || /\[data-trip=["']on["']\]/.test(l.selector);
const allowed = (l: Literal) => blotterScoped(l) || ALLOW.some((a) => a.file === l.file && (!a.selector || a.selector.test(l.selector)));

const SOURCES = [GLOBALS, TRIP, ...MODULE_FILES];

describe("component colours come from design tokens", () => {
  it("no stylesheet paints text, backgrounds, borders or fills with a literal colour, except the documented allowances", () => {
    const bad = SOURCES.flatMap((f) => readRules(f).flatMap(literalsIn)).filter((l) => l.file !== GLOBALS).filter((l) => !allowed(l));
    const lines = bad.map((l) => `${l.file}:${l.line} "${l.selector}" ${l.prop}: ${l.literal}`);
    expect(lines, "literal colours ignore the theme. Use var(--token) (add one to globals.css, trip.css and the print blocks if none fits), or justify it in ALLOW in tests/visual/tokens.test.ts").toEqual([]);
  });

  it("every documented allowance still matches something (the list cannot rot)", () => {
    for (const a of ALLOW) {
      const hits = readRules(a.file).flatMap(literalsIn).filter((l) => !a.selector || a.selector.test(l.selector));
      expect(hits.length, `${a.file} ${a.selector ?? ""} (${a.reason}) matches no literal colour any more: remove it`).toBeGreaterThan(0);
    }
  });

  it("the literal-colour finder sees a stray #ff00ff text colour but not a black shadow", () => {
    const rules = parseCss(".a { color: #ff00ff; box-shadow: 0 1px 2px rgba(0,0,0,.2); } .b { background: rgb(1 2 3); } .c { background: linear-gradient(rgba(0,0,0,.1), transparent); }", "<lit>");
    expect(rules.flatMap(literalsIn).map((l) => `${l.selector} ${l.prop} ${l.literal}`)).toEqual([".a color #ff00ff", ".b background rgb(1 2 3)"]);
  });

  it("the palette itself defines the same colour tokens in every theme and the blotter view", () => {
    const names = (name: string) => Object.keys(LOOKS.find((l) => l.name === name)!.palette).sort();
    for (const l of LOOKS) expect(names(l.name), l.name).toEqual(names("light"));
  });
});

// ------------------------------------------------------------------------------------------------ token existence

/** The tokens component CSS is allowed to rely on. Removing or renaming one is a design-system change: edit this list on purpose. */
export const PUBLIC_TOKENS = [
  "--font-sans", "--font-mono",
  "--bg", "--surface", "--surface-head", "--surface-solid", "--surface-2",
  "--text", "--text-muted", "--border", "--border-strong", "--wash", "--hover-wash",
  "--accent", "--on-accent", "--accent-2", "--positive", "--negative", "--warning", "--focus",
  "--dot", "--dot-size", "--dot-gap", "--shadow", "--glass-blur", "--frost",
  "--fdr-1-bg", "--fdr-1-fg", "--fdr-1-bd", "--fdr-2-bg", "--fdr-2-fg", "--fdr-2-bd", "--fdr-3-bg", "--fdr-3-fg", "--fdr-3-bd",
  "--fdr-4-bg", "--fdr-4-fg", "--fdr-4-bd", "--fdr-5-bg", "--fdr-5-fg", "--fdr-5-bd",
  "--zone-good", "--zone-warn", "--zone-bad", "--zone-strength",
  "--radius", "--radius-lg", "--radius-in", "--radius-pill",
  "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6",
  "--content-max", "--header-h",
];

const sources = glob(["app", "components", "lib"], /\.(tsx?|ts)$/).map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");

/** var(--x) uses with no fallback whose token is defined nowhere (globals, trip, the same file, or a component's inline style). */
export function undefinedVars(rules: CssRule[], defined: Set<string>): string[] {
  const local = new Set(rules.flatMap((r) => r.decls.filter((d) => d.prop.startsWith("--")).map((d) => d.prop)));
  const problems: string[] = [];
  for (const r of rules) {
    for (const d of r.decls) {
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        const name = m[1];
        if (m[2] || defined.has(name) || local.has(name)) continue; // a fallback always resolves
        if (sources.includes(`"${name}"`) || sources.includes(`'${name}'`)) continue; // set from a component's inline style
        problems.push(`${r.file}:${r.line} "${r.selector}" ${d.prop} uses ${name}, which nothing defines (the declaration is dropped, so the property silently falls back)`);
      }
    }
  }
  return problems;
}

describe("design tokens exist", () => {
  it("every public token is still defined in the regular theme (globals.css :root)", () => {
    const root = LOOKS.find((l) => l.name === "light")!.palette;
    expect(PUBLIC_TOKENS.filter((t) => !(t in root))).toEqual([]);
  });

  it("every colour token is defined by every theme and by the blotter view, not just the regular one", () => {
    const layout = /^--(font|radius|space|content|dot-gap|dot-size|header|glass|frost)/;
    for (const l of LOOKS) {
      const missing = PUBLIC_TOKENS.filter((t) => !layout.test(t) && !(t in l.palette));
      expect(missing, l.name).toEqual([]);
    }
  });

  it("every var(--token) in a stylesheet points at a token that is defined", () => {
    const defined = new Set<string>(); // only what a stylesheet really defines, not the PUBLIC_TOKENS list
    for (const l of LOOKS) for (const k of Object.keys(l.palette)) defined.add(k);
    expect(SOURCES.flatMap((f) => undefinedVars(readRules(f), defined))).toEqual([]);
  });

  it("the checker notices a token that has been removed (a border on a token nothing defines)", () => {
    const rules = parseCss(".a { border: 1px solid var(--border-subtle); } .b { border: 1px solid var(--border-subtle, red); } .c { --mine: 1px; width: var(--mine); }", "<tok>");
    const found = undefinedVars(rules, new Set(["--border"]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("--border-subtle");
  });
});
