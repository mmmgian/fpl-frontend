/**
 * Narrow-phone overflow rules, read from the stylesheets: at a 320px viewport with 16px page padding a card's content box is
 * about 256px wide (320 - 2x16 page - 2x16 card). A rule that applies at that width must not claim more than that with a fixed
 * size, and must not keep a row of items on one line with nothing to catch the overflow.
 */
import { appliesAtWidth, declOf, lengthPx, readRules, type CssRule } from "./css";
import { splitTop } from "../colour";

export const PHONE = 320;
/** Width of a card's content on the narrowest supported phone. */
export const CONTENT_PX = 256;

export interface Finding {
  file: string;
  selector: string;
  line: number;
  what: string;
}
export const describeFinding = (f: Finding) => `${f.file}:${f.line} "${f.selector}": ${f.what}`;

const plain = (v: string) => /^-?\d*\.?\d+(px|rem|em)$/.test(v.trim());

/** width / min-width / flex-basis fixed to a plain length wider than the content box. */
export function fixedSizes(rules: CssRule[], width = PHONE): Finding[] {
  const out: Finding[] = [];
  for (const r of rules) {
    if (r.keyframes || !appliesAtWidth(r, width)) continue;
    for (const prop of ["width", "min-width", "flex-basis"]) {
      const d = declOf(r, prop);
      const px = d && plain(d.value) ? lengthPx(d.value) : null;
      if (px !== null && px > CONTENT_PX) out.push({ file: r.file, selector: r.selector, line: r.line, what: `${prop}: ${d!.value} is ${px}px, wider than the ${CONTENT_PX}px a card has on a ${width}px phone (use min(100%, ${d!.value}) or max-width)` });
    }
  }
  return out;
}

/** Grid tracks that cannot shrink below the content box: auto-fit/fill minmax(<wide>, 1fr) without min(100%, …), or fixed tracks summing past it. */
export function wideTracks(rules: CssRule[], width = PHONE): Finding[] {
  const out: Finding[] = [];
  for (const r of rules) {
    const d = declOf(r, "grid-template-columns");
    if (!d || r.keyframes || !appliesAtWidth(r, width)) continue;
    const rep = d.value.match(/^repeat\(\s*auto-(?:fit|fill)\s*,\s*minmax\(\s*([^,]+?)\s*,/);
    if (rep) {
      const px = plain(rep[1]) ? lengthPx(rep[1]) : null;
      if (px !== null && px > CONTENT_PX) out.push({ file: r.file, selector: r.selector, line: r.line, what: `grid-template-columns: ${d.value} needs ${px}px per column; write minmax(min(100%, ${rep[1]}), 1fr) so one column fits a ${width}px phone` });
      continue;
    }
    // Fixed tracks (and the floor of each minmax) that add up to more than the content box.
    let sum = 0;
    for (const t of splitTop(d.value, " ")) {
      const mm = t.match(/^minmax\(\s*([^,]+?)\s*,/);
      const px = lengthPx(mm ? mm[1] : t);
      if (px !== null && plain(mm ? mm[1] : t)) sum += px;
    }
    if (sum > CONTENT_PX) out.push({ file: r.file, selector: r.selector, line: r.line, what: `grid-template-columns: ${d.value} fixes ${sum}px of columns, more than ${CONTENT_PX}px` });
  }
  return out;
}

const CONTAINER = /^(flex|inline-flex|grid|inline-grid)$/;
const CLIPS = /^(hidden|auto|scroll|clip)$/;

/** A row that keeps its items on one line (`flex-wrap: nowrap`, or `white-space: nowrap` on a flex/grid container) with no scroll, clip or ellipsis to catch the overflow. */
export function nowrapContainers(rules: CssRule[], width = PHONE): CssRule[] {
  return rules.filter((r) => {
    if (r.keyframes || !appliesAtWidth(r, width)) return false;
    const display = declOf(r, "display")?.value ?? "";
    const wrap = declOf(r, "flex-wrap")?.value === "nowrap" || (declOf(r, "white-space")?.value === "nowrap" && CONTAINER.test(display));
    if (!wrap) return false;
    const ox = declOf(r, "overflow-x")?.value ?? declOf(r, "overflow")?.value ?? "";
    return !CLIPS.test(ox) && declOf(r, "text-overflow")?.value !== "ellipsis";
  });
}

/** Justified single-line containers: each holds one or two short items, so it cannot outgrow a phone. */
export const SHORT_ROWS: { file: string; selector: RegExp; reason: string }[] = [
  { file: "components/ui/Badge.module.css", selector: /^\.badge$/, reason: "one short label" },
  { file: "components/ui/Button.module.css", selector: /^\.button$/, reason: "one button label and an optional icon" },
  { file: "components/ui/FdrChip.module.css", selector: /^\.chip$/, reason: "one difficulty number" },
  { file: "components/ui/SiteHeader.module.css", selector: /^\.link$/, reason: "one nav pill; the nav wraps its pills onto two rows instead (SiteHeader)" },
  { file: "components/ui/PageHeader.module.css", selector: /^\.centered \.actions$/, reason: "the two header controls (refresh and a pager) on the right of a centred title" },
  { file: "components/views/club.module.css", selector: /^\.end$/, reason: "a kick-off time and a result pill" },
  { file: "components/views/views.module.css", selector: /^\.(rankCell|clubCell)$/, reason: "a rank number with its movement arrow / a crest with a three-letter code" },
  { file: "components/views/fixtureFeed.module.css", selector: /^\.middle$/, reason: "a kick-off time or a score between two clubs" },
  { file: "components/views/club.module.css", selector: /^\.newsMeta$/, reason: "a source and a date, which stack (and sit side by side under 520px)" },
  { file: "components/views/tools/layout.module.css", selector: /^\.(groupTag|jumpLabel)$/, reason: "one section label, a few words" },
  { file: "components/views/tools/planning.module.css", selector: /^\.week$/, reason: "one gameweek number and its difficulty chip; a run of weeks wraps between them" },
  { file: "components/views/leagueExtras.module.css", selector: /^:root\[data-trip="on"\] \.togglePillTrip$/, reason: "a pill label" },
];

export const justified = (r: CssRule) => SHORT_ROWS.some((s) => s.file === r.file && s.selector.test(r.selector));
export const allRules = (files: string[]) => files.flatMap(readRules);
