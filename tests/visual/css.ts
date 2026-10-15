/**
 * A reader for the real stylesheets, shared by the design-conformance suite (tests/visual/*).
 *
 * It parses every CSS module (components/**\/*.module.css, app/layout.module.css) plus app/globals.css and app/trip.css with
 * postcss into flat rules: one entry per selector, with the at-rules it sits in and its declarations. On top of that it
 * resolves `var(--token)` against each theme's palette, evaluates media queries at a given viewport width, and builds the
 * four looks the site has (regular, night reader, dark and the blotter view over each) so a test can ask "what colour is
 * this rule in the night theme?" and get a number, or `null` when it cannot know (never a guess).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import postcss, { type Container, type Declaration, type Document, type Root, type Rule } from "postcss";
import { splitTop, tryColor, type RGBA } from "../colour";

export const ROOT = join(__dirname, "..", "..");

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return walk(path, keep);
    return keep(name) ? [path] : [];
  });
}

/** Every CSS module, relative to the project root (components/** and app/**). */
export const MODULE_FILES: string[] = [...walk("app", (n) => n.endsWith(".module.css")), ...walk("components", (n) => n.endsWith(".module.css"))].sort();
export const GLOBALS = "app/globals.css";
export const TRIP = "app/trip.css";

export interface Decl {
  prop: string;
  value: string;
  important: boolean;
}

export interface CssRule {
  file: string;
  /** One selector of the rule's list, whitespace-normalised. */
  selector: string;
  /** The rule's whole selector list, as written. */
  list: string;
  /** Enclosing at-rules, outermost first, like `@media (min-width: 640px)`. */
  context: string[];
  /** True when inside @keyframes (a step such as `to` or `50%`, not a selector). */
  keyframes: boolean;
  decls: Decl[];
  line: number;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const cache = new Map<string, CssRule[]>();

export function parseCss(source: string, file = "<inline>"): CssRule[] {
  const root: Root = postcss.parse(source, { from: file });
  const out: CssRule[] = [];
  root.walkRules((rule: Rule) => {
    const context: string[] = [];
    let keyframes = false;
    for (let p: Container | Document | undefined = rule.parent; p && p.type !== "root" && p.type !== "document"; p = p.parent) {
      if (p.type === "atrule") {
        const at = p as unknown as { name: string; params: string };
        if (/keyframes$/.test(at.name)) keyframes = true;
        context.unshift(norm(`@${at.name} ${at.params}`));
      }
    }
    const decls: Decl[] = [];
    rule.each((n) => {
      if (n.type === "decl") decls.push({ prop: (n as Declaration).prop.toLowerCase(), value: norm((n as Declaration).value), important: (n as Declaration).important === true });
    });
    for (const selector of rule.selectors) out.push({ file, selector: norm(selector), list: norm(rule.selector), context, keyframes, decls, line: rule.source?.start?.line ?? 0 });
  });
  if (file.startsWith("<")) cache.set(file, out); // inline sources (used to test the checkers themselves) are looked up by name
  return out;
}

export function readRules(file: string): CssRule[] {
  let r = cache.get(file);
  if (!r) cache.set(file, (r = parseCss(readFileSync(join(ROOT, file), "utf8"), file)));
  return r;
}

export const rel = (path: string) => relative(ROOT, path);

/** The last declaration of `prop` in the rule (the one that wins), or undefined. */
export const declOf = (rule: Pick<CssRule, "decls">, prop: string): Decl | undefined => [...rule.decls].reverse().find((d) => d.prop === prop);

// ------------------------------------------------------------------------------------------------ media queries

const toPx = (n: string, unit: string) => parseFloat(n) * (unit === "px" ? 1 : 16);

/** Does one media query list match a phone/desktop of this width (portrait, touch, no special preferences)? */
export function mediaMatches(params: string, width: number): boolean {
  return splitTop(params).some((alt) => {
    let q = alt.trim().toLowerCase();
    let negate = false;
    if (q.startsWith("not ")) {
      negate = true;
      q = q.slice(4);
    }
    q = q.replace(/^only\s+/, "");
    let ok = !/\bprint\b/.test(q.replace(/\([^)]*\)/g, ""));
    for (const [, feature] of q.matchAll(/\(([^)]+)\)/g)) {
      const f = feature.trim();
      let m: RegExpMatchArray | null;
      if ((m = f.match(/^min-width:\s*(-?[\d.]+)(px|rem|em)$/))) ok &&= width >= toPx(m[1], m[2]);
      else if ((m = f.match(/^max-width:\s*(-?[\d.]+)(px|rem|em)$/))) ok &&= width <= toPx(m[1], m[2]);
      else if ((m = f.match(/^width\s*(>=|<=|>|<)\s*(-?[\d.]+)(px|rem|em)$/))) {
        const v = toPx(m[2], m[3]);
        ok &&= m[1] === ">=" ? width >= v : m[1] === "<=" ? width <= v : m[1] === ">" ? width > v : width < v;
      } else if (/^(any-)?hover:\s*hover$/.test(f) || /^(any-)?pointer:\s*fine$/.test(f)) ok = false; // a phone has no hover and a coarse pointer
      else if (/^orientation:\s*landscape$/.test(f)) ok = false;
      else if (/^forced-colors:\s*active$|^prefers-contrast:\s*more$|^prefers-reduced-transparency:\s*reduce$/.test(f)) ok = false;
    }
    return negate ? !ok : ok;
  });
}

