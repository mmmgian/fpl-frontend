import Link from "next/link";
import { Badge, English, PageHeader, getLocale, getT } from "@/components/ui";
import { formatBytes, localizeIssue, type IssueSummary } from "@/lib/domain";
import type { TimesIssueModel } from "@/lib/services/models";
import { issueFacts } from "./IssueCard";
import { IssueReader } from "./IssueReader";
import styles from "./times.module.css";

type Ok = Extract<TimesIssueModel, { kind: "ok" }>;

function Neighbour({ issue: english, label }: { issue: IssueSummary; label: string }) {
  const issue = localizeIssue(english, getLocale());
  return (
    <Link href={`/times/${issue.id}`} className={styles.neighbour}>
      <span className={styles.eyebrow}>{label}</span>
      <span className={styles.neighbourTitle}>
        <English>{issue.title}</English>
      </span>
      {issue.kicker ? <span className={styles.kicker}>{issue.kicker}</span> : null}
    </Link>
  );
}

export function TimesReaderView({ model }: { model: Ok }) {
  const t = getT().times;
  const locale = getLocale();
  const { page, newer, older } = model;
  const issue = localizeIssue(model.issue, locale);
  const pageLink = (n: number) => `/times/${issue.id}?p=${n}`;

  return (
    <>
      <PageHeader
        back={<Link href="/times">{t.back}</Link>}
        eyebrow={t.eyebrow(t.kindSingular[issue.kind], issue.gameweek)}
        title={<English>{issue.title}</English>}
        meta={
          <>
            {issue.kicker ? <span>{issue.kicker}</span> : null}
            <Badge>{t.kindSingular[issue.kind]}</Badge>
            <span>{issueFacts(issue)}</span>
            {locale !== "en" ? <span>{t.englishOnly}</span> : null}
          </>
        }
      />

      <IssueReader issue={issue} initialPage={page} size={formatBytes(issue.bytes, locale, t.bytes)} />

      {/* The page turner needs JavaScript; this keeps every page reachable without it. */}
      <noscript>
        <nav aria-label={t.turn} className={styles.noscript}>
          {page > 1 ? <a href={pageLink(page - 1)}>{t.previousPage}</a> : null}
          <span>{t.pageOf(page, issue.pageCount)}</span>
          {page < issue.pageCount ? <a href={pageLink(page + 1)}>{t.nextPage}</a> : null}
        </nav>
      </noscript>

      {newer || older ? (
        <nav aria-label={t.more} className={styles.neighbours}>
          {older ? <Neighbour issue={older} label={t.previousIssue} /> : <span />}
          {newer ? <Neighbour issue={newer} label={t.nextIssue} /> : <span />}
        </nav>
      ) : null}
    </>
  );
}
