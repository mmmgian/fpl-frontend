import type { Issue, IssueKind, IssueSummary } from "@/lib/domain";
import type { TimesPort } from "@/lib/services/ports";

export const summary = (over: Partial<IssueSummary> & { id: string }): IssueSummary => ({
  title: over.id,
  kicker: null,
  kind: "report",
  gameweek: null,
  published: "2026-09-01",
  summary: null,
  pageCount: 3,
  bytes: 524_288,
  cover: { width: 1080, height: 1528 },
  ...over,
});

/** A small, fixed library: two newspapers, a plan, a dossier, a one-pager. */
export const LIBRARY: IssueSummary[] = [
  summary({ id: "times-gw5", title: "The Lobster Times", kicker: "Vol. V · Issue 5", kind: "times", gameweek: 5, published: "2026-09-21", pageCount: 6, bytes: 3_400_687, summary: "The gazette of the league." }),
  summary({ id: "times-gw4", title: "The Lobster League Times", kicker: "GW4 final edition", kind: "times", gameweek: 4, published: "2026-09-16", pageCount: 4 }),
  summary({ id: "plan-gw6", title: "Hold Second", kicker: "Gaucho F.C. · GW6 plan", kind: "plan", gameweek: 6, published: "2026-10-10", pageCount: 5, summary: "Stay second." }),
  summary({ id: "dossier-gw6", title: "GW6 Dossier", kind: "dossier", gameweek: 6, published: "2026-10-10", pageCount: 2 }),
  summary({ id: "one-pager", title: "One Pager", kind: "report", gameweek: null, published: "2026-08-31", pageCount: 1, cover: { width: 1080, height: 1560 } }),
];

export const issueOf = (s: IssueSummary): Issue => ({
  ...s,
  pages: Array.from({ length: s.pageCount }, (_, i) => ({ n: i + 1, width: s.cover.width, height: s.cover.height })),
});

export const fakeTimes = (library: IssueSummary[] = LIBRARY): TimesPort => ({
  library: async () => library,
  issue: async (id) => {
    const s = library.find((i) => i.id === id);
    return s ? issueOf(s) : null;
  },
});

export const KINDS_PRESENT: IssueKind[] = ["times", "plan", "dossier", "report"];