/** Does the rule apply on a screen this wide, in a normal (not print, not forced-colours) setting? */
export function appliesAtWidth(rule: Pick<CssRule, "context">, width: number): boolean {
  return rule.context.every((c) => (c.startsWith("@media ") ? mediaMatches(c.slice(7), width) : true));
}

// ------------------------------------------------------------------------------------------------ the looks

export type Theme = "light" | "night" | "dark";
export interface Look {
  /** "light", "night", "dark", "light + blotter", … */
  name: string;
  theme: Theme;
  blotter: boolean;
  palette: Record<string, string>;
}

const tokensOf = (file: string, test: (r: CssRule) => boolean): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const r of readRules(file)) if (r.context.length === 0 && test(r)) for (const d of r.decls) if (d.prop.startsWith("--")) out[d.prop] = d.value;
  return out;
};

const base = tokensOf(GLOBALS, (r) => r.selector === ":root");
const themed: Record<Theme, Record<string, string>> = {
  light: {},
  night: tokensOf(GLOBALS, (r) => r.selector === ':root[data-theme="night"]'),
  dark: tokensOf(GLOBALS, (r) => r.selector === ':root[data-theme="dark"]'),
};
const blotter = tokensOf(TRIP, (r) => r.selector === ':root[data-trip="on"]' || r.selector === ':root[data-trip="on"][data-theme]');

export const THEME_NAMES: Theme[] = ["light", "night", "dark"];
export const LOOKS: Look[] = THEME_NAMES.flatMap((theme) => [
  { name: theme, theme, blotter: false, palette: { ...base, ...themed[theme] } },
  { name: `${theme} + blotter`, theme, blotter: true, palette: { ...base, ...themed[theme], ...blotter } },
]);

