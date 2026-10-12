import Link from "next/link";
import type { ReactNode } from "react";
import { Crest, getT } from "@/components/ui";
import type { TeamIdentity } from "@/lib/services/models";
import styles from "./sheet.module.css";

export interface HeaderFact {
  label: string;
  value: ReactNode;
}

/**
 * The top of the manager page: who it is (avatar, team, manager) and a ruled row of facts, each a tinted label cell
 * beside its value, in the manner of a data sheet rather than a hero banner. The pager and live refresh sit to the right.
 */
export function TeamHeader({ team, facts = [], actions, gw }: { team: TeamIdentity; facts?: HeaderFact[]; actions?: ReactNode; gw?: number }) {
  const t = getT();
  return (
    <header className={styles.head}>
      <div className={styles.topRow}>
        <p className={styles.back}>
          <Link href="/">{t.common.leagueTable}</Link>
        </p>
        {team.league && (team.league.prev || team.league.next) ? (
          <nav className={styles.neighbours} aria-label={t.team.header.neighbours.label}>
            {team.league.prev ? (
              <Link
                href={`/team/${team.league.prev.entryId}${gw ? `?gw=${gw}` : ""}`}
                className={styles.neighbour}
                aria-label={t.team.header.neighbours.prev(team.league.prev.teamName, team.league.prev.rank)}
              >
                <span aria-hidden>←</span>
                <span className={styles.rank} aria-hidden>#{team.league.prev.rank}</span>
                <span className={styles.neighbourName} aria-hidden>{team.league.prev.teamName}</span>
              </Link>
            ) : null}
            {team.league.next ? (
              <Link
                href={`/team/${team.league.next.entryId}${gw ? `?gw=${gw}` : ""}`}
                className={styles.neighbour}
                aria-label={t.team.header.neighbours.next(team.league.next.teamName, team.league.next.rank)}
              >
                <span className={styles.neighbourName} aria-hidden>{team.league.next.teamName}</span>
                <span className={styles.rank} aria-hidden>#{team.league.next.rank}</span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
      <div className={styles.identity}>
        <span className={styles.avatar}>
          <Crest src={team.avatar} name={team.teamName} size={64} />
        </span>
        <div className={styles.names}>
          <h1 className={styles.title}>{team.teamName}</h1>
          <p className={styles.manager}>
            <span className={styles.tag}>{t.team.header.manager}</span>
            {team.manager}
          </p>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {facts.length ? (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
