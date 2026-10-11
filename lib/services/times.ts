import { KIND_LABEL, filterIssues, kindCounts, latestEdition, neighbours, parseIssueKind, parsePageNumber, sortIssues } from "../domain";
import type { TimesIssueModel, TimesLibraryModel } from "./models";
import type { TimesPort } from "./ports";

/** Use cases: browse The Lobster Times, and open one issue at a page. */
export function createTimesService(times: TimesPort) {
  return {
    /** `kind` is the raw `?kind=` query value; anything unrecognised means "all". */
    async library(kind: string | string[] | undefined): Promise<TimesLibraryModel> {
      const all = sortIssues(await times.library());
      if (all.length === 0) return { kind: "empty" };

      const active = parseIssueKind(kind);
      const hero = active ? null : latestEdition(all);
      const issues = filterIssues(all, active).filter((i) => i.id !== hero?.id);
      return {
        kind: "ok",
        hero,
        issues,
        active,
        total: all.length,
        filters: [
          { value: null, label: "All", count: all.length, active: active === null },
          ...kindCounts(all).map((k) => ({ value: k.kind, label: KIND_LABEL[k.kind].plural, count: k.count, active: active === k.kind })),
        ],
      };
    },

    /** `page` is the raw `?p=` query value; it is clamped into the issue's range. */
    async issue(id: string, page: string | string[] | undefined): Promise<TimesIssueModel> {
      const issue = await times.issue(id);
      if (!issue) return { kind: "not-found" };
      const sorted = sortIssues(await times.library());
      return { kind: "ok", issue, page: parsePageNumber(page, issue.pageCount), ...neighbours(sorted, issue.id) };
    },
  };
}