/** The looks a selector can be seen in: `[data-trip="on"]` means blotter only, `[data-theme="x"]` that theme only. */
export function looksFor(selector: string): Look[] {
  const trip = /\[data-trip=["']on["']\]/.test(selector);
  const theme = selector.match(/\[data-theme=["'](light|night|dark)["']\]/)?.[1];
  return LOOKS.filter((l) => (!trip || l.blotter) && (!theme || l.theme === theme));
}

/** True for rules that only apply in a setting the colour checks leave out (print, forced colours, more contrast, a system dark preference with no [data-theme]). */
export function outsideLooks(rule: CssRule): boolean {
  return rule.context.some((c) => /print|forced-colors|prefers-contrast|prefers-reduced-transparency/.test(c)) || /:not\(\[data-theme\]\)/.test(rule.selector);
}

// ------------------------------------------------------------------------------------------------ values

/** Every module's custom properties: name -> distinct values, for locally defined helpers like `--ink` or `--green`. */
function localVars(file: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of readRules(file)) for (const d of r.decls) if (d.prop.startsWith("--")) (m.get(d.prop) ?? m.set(d.prop, new Set()).get(d.prop)!).add(d.value);
  return m;
}
const localCache = new Map<string, Map<string, Set<string>>>();
/** A stand-in rule for resolving a bare value (a token, a literal) against a look's palette. */
export const NO_RULE = { file: "", decls: [] } as unknown as CssRule;
const locals = (file: string) => {
  if (!file) return new Map<string, Set<string>>();
  let l = localCache.get(file);
  if (!l) localCache.set(file, (l = localVars(file)));
  return l;
};

/**
 * Replaces every `var(--x[, fallback])` in a value: the rule's own custom properties first, then the look's palette, then a
 * custom property the same file defines exactly once, then the fallback. `null` when any reference cannot be resolved.
 */
export function resolveVars(value: string, rule: Pick<CssRule, "file" | "decls">, look: Look, depth = 0): string | null {
  if (depth > 10) return null;
  let failed = false;
  const out = replaceVars(value, (name, fallback) => {
    const own = declOf(rule, name)?.value;
    const sameFile = locals(rule.file).get(name);
    const raw = own ?? look.palette[name] ?? (sameFile && sameFile.size === 1 ? [...sameFile][0] : undefined) ?? fallback;
    if (raw === undefined) return (failed = true), "";
    const inner = resolveVars(raw, rule, look, depth + 1);
    if (inner === null) return (failed = true), "";
    return inner;
  });
  return failed ? null : out;
}

function replaceVars(value: string, fn: (name: string, fallback: string | undefined) => string): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("var(", i);
    if (at < 0) return out + value.slice(i);
    out += value.slice(i, at);
    let depth = 0;
    let j = at + 3;
    for (; j < value.length; j++) {
      if (value[j] === "(") depth++;
      if (value[j] === ")" && --depth === 0) break;
    }
    const args = value.slice(at + 4, j);
    const comma = args.indexOf(",");
    const name = (comma < 0 ? args : args.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : args.slice(comma + 1).trim();
    out += fn(name, fallback);
    i = j + 1;
  }
  return out;
}

/** A declaration's value as one colour in this look, or null (gradients, currentColor, unknown tokens). */
export function colourOf(value: string | undefined, rule: CssRule, look: Look): RGBA | null {
  if (value === undefined) return null;
  const resolved = resolveVars(value, rule, look);
  if (resolved === null) return null;
  const direct = tryColor(resolved);
  if (direct) return direct;
  // A `background` shorthand: the colour is the one token that parses as a colour (no gradients or images).
  if (/gradient|url\(|image-set/.test(resolved)) return null;
  const hits = splitTop(resolved, " ").map(tryColor).filter((c): c is RGBA => c !== null);
  return hits.length === 1 ? hits[0] : null;
}

/** Pixels of a length (`px`, `rem`, `em` at 16px); clamp()/min()/max() give their first plain length; otherwise null. */
export function lengthPx(value: string): number | null {
  const v = value.trim();
  const fn = v.match(/^(?:clamp|min|max)\((.*)\)$/);
  if (fn) return lengthPx(splitTop(fn[1])[0]);
  const m = v.match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  return m ? toPx(m[1], m[2]) : v === "0" ? 0 : null;
}

// ------------------------------------------------------------------------------------------------ selectors

/** Splits a selector into compound selectors at combinators (space, >, +, ~) outside brackets and parentheses. */
export function compounds(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (buf) out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** A compound selector without its state: attributes, :hover/:focus/:checked… and pseudo-elements, and :global() unwrapped. */
export function stripState(compound: string): string {
  let c = compound.replace(/:global\(([^)]*)\)/g, "$1");
  let prev = "";
  while (prev !== c) {
    prev = c;
    c = c.replace(/\[[^\]]*\]/g, "").replace(/::?[\w-]+\((?:[^()]|\([^()]*\))*\)/g, "").replace(/::?(?:hover|focus-visible|focus-within|focus|active|checked|disabled|enabled|first-child|last-child|first-of-type|last-of-type|before|after|visited|placeholder|marker|empty|only-child|root)\b/g, "");
  }
  return c;
}

export const lastCompound = (selector: string) => compounds(selector).at(-1) ?? selector;

/** The state parts of a compound selector (attributes, pseudo-classes, pseudo-elements), so a state-specific rule can be told from the base one. */
export function statesOf(compound: string): string[] {
  const c = compound.replace(/:global\(([^)]*)\)/g, "$1");
  return (c.match(/\[[^\]]*\]|::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g) ?? []).filter((s) => !/^:(is|where)\(/.test(s)).sort();
}
