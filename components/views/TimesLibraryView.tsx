import Link from "next/link";
import { ButtonLink, English, StateMessage, getIntlLocale, getLocale, getT } from "@/components/ui";
import { issueAssets, localizeIssue, pickVariant } from "@/lib/domain";
import type { TimesLibraryModel, TimesPress } from "@/lib/services/models";
import { IssueCard, formatPublished } from "./IssueCard";
import styles from "./times.module.css";

/** Slots for the library's lines, so the masthead, the hero and the notices don't change in step. */
const SLOT = { masthead: 1, latest: 2, press: 3, empty: 4 } as const;

/** The newspaper's nameplate. Everything on /times sits under it. `variety` salts the strapline. */
export function Masthead({ variety = 0 }: { variety?: number }) {
  const t = getT().times;
  return (
    <header className={styles.masthead}>
      <p className={styles.mastheadTop}>
        <span>{t.mastheadLeft}</span>
        <span>{pickVariant(t.mastheadRight, variety, SLOT.masthead)}</span>
      </p>
      <h1 className={styles.nameplate}>The Lobster Times</h1>
    </header>
  );
}

/** Where the presses stand: a finished gameweek whose edition is on its way, or one still being played. */
function PressNote({ press }: { press: TimesPress }) {
  const t = getT().times;
  const line =
    press.awaiting !== null ? pickVariant(t.awaiting, press.variety, SLOT.press)(press.awaiting)
    : press.phase === "live" && press.gw !== null ? pickVariant(t.inPlay, press.variety, SLOT.press)(press.gw)
    : null;
  return line ? (
    <p className={styles.press} role="note">
      {line}
    </p>
  ) : null;
}

const href = (kind: string | null) => (kind ? `/times?kind=${kind}` : "/times");

export function TimesLibraryView({ model }: { model: TimesLibraryModel }) {
  const t = getT().times;
  if (model.kind === "empty") {
    return (
      <>
        <Masthead variety={model.press.variety} />
        <StateMessage title={t.emptyTitle}>
          <p>{pickVariant(t.emptyBody, model.press.variety, SLOT.empty)}</p>
        </StateMessage>
      </>
    );
  }

  const { hero: heroEnglish, issues, filters, active, press } = model;
  const hero = heroEnglish && localizeIssue(heroEnglish, getLocale()); // IssueCard localizes the cards itself

  return (
    <>
      <Masthead variety={press.variety} />
      <PressNote press={press} />

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
              {pickVariant(t.latest, press.variety, SLOT.latest)(hero.gameweek)}
            </p>
            <h2 className={styles.heroTitle}>
              <English>{hero.title}</English>
            </h2>
            {hero.kicker ? <p className={styles.kicker}>{hero.kicker}</p> : null}
            {hero.summary ? <p className={styles.heroSummary}>{hero.summary}</p> : null}
            <p className={styles.facts}>
              {t.pages(hero.pageCount)} · {formatPublished(hero.published, getIntlLocale())}
            </p>
            <ButtonLink variant="solid" href={`/times/${hero.id}`}>
              {t.read}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {/* A filter between one type and "all" would offer nothing; it appears once there is more than one type. */}
      {filters.length > 2 ? (
        <nav aria-label={t.filterBy} className={styles.filters}>
          {filters.map((f) => (
            <ButtonLink key={f.label} size="sm" variant={f.active ? "solid" : "outline"} href={href(f.value)} aria-current={f.active ? "true" : undefined} scroll={false}>
              {f.value ? t.kindPlural[f.value] : t.all} <span className={styles.count}>{f.count}</span>
            </ButtonLink>
          ))}
        </nav>
      ) : null}

      {issues.length === 0 ? (
        <StateMessage title={t.noIssuesTitle} action={<ButtonLink href="/times">{t.showAll}</ButtonLink>}>
          <p>{pickVariant(t.noIssuesBody, press.variety, SLOT.empty)}</p>
        </StateMessage>
      ) : (
        <section aria-labelledby="issues-heading">
          {/* Always present, so the cards' h3s have an h2 above them in every state (filtered, no newspaper, ...). */}
          <h2 id="issues-heading" className={styles.archiveTitle}>
            {active ? t.kindPlural[active] : t.archive}
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
