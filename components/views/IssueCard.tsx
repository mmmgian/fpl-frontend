import Link from "next/link";
import { Badge, English, getIntlLocale, getLocale, getT } from "@/components/ui";
import { formatBytes, issueAssets, localizeIssue, type IssueSummary } from "@/lib/domain";
import styles from "./times.module.css";

/** "21 Sept 2026" in the reader's language. `intl` is the page's Intl locale tag. */
export const formatPublished = (iso: string, intl: string) => new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** "12 pages · 3.4 MB · 21 Sept 2026" */
export function issueFacts(issue: Pick<IssueSummary, "pageCount" | "bytes" | "published">): string {
  const t = getT().times;
  return `${t.pages(issue.pageCount)} · ${formatBytes(issue.bytes, getLocale(), t.bytes)} · ${formatPublished(issue.published, getIntlLocale())}`;
}

/** One issue in the library: its cover, what it is, and a single link to open it. */
export function IssueCard({ issue: english, priority = false }: { issue: IssueSummary; priority?: boolean }) {
  const t = getT();
  const issue = localizeIssue(english, getLocale());
  const { width, height } = issue.cover;
  return (
    <article className={styles.card}>
      <span className={styles.cover} style={{ aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized cover with its own srcset */}
        <img
          src={issueAssets.page(issue.id, 1, "m")}
          srcSet={`${issueAssets.page(issue.id, 1, "s")} 240w, ${issueAssets.page(issue.id, 1, "m")} 640w`}
          sizes="(min-width: 960px) 260px, (min-width: 520px) 45vw, calc(100vw - 32px)"
          alt=""
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </span>
      <div className={styles.cardBody}>
        <p className={styles.cardMeta}>
          <Badge>{t.times.kindSingular[issue.kind]}</Badge>
          {issue.gameweek ? <Badge tone="accent">{t.common.gw(issue.gameweek)}</Badge> : null}
        </p>
        <h3 className={styles.cardTitle}>
          {/* The stretched link: the title is the one link, and ::after makes the whole card its target. */}
          <Link href={`/times/${issue.id}`} className={styles.cardLink}>
            <English>{issue.title}</English>
          </Link>
        </h3>
        {issue.kicker ? <p className={styles.kicker}>{issue.kicker}</p> : null}
        {issue.summary ? <p className={styles.summary}>{issue.summary}</p> : null}
        <p className={styles.facts}>
          {issueFacts(issue)}
        </p>
      </div>
    </article>
  );
}
