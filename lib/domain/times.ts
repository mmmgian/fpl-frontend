/** The Lobster Times: a library of issues (generated reports), each a sequence of pages. Pure: no I/O, no framework. */

export const ISSUE_KINDS = ["times", "recap", "preview", "plan", "dossier", "report"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const KIND_LABEL: Record<IssueKind, { singular: string; plural: string }> = {
  times: { singular: "Newspaper", plural: "Newspapers" },
  recap: { singular: "Recap", plural: "Recaps" },
  preview: { singular: "Preview", plural: "Previews" },
  plan: { singular: "Plan", plural: "Plans" },
  dossier: { singular: "Dossier", plural: "Dossiers" },
  report: { singular: "Report", plural: "Reports" },
};

export interface IssueSummary {
  /** URL-safe slug, also the folder name of its assets. */
  id: string;
  title: string;
  kicker: string | null;
  kind: IssueKind;
  /** The gameweek it covers; null when it isn't tied to one. */
  gameweek: number | null;
  /** ISO date (YYYY-MM-DD). */
  published: string;
  summary: string | null;
  pageCount: number;
  /** Size of the source PDF in bytes. */
  bytes: number;
  /** Pixel size of the page images (all pages share the width). */
  cover: { width: number; height: number };
}

export interface IssuePage {
  /** 1-based. */
  n: number;
  width: number;
  height: number;
}

export interface Issue extends IssueSummary {
  pages: IssuePage[];
}

// ---------- ids and assets ----------

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isIssueId = (raw: string): boolean => ID.test(raw) && raw.length <= 80;

/** Page image sizes, widest last: small thumbnails, medium for phones and spreads, large for retina. */
export const PAGE_IMAGE_WIDTHS = { s: 240, m: 640, l: 1080 } as const;

/**
 * Where the pipeline (scripts/times/build.mjs) writes things. This is a convention shared with that script
 * and checked by a test that every issue's files exist.
 */
export const issueAssets = {
  pdf: (id: string) => `/times/${id}/${id}.pdf`,
  /** { id, pages: string[] }: each page's text, one line per line. Loaded on demand, never with the page. */
  text: (id: string) => `/times/${id}/text.json`,
  page: (id: string, n: number, size: keyof typeof PAGE_IMAGE_WIDTHS) => `/times/${id}/p-${String(n).padStart(3, "0")}-${size}.webp`,
  srcSet: (id: string, n: number) =>
    (["s", "m", "l"] as const).map((size) => `${issueAssets.page(id, n, size)} ${PAGE_IMAGE_WIDTHS[size]}w`).join(", "),
} as const;

// ---------- parsing ----------

export function parseIssueKind(raw: string | string[] | undefined): IssueKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (ISSUE_KINDS as readonly string[]).includes(value ?? "") ? (value as IssueKind) : null;
}

/** A 1-based page from a query parameter: 1 when missing or malformed, clamped into [1, count]. */
export function parsePageNumber(raw: string | string[] | undefined, count: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (count < 1 || value == null || !/^\d{1,4}$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), count);
}

// ---------- ordering and filtering ----------

/** Newest first; same day: higher gameweek first, then the more important kind, then title. */
export function compareIssues(a: IssueSummary, b: IssueSummary): number {
  return (
    b.published.localeCompare(a.published) ||
    (b.gameweek ?? 0) - (a.gameweek ?? 0) ||
    ISSUE_KINDS.indexOf(a.kind) - ISSUE_KINDS.indexOf(b.kind) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

export const sortIssues = (issues: IssueSummary[]): IssueSummary[] => [...issues].sort(compareIssues);

export const filterIssues = (issues: IssueSummary[], kind: IssueKind | null): IssueSummary[] =>
  kind ? issues.filter((i) => i.kind === kind) : issues;

/** How many issues of each kind, in the canonical order, skipping kinds with none. */
export function kindCounts(issues: IssueSummary[]): { kind: IssueKind; count: number }[] {
  return ISSUE_KINDS.map((kind) => ({ kind, count: issues.filter((i) => i.kind === kind).length })).filter((k) => k.count > 0);
}

/** The most recent newspaper: the library's front page. null if there are none. */
export const latestEdition = (sorted: IssueSummary[]): IssueSummary | null => sorted.find((i) => i.kind === "times") ?? null;

/** Neighbours in a sorted list: `newer` is earlier in the list, `older` is later. */
export function neighbours(sorted: IssueSummary[], id: string): { newer: IssueSummary | null; older: IssueSummary | null } {
  const i = sorted.findIndex((x) => x.id === id);
  if (i === -1) return { newer: null, older: null };
  return { newer: sorted[i - 1] ?? null, older: sorted[i + 1] ?? null };
}
