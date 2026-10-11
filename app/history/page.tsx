import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime, PageHeader, StateMessage } from "@/components/ui";
import styles from "@/components/views/views.module.css";
import { listSnapshots } from "@/lib/backend";
import { leagueId } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // free Render instance can take ~40s to wake
export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const snapshots = await listSnapshots(leagueId());

  return (
    <>
      <PageHeader eyebrow="History" title="Past standings" meta={<span>The table as it stood at the end of each gameweek.</span>} />
      {snapshots.length === 0 ? (
        <StateMessage title="No snapshots yet">
          <p>A snapshot is saved automatically once a gameweek is over and bonus points are confirmed. Check back after the current gameweek.</p>
        </StateMessage>
      ) : (
        <ul className={styles.snapshotList}>
          {[...snapshots].reverse().map((s) => (
            <li key={s.gw}>
              <Link href={`/history/${s.gw}`} className={styles.snapshotLink}>
                <span className={styles.snapshotGw}>GW{s.gw}</span>
                <span className={styles.snapshotDate}>
                  Saved <LocalTime iso={s.taken_at} options={{ day: "numeric", month: "short", year: "numeric" }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
