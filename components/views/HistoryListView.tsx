import Link from "next/link";
import { LocalTime, StateMessage, getT } from "@/components/ui";
import type { SnapshotListItem } from "@/lib/services/models";
import styles from "./views.module.css";

/**
 * The league table as it stood after each past gameweek: the second shelf of The Times, under the newspapers.
 * `null` means the history server could not be reached; the newspapers above it are still fine, so say so quietly.
 */
export function HistoryListView({ snapshots }: { snapshots: SnapshotListItem[] | null }) {
  const t = getT();
  const h = t.history;
  return (
    <section aria-labelledby="tables-heading" id="tables" className={styles.tables}>
      <h2 id="tables-heading" className={styles.tablesTitle}>
        {h.title}
      </h2>
      <p className={styles.tablesIntro}>{h.intro}</p>
      {snapshots === null ? (
        <StateMessage tone="info" title={t.client.errors.historyTitle}>
          <p>{t.client.errors.historyBody}</p>
        </StateMessage>
      ) : snapshots.length === 0 ? (
        <StateMessage title={h.emptyTitle}>
          <p>{h.emptyBody}</p>
        </StateMessage>
      ) : (
        <ul className={styles.snapshotList}>
          {snapshots.map((s) => (
            <li key={s.gw}>
              <Link href={`/history/${s.gw}`} className={styles.snapshotLink}>
                <span className={styles.snapshotGw}>{t.common.gw(s.gw)}</span>
                <span className={styles.snapshotDate}>
                  {s.rebuilt ? h.rebuilt : h.saved} <LocalTime iso={s.takenAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
