import Link from "next/link";
import { LocalTime, PageHeader, StateMessage } from "@/components/ui";
import type { SnapshotListItem } from "@/lib/services/models";
import styles from "./views.module.css";

export function HistoryListView({ snapshots }: { snapshots: SnapshotListItem[] }) {
  return (
    <>
      <PageHeader eyebrow="History" title="Past standings" meta={<span>The league table, frozen at the final whistle of each gameweek.</span>} />
      {snapshots.length === 0 ? (
        <StateMessage title="The archive is empty">
          <p>A snapshot is taken automatically once a gameweek is over and its bonus points are confirmed. Check back when the current one wraps up.</p>
        </StateMessage>
      ) : (
        <ul className={styles.snapshotList}>
          {snapshots.map((s) => (
            <li key={s.gw}>
              <Link href={`/history/${s.gw}`} className={styles.snapshotLink}>
                <span className={styles.snapshotGw}>GW{s.gw}</span>
                <span className={styles.snapshotDate}>
                  {s.rebuilt ? "Rebuilt" : "Saved"} <LocalTime iso={s.takenAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
