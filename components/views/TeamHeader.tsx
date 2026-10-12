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
export function TeamHeader({ team, facts = [], actions }: { team: TeamIdentity; facts?: HeaderFact[]; actions?: ReactNode }) {
  const t = getT();
  return (
    <header className={styles.head}>
      <p className={styles.back}>
        <Link href="/">{t.common.leagueTable}</Link>
      </p>
      <div className={styles.identity}>
        <span className={styles.avatar}>
          <Crest src={team.avatar} name={team.teamName} size={72} />
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
