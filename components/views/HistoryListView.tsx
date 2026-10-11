import Link from "next/link";
import { LocalTime, PageHeader, StateMessage } from "@/components/ui";
import type { SnapshotListItem } from "@/lib/services/models";
import styles from "./views.module.css";

export function HistoryListView({ snapshots }: { snapshots: SnapshotListItem[] }) {
  return (
    <>
      <PageHeader eyebrow="History" title="Past standings" meta={<span>The table as it stood at the end of each gameweek.</span>} />
      {snapshots.length === 0 ? (
        <StateMessage title="No snapshots yet">
          <p>A snapshot is saved automatically once a gameweek is over and bonus points are confirmed. Check back after the current gameweek.</p>
        </StateMessage>
      ) : (
        <ul className={styles.snapshotList}>
          {snapshots.map((s) => (
            <li key={s.gw}>
              <Link href={`/history/${s.gw}`} className={styles.snapshotLink}>
                <span className={styles.snapshotGw}>GW{s.gw}</span>
                <span className={styles.snapshotDate}>
                  Saved <LocalTime iso={s.takenAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
