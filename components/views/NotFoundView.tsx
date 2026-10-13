import Link from "next/link";
import { ButtonLink, StateMessage, getT } from "@/components/ui";
import styles from "./views.module.css";

export type TeamPick = { slug: string; teamName: string; manager: string };

/**
 * A team link that no longer resolves. Team URLs follow the team's name, so the usual cause is a manager renaming
 * their team after the link was shared: say so, and offer the league's teams so the reader is one tap from the right one.
 * `teams` is null when the league table can't be read; then the page just points at the table.
 */
export function TeamNotFound({ teams }: { teams: readonly TeamPick[] | null }) {
  const t = getT();
  const n = t.notFound.team;
  return (
    <div className={styles.notFound}>
      <StateMessage headingLevel={1} title={n.title} action={<ButtonLink href="/">{n.table}</ButtonLink>}>
        <p>{n.body}</p>
      </StateMessage>
      {teams?.length ? (
        <section aria-labelledby="pick-heading" className={styles.tables}>
          <h2 id="pick-heading" className={styles.tablesTitle}>
            {n.pick}
          </h2>
          <ul className={styles.snapshotList}>
            {teams.map((team) => (
              <li key={team.slug}>
                <Link href={`/team/${team.slug}`} className={styles.snapshotLink}>
                  <span className={styles.pickName}>{team.teamName}</span>
                  {team.manager ? <span className={styles.snapshotDate}>{team.manager}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** An issue of The Times that isn't on the shelf: send the reader back to the front page, not to the league table. */
export function TimesNotFound() {
  const t = getT();
  return (
    <StateMessage headingLevel={1} title={t.notFound.times.title} action={<ButtonLink href="/times">{t.times.back}</ButtonLink>}>
      <p>{t.notFound.times.body}</p>
    </StateMessage>
  );
}
