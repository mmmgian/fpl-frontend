import Link from "next/link";
import { Crest, getT } from "@/components/ui";
import { entrySlugs, type Award, type StandingRow } from "@/lib/domain";
import { awardFigure, awardLine, awardTitle, tiedNote } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

/** The league's superlatives: who won the week, who is on fire, who is wasting the bench. Handed out by the numbers. */
export function LeagueAwards({ awards, rows, gw }: { awards: Award[]; rows: StandingRow[]; gw?: number }) {
  const byEntry = new Map(rows.map((r) => [r.entry, r]));
  const slugs = entrySlugs(rows.map((r) => ({ id: r.entry, name: r.entry_name })));
  const items = awards.flatMap((a) => {
    const row = byEntry.get(a.entry);
    return row ? [{ a, row }] : [];
  });
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="awards-title" className={styles.awards}>
      <h2 id="awards-title" className={styles.awardsTitle}>
        {getT().league.awardsHeading}
      </h2>
      <ul className={styles.awardList}>
        {items.map(({ a, row }) => (
          <li key={a.key} className={styles.award}>
            <p className={styles.awardName}>{awardTitle(a.key)}</p>
            <p className={styles.awardFigure}>{awardFigure(a)}</p>
            <p className={styles.awardWho}>
              <Crest src={row.club_badge_src} name={row.entry_name} size={22} />
              <Link href={`/team/${slugs.get(row.entry) ?? row.entry}`} className={styles.awardLink}>
                {row.entry_name}
              </Link>
            </p>
            <p className={styles.awardLine}>{awardLine(a, row.entry_name, gw)}</p>
            {tiedNote(a) ? <p className={styles.awardTie}>{tiedNote(a)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
