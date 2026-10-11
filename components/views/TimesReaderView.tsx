import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { KIND_LABEL, formatBytes, type IssueSummary } from "@/lib/domain";
import type { TimesIssueModel } from "@/lib/services/models";
import { formatPublished } from "./IssueCard";
import { IssueReader } from "./IssueReader";
import styles from "./times.module.css";

type Ok = Extract<TimesIssueModel, { kind: "ok" }>;

function Neighbour({ issue, label }: { issue: IssueSummary; label: string }) {
  return (
    <Link href={`/times/${issue.id}`} className={styles.neighbour}>
      <span className={styles.eyebrow}>{label}</span>
      <span className={styles.neighbourTitle}>{issue.title}</span>
      {issue.kicker ? <span className={styles.kicker}>{issue.kicker}</span> : null}
    </Link>
  );
}

export function TimesReaderView({ model }: { model: Ok }) {
  const { issue, page, newer, older } = model;
  const pageLink = (n: number) => `/times/${issue.id}?p=${n}`;

  return (
    <>
      <PageHeader
        back={<Link href="/times">← The Times</Link>}
        eyebrow={issue.gameweek ? `${KIND_LABEL[issue.kind].singular} · Gameweek ${issue.gameweek}` : KIND_LABEL[issue.kind].singular}
        title={issue.title}
        meta={
          <>
            {issue.kicker ? <span>{issue.kicker}</span> : null}
            <Badge>{KIND_LABEL[issue.kind].singular}</Badge>
            <span>
              {issue.pageCount} {issue.pageCount === 1 ? "page" : "pages"} · {formatBytes(issue.bytes)} · {formatPublished(issue.published)}
            </span>
          </>
        }
      />

      <IssueReader issue={issue} initialPage={page} />

      {/* The page turner needs JavaScript; this keeps every page reachable without it. */}
      <noscript>
        <nav aria-label="Turn the page" className={styles.noscript}>
          {page > 1 ? <a href={pageLink(page - 1)}>← Previous page</a> : null}
          <span>
            Page {page} of {issue.pageCount}
          </span>
          {page < issue.pageCount ? <a href={pageLink(page + 1)}>Next page →</a> : null}
        </nav>
      </noscript>

      {newer || older ? (
        <nav aria-label="More issues" className={styles.neighbours}>
          {older ? <Neighbour issue={older} label="← Previous issue" /> : <span />}
          {newer ? <Neighbour issue={newer} label="Next issue →" /> : <span />}
        </nav>
      ) : null}
    </>
  );
}
