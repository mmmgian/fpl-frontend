/**
 * Adapter: The Lobster Times content as seen through the `TimesPort`.
 *
 * The data is generated at build time by scripts/times/build.mjs and imported as JSON, so there is no
 * network or filesystem access at runtime. It is still validated here, at the boundary: a hand-edited or
 * half-written file degrades to "no such issue" instead of reaching the domain as undefined.
 */
import { ISSUE_KINDS, isIssueId, type Issue, type IssuePage, type IssueSummary } from "../domain/times";
import type { TimesPort } from "../services/ports";
import rawLibrary from "./generated/library.json";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isSize = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const textOrNull = (v: unknown): string | null | undefined => (v == null ? null : typeof v === "string" ? v : undefined);

export function parseSummary(raw: unknown): IssueSummary | null {
  if (!isObject(raw)) return null;
  const { id, title, kind, gameweek, published, pageCount, bytes, cover } = raw;
  const kicker = textOrNull(raw.kicker);
  const summary = textOrNull(raw.summary);
  if (typeof id !== "string" || !isIssueId(id)) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof kind !== "string" || !(ISSUE_KINDS as readonly string[]).includes(kind)) return null;
  if (!(gameweek === null || gameweek === undefined || (isCount(gameweek) && gameweek >= 1 && gameweek <= 38))) return null;
  if (typeof published !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(published)) return null;
  if (!isCount(pageCount) || pageCount < 1 || !isCount(bytes)) return null;
  if (!isObject(cover) || !isSize(cover.width) || !isSize(cover.height)) return null;
  if (kicker === undefined || summary === undefined) return null;
  return {
    id,
    title,
    kicker,
    kind: kind as IssueSummary["kind"],
    gameweek: gameweek ?? null,
    published,
    summary,
    pageCount,
    bytes,
    cover: { width: cover.width, height: cover.height },
  };
}

/**
 * An issue is its library entry (title, kind, ...) plus the pages file the pipeline wrote for it. The pages
 * must be numbered 1..n and agree with the library's page count, otherwise the two are out of step.
 */
export function parseIssue(summary: IssueSummary, raw: unknown): Issue | null {
  if (!isObject(raw) || raw.id !== summary.id || !Array.isArray(raw.pages) || raw.pages.length !== summary.pageCount) return null;
  const pages: IssuePage[] = [];
  for (const [i, p] of raw.pages.entries()) {
    if (!isObject(p) || p.n !== i + 1 || !isSize(p.width) || !isSize(p.height)) return null;
    pages.push({ n: p.n, width: p.width, height: p.height });
  }
  return { ...summary, pages };
}

/** Validated once: the data is static. Invalid entries are dropped, and so is a repeated id. */
const library: IssueSummary[] = (() => {
  const seen = new Set<string>();
  return (Array.isArray(rawLibrary) ? rawLibrary : []).flatMap((r) => {
    const s = parseSummary(r);
    if (!s || seen.has(s.id)) return [];
    seen.add(s.id);
    return [s];
  });
})();

export const timesGateway: TimesPort = {
  async library() {
    return library;
  },

  async issue(id) {
    // Only ids from the validated library reach the dynamic import, so the path can't be steered by a URL.
    const summary = isIssueId(id) ? library.find((i) => i.id === id) : undefined;
    if (!summary) return null;
    try {
      const mod = (await import(`./generated/${id}.json`)) as { default: unknown };
      return parseIssue(summary, mod.default);
    } catch {
      return null;
    }
  },
};
