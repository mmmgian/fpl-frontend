/**
 * The design scales, as measurable rules over the stylesheets:
 *  - font sizes come from a small set (clamp() headings, em/% and var() are left alone);
 *  - line-heights are unitless between 1 and 1.8;
 *  - border-radius is a token (--radius, --radius-lg, --radius-in, --radius-pill), a calc() of one, 0, 50%, a pill (999px+), or a short list of px;
 *  - spacing (padding, margin, gap) is a --space-* token, or a multiple of 2px up to 32px (negative margins included).
 * A value that is neither a plain length nor a token (calc(), min(), env(), %, em, ch, vw…) is not judged.
 */
import { readRules, type CssRule } from "./css";
import { splitTop } from "../colour";

export const FONT_SIZES_PX = [11, 12, 13, 14, 15, 16, 18, 20, 24, 26, 28, 32, 34, 40];
export const RADII_PX = [2, 3, 4, 6, 8, 10, 12];
export const LINE_HEIGHT = { min: 1, max: 1.8 };
export const SPACE_MAX_PX = 32;

export type Kind = "font-size" | "line-height" | "radius" | "spacing";
export interface OffScale {
  file: string;
  selector: string;
  line: number;
  prop: string;
  value: string;
  kind: Kind;
  why: string;
}

const LEN = /^(-?\d*\.?\d+)(px|rem)$/;
const px = (v: string): number | null => {
  const m = LEN.exec(v);
  return m ? (m[2] === "px" ? +m[1] : +m[1] * 16) : null;
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

const SPACING = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap|grid-gap)$/;
const RADIUS = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;

/** The parts of a (possibly multi-value) property, split on spaces and `/` outside functions. */
const parts = (value: string) => splitTop(value.replace(/\s*\/\s*/g, " "), " ").filter(Boolean);

export function offScale(rules: CssRule[]): OffScale[] {
  const out: OffScale[] = [];
  for (const r of rules) {
    if (r.keyframes) continue;
    for (const d of r.decls) {
      const hidden = r.decls.some((x) => x.prop === "clip" || x.prop === "clip-path"); // the visually-hidden pattern uses margin: -1px
      const add = (kind: Kind, value: string, why: string) => out.push({ file: r.file, selector: r.selector, line: r.line, prop: d.prop, value, kind, why });
      if (d.prop === "font-size") {
        const n = px(d.value);
        if (n !== null && !FONT_SIZES_PX.some((s) => close(s, n))) add("font-size", d.value, `${n}px is not one of ${FONT_SIZES_PX.join(", ")}`);
      } else if (d.prop === "line-height") {
        const v = d.value;
        if (/^[\d.]+$/.test(v)) {
          const n = +v;
          if (n < LINE_HEIGHT.min || n > LINE_HEIGHT.max) add("line-height", v, `${n} is outside ${LINE_HEIGHT.min} to ${LINE_HEIGHT.max}`);
        } else if (LEN.test(v) || /^[\d.]+%$/.test(v)) add("line-height", v, "line-height must be unitless");
      } else if (RADIUS.test(d.prop)) {
        for (const p of parts(d.value)) {
          if (/var\(--radius/.test(p) || /^calc\(.*var\(--radius/.test(p)) continue;
          const n = px(p);
          if (n === null) continue; // 50%, 0, inherit, calc of something else
          if (n === 0 || n >= 999 || RADII_PX.some((s) => close(s, n))) continue;
          add("radius", p, `${n}px is not a radius token or one of ${RADII_PX.join(", ")}px`);
        }
      } else if (SPACING.test(d.prop) && !hidden) {
        for (const p of parts(d.value)) {
          if (/^var\(--space-\d\)$/.test(p) || /var\(--space-/.test(p)) continue;
          const n = px(p);
          if (n === null) continue;
          const a = Math.abs(n);
          if (a > SPACE_MAX_PX) continue; // big page-level gaps are layout, not rhythm
          if (a === 0 || close(a % 2, 0)) continue;
          add("spacing", p, `${a}px is not a --space-* token or an even number of px up to ${SPACE_MAX_PX}`);
        }
      }
    }
  }
  return out;
}

export type Counts = Record<Kind, number>;
export function countsFor(file: string): Counts & { items: OffScale[] } {
  const items = offScale(readRules(file));
  const c = { "font-size": 0, "line-height": 0, radius: 0, spacing: 0 };
  for (const i of items) c[i.kind]++;
  return { ...c, items };
}
