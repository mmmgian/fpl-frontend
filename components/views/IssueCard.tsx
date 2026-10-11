import Link from "next/link";
import { Badge } from "@/components/ui";
import { KIND_LABEL, formatBytes, issueAssets, type IssueSummary } from "@/lib/domain";
import styles from "./times.module.css";

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatPublished = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));

/** One issue in the library: its cover, what it is, and a single link to open it. */
export function IssueCard({ issue, priority = false }: { issue: IssueSummary; priority?: boolean }) {
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
          <Badge>{KIND_LABEL[issue.kind].singular}</Badge>
          {issue.gameweek ? <Badge tone="accent">GW{issue.gameweek}</Badge> : null}
        </p>
        <h3 className={styles.cardTitle}>
          {/* The stretched link: the title is the one link, and ::after makes the whole card its target. */}
          <Link href={`/times/${issue.id}`} className={styles.cardLink}>
            {issue.title}
          </Link>
        </h3>
        {issue.kicker ? <p className={styles.kicker}>{issue.kicker}</p> : null}
        {issue.summary ? <p className={styles.summary}>{issue.summary}</p> : null}
        <p className={styles.facts}>
          {issue.pageCount} {issue.pageCount === 1 ? "page" : "pages"} · {formatBytes(issue.bytes)} · {formatPublished(issue.published)}
        </p>
      </div>
    </article>
  );
}
