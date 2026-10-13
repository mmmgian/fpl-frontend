import type { IssueSummary } from "../domain";
import { KIND_LABEL, filterIssues, gwPhase, kindCounts, latestEdition, neighbours, parseIssueKind, parsePageNumber, sortIssues, varietyKey } from "../domain";
import type { TimesIssueModel, TimesLibraryModel, TimesPress } from "./models";
import type { FplPort, TimesPort } from "./ports";

interface TimesOptions {
  /** FPL, so the library can say when a finished gameweek's newspaper is still at the printers. Optional. */
  fpl?: Pick<FplPort, "bootstrap">;
  now?: () => Date;
}

/** Use cases: browse The Lobster Times, and open one issue at a page. */
export function createTimesService(times: TimesPort, { fpl, now = () => new Date() }: TimesOptions = {}) {
  const press = async (all: IssueSummary[]): Promise<TimesPress> => {
    const at = now();
    const phase = fpl ? await fpl.bootstrap().then((b) => gwPhase(b.events, at), () => null) : null;
    const printed = Math.max(0, ...all.filter((i) => i.kind === "times").map((i) => i.gameweek ?? 0));
    const done = phase?.phase === "final" || phase?.phase === "provisional" || phase?.phase === "over";
    // Only the very next edition is "on its way": a longer gap means the presses stopped, and we don't promise what isn't coming.
    return {
      gw: phase?.gw ?? null,
      phase: phase?.phase ?? null,
      awaiting: done && printed > 0 && phase?.gw === printed + 1 ? phase.gw : null,
      variety: phase?.variety ?? varietyKey(printed, "final", at),
    };
  };
  return {
    /** `kind` is the raw `?kind=` query value; anything unrecognised means "all". */
    async library(kind: string | string[] | undefined): Promise<TimesLibraryModel> {
      const all = sortIssues(await times.library());
      if (all.length === 0) return { kind: "empty", press: await press(all) };

      const active = parseIssueKind(kind);
      const hero = active ? null : latestEdition(all);
      const issues = filterIssues(all, active).filter((i) => i.id !== hero?.id);
      return {
        kind: "ok",
        press: await press(all),
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
      // "Previous / next issue" walks one series: after a newspaper comes the next newspaper, not a dossier from the same week.
      const series = filterIssues(sorted, issue.kind);
      return { kind: "ok", issue, page: parsePageNumber(page, issue.pageCount), ...neighbours(series, issue.id) };
    },
  };
}
