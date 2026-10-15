/**
 * Contrast of what the stylesheets actually declare: every rule that sets `color`, against the background it will sit on, in
 * every look (regular, night reader, dark, and the blotter view over each).
 *
 * The background is the nearest one the CSS itself declares: the rule's own, else a base rule of the same element in the same
 * file (so `.btn:hover { color }` is judged on `.btn { background }`), else an ancestor named earlier in the selector. When the
 * CSS declares none, the text may sit on the page or on a panel, so it must read on the page (--bg), on the glass panel
 * (--surface over --bg) and on the solid panel (--surface-solid). Translucent colours are composited over the real backdrop.
 * A value that cannot be resolved (gradients, currentColor, unknown tokens) is skipped, never guessed.
 */
import { over, ratio, show, type RGBA } from "../colour";
import { NO_RULE, colourOf, compounds, declOf, lengthPx, looksFor, lastCompound, outsideLooks, readRules, statesOf, stripState, LOOKS, type CssRule, type Look } from "./css";

export interface Failure {
  file: string;
  selector: string;
  line: number;
  look: string;
  text: string;
  on: string;
  ratio: number;
  need: number;
}

export const describeFailure = (f: Failure) =>
  `${f.file}:${f.line} "${f.selector}" in the ${f.look} look: text ${f.text} on ${f.on} is ${f.ratio.toFixed(2)}:1, needs ${f.need}:1`;

/** The three things text with no declared background of its own may sit on. */
export function surfaces(look: Look): { name: string; colour: RGBA }[] {
  const c = (token: string) => colourOf(`var(${token})`, NO_RULE, look)!;
  const bg = c("--bg");
  return [
    { name: "--bg", colour: bg },
    { name: "--surface over --bg", colour: over(c("--surface"), bg) },
    { name: "--surface-solid", colour: c("--surface-solid") },
  ];
}

const BG_PROPS = ["background", "background-color"];
const lastBackground = (r: Pick<CssRule, "decls">) => [...r.decls].reverse().find((d) => BG_PROPS.includes(d.prop));

type Own = { kind: "none" } | { kind: "unknown" } | { kind: "colour"; colour: RGBA; css: string };
function ownBackground(rule: CssRule, look: Look): Own {
  const d = lastBackground(rule);
  if (!d) return { kind: "none" };
  const c = colourOf(d.value, rule, look);
  if (!c) return /^(none|transparent|initial|unset|inherit)$/.test(d.value) ? { kind: "none" } : { kind: "unknown" };
  return c[3] === 0 ? { kind: "none" } : { kind: "colour", colour: c, css: d.value };
}

/** Opaque backdrops the text may sit on, labelled; null when the rule's own background cannot be judged. */
export function backdrops(rule: CssRule, look: Look, all: CssRule[]): { name: string; colour: RGBA }[] | null {
  const bases = surfaces(look);
  const found: { name: string; colour: RGBA }[] = [];
  const add = (src: CssRule, own: Extract<Own, { kind: "colour" }>) => {
    const label = src === rule ? own.css : `${own.css} (from "${src.selector}")`;
    if (own.colour[3] >= 1) found.push({ name: label, colour: own.colour });
    else for (const b of bases) found.push({ name: `${label} over ${b.name}`, colour: over(own.colour, b.colour) });
  };

  const chain = compounds(rule.selector);
  const mine = new Set(statesOf(chain.at(-1)!));
  const self = ownBackground(rule, look);
  if (self.kind === "unknown") return null;
  if (self.kind === "colour") {
    add(rule, self);
    return found;
  }

  const sameElement = (r: CssRule, compound: string, states: Set<string>) => {
    if (r === rule || compounds(r.selector).length !== 1 || r.keyframes || outsideLooks(r) || !looksFor(r.selector).includes(look)) return false;
    const rc = lastCompound(r.selector);
    if (stripState(rc) !== stripState(compound)) return false;
    return statesOf(rc).every((s) => states.has(s)); // a state the element isn't in doesn't paint behind it
  };

  for (let i = chain.length - 1; i >= 0; i--) {
    const states = i === chain.length - 1 ? mine : new Set(statesOf(chain[i]));
    const hits: [CssRule, Extract<Own, { kind: "colour" }>][] = [];
    for (const r of all) {
      if (!sameElement(r, chain[i], states)) continue;
      const o = ownBackground(r, look);
      if (o.kind === "colour") hits.push([r, o]);
    }
    if (hits.length) {
      for (const [r, o] of hits) add(r, o);
      return found;
    }
  }
  return bases.map((b) => ({ name: b.name, colour: b.colour }));
}

const SKIP_SELECTOR = /:disabled|\[disabled\]|\[aria-disabled|::selection|::-webkit-scrollbar/;

/** font-size and weight of the rule or its base rule: large text (24px, or 18.66px bold) only needs 3:1. */
function isLarge(rule: CssRule, all: CssRule[]): boolean {
  const mine = lastCompound(rule.selector);
  const pool = [rule, ...all.filter((r) => r !== rule && stripState(lastCompound(r.selector)) === stripState(mine) && statesOf(lastCompound(r.selector)).length === 0)];
  const pick = (prop: string) => pool.map((r) => declOf(r, prop)).find(Boolean)?.value;
  const size = pick("font-size");
  const px = size ? lengthPx(size) : null;
  const w = pick("font-weight");
  const bold = w === "bold" || Number(w) >= 700;
  return px !== null && (px >= 24 || (px >= 18.66 && bold));
}

/** How many (rule, look) pairs the last scan could actually measure, so a test can prove the checker is not silently skipping everything. */
export const scanned = { measured: 0 };

export function contrastFailures(files: string[], looks: Look[] = LOOKS): Failure[] {
  const out: Failure[] = [];
  for (const file of files) {
    const all = readRules(file);
    for (const rule of all) {
      const decl = declOf(rule, "color");
      if (!decl || rule.keyframes || outsideLooks(rule) || SKIP_SELECTOR.test(rule.selector)) continue;
      if (declOf(rule, "-webkit-text-fill-color") || declOf(rule, "background-clip")?.value === "text" || declOf(rule, "-webkit-background-clip")?.value === "text") continue;
      if (/::(before|after|marker)/.test(rule.selector) && /^(""|''|none)$/.test(declOf(rule, "content")?.value ?? "")) continue; // a decorative mark, not text
      const need = isLarge(rule, all) ? 3 : 4.5;
      for (const look of looksFor(rule.selector).filter((l) => looks.includes(l))) {
        const fg = colourOf(decl.value, rule, look);
        if (!fg || fg[3] === 0) continue;
        const backs = backdrops(rule, look, all);
        if (!backs) continue;
        scanned.measured++;
        let worst: { r: number; on: string; text: RGBA } | null = null;
        for (const b of backs) {
          const seen = over(fg, b.colour);
          const r = ratio(seen, b.colour);
          if (!worst || r < worst.r) worst = { r, on: b.name, text: seen };
        }
        if (worst && worst.r < need) out.push({ file, selector: rule.selector, line: rule.line, look: look.name, text: `${decl.value} (${show(worst.text)})`, on: worst.on, ratio: worst.r, need });
      }
    }
  }
  return out;
}
