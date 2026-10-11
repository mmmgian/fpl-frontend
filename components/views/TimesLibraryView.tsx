import Link from "next/link";
import { ButtonLink, StateMessage } from "@/components/ui";
import { KIND_LABEL, issueAssets } from "@/lib/domain";
import type { TimesLibraryModel } from "@/lib/services/models";
import { IssueCard, formatPublished } from "./IssueCard";
import styles from "./times.module.css";

/** The newspaper's nameplate. Everything on /times sits under it. */
export function Masthead() {
  return (
    <header className={styles.masthead}>
      <p className={styles.mastheadTop}>
        <span>Official gazette of the Lobster League</span>
        <span>Every report, in print</span>
      </p>
      <h1 className={styles.nameplate}>The Lobster Times</h1>
    </header>
  );
}

const href = (kind: string | null) => (kind ? `/times?kind=${kind}` : "/times");

export function TimesLibraryView({ model }: { model: TimesLibraryModel }) {
  if (model.kind === "empty") {
    return (
      <>
        <Masthead />
        <StateMessage title="Nothing has gone to print yet">
          <p>Reports and newspapers appear here as they are published.</p>
        </StateMessage>
      </>
    );
  }

  const { hero, issues, filters, active } = model;
  return (
    <>
      <Masthead />

      {hero ? (
        <section aria-labelledby="latest-heading" className={styles.hero}>
          <Link href={`/times/${hero.id}`} className={styles.heroCover} aria-hidden="true" tabIndex={-1}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized cover with its own srcset */}
            <img
              src={issueAssets.page(hero.id, 1, "m")}
              srcSet={`${issueAssets.page(hero.id, 1, "m")} 640w, ${issueAssets.page(hero.id, 1, "l")} 1080w`}
              sizes="(min-width: 700px) 360px, 80vw"
              alt=""
              width={hero.cover.width}
              height={hero.cover.height}
              decoding="async"
              fetchPriority="high"
            />
          </Link>
          <div className={styles.heroText}>
            <p className={styles.eyebrow} id="latest-heading">
              Latest edition{hero.gameweek ? ` · Gameweek ${hero.gameweek}` : ""}
            </p>
            <h2 className={styles.heroTitle}>{hero.title}</h2>
            {hero.kicker ? <p className={styles.kicker}>{hero.kicker}</p> : null}
            {hero.summary ? <p className={styles.heroSummary}>{hero.summary}</p> : null}
            <p className={styles.facts}>
              {hero.pageCount} pages · {formatPublished(hero.published)}
            </p>
            <ButtonLink variant="solid" href={`/times/${hero.id}`}>
              Read the issue
            </ButtonLink>
          </div>
        </section>
      ) : null}

      <nav aria-label="Filter by type" className={styles.filters}>
        {filters.map((f) => (
          <ButtonLink key={f.label} size="sm" variant={f.active ? "solid" : "outline"} href={href(f.value)} aria-current={f.active ? "true" : undefined} scroll={false}>
            {f.label} <span className={styles.count}>{f.count}</span>
          </ButtonLink>
        ))}
      </nav>

      {issues.length === 0 ? (
        <StateMessage title="No issues in this section yet" action={<ButtonLink href="/times">Show everything</ButtonLink>}>
          <p>Try another type, or see the whole library.</p>
        </StateMessage>
      ) : (
        <section aria-labelledby="issues-heading">
          {/* Always present, so the cards' h3s have an h2 above them in every state (filtered, no newspaper, ...). */}
          <h2 id="issues-heading" className={styles.archiveTitle}>
            {active ? KIND_LABEL[active].plural : "The archive"}
          </h2>
          <ul className={styles.grid}>
            {issues.map((issue, i) => (
              <li key={issue.id}>
                <IssueCard issue={issue} priority={i < 3 && !hero} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
