import Link from "next/link";
import { LocalTime, PageHeader, StateMessage, getT } from "@/components/ui";
import type { SnapshotListItem } from "@/lib/services/models";
import styles from "./views.module.css";

export function HistoryListView({ snapshots }: { snapshots: SnapshotListItem[] }) {
  const t = getT();
  const h = t.history;
  return (
    <>
      <PageHeader eyebrow={h.eyebrow} title={h.title} meta={<span>{h.intro}</span>} />
      {snapshots.length === 0 ? (
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
    </>
  );
}
