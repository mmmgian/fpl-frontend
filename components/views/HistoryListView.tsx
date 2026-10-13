import Link from "next/link";
import { Badge, LocalTime, SnapshotNudge, StateMessage, getT } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { HistoryShelfModel, SnapshotListItem } from "@/lib/services/models";
import styles from "./views.module.css";

/** Slots for the shelf's lines, so the intro, the status line and the empty state don't change in step. */
const SLOT = { lede: 1, status: 2, empty: 3 } as const;

/**
 * The league table as it stood after each past gameweek: the second shelf of The Times, under the newspapers.
 * `null` means the history server could not be reached; the newspapers above it are still fine, so say so quietly.
 * `shelf` (optional) says where the season stands: the newest table is marked as the latest final one, and a finished
 * gameweek that isn't filed yet is named. Without it the shelf just lists.
 */
export function HistoryListView({ snapshots, shelf }: { snapshots: SnapshotListItem[] | null; shelf?: HistoryShelfModel }) {
  const t = getT();
  const h = t.history;
  const v = shelf?.variety ?? 0;
  const status = shelf?.status;
  const latest = snapshots?.[0]?.gw ?? null;
  const intro = snapshots?.length && latest !== null && shelf ? pickVariant(h.lede, v, SLOT.lede)(latest, snapshots.length) : h.intro;
  const statusLine =
    !status || status.gw === null ? null
    : status.phase === "live" ? pickVariant(h.live, v, SLOT.status)(status.gw)
    : status.pending ? pickVariant(h.pending, v, SLOT.status)(status.gw)
    : latest !== null && latest === status.gw ? pickVariant(h.filed, v, SLOT.status)(status.gw)
    : null;
  return (
    <section aria-labelledby="tables-heading" id="tables" className={styles.tables}>
      <h2 id="tables-heading" className={styles.tablesTitle}>
        {h.title}
      </h2>
      {status?.pending && (status.phase === "final" || status.phase === "over") ? <SnapshotNudge gw={status.gw} /> : null}
      <p className={styles.tablesIntro}>
        {intro}
        {statusLine && snapshots !== null ? <> {statusLine}</> : null}
      </p>
      {snapshots === null ? (
        <StateMessage tone="info" title={t.client.errors.historyTitle}>
          <p>{t.client.errors.historyBody}</p>
        </StateMessage>
      ) : snapshots.length === 0 ? (
        <StateMessage title={h.emptyTitle}>
          <p>{pickVariant(h.emptyBody, v, SLOT.empty)}</p>
        </StateMessage>
      ) : (
        <ul className={styles.snapshotList}>
          {snapshots.map((s, i) => (
            <li key={s.gw}>
              <Link href={`/history/${s.gw}`} className={styles.snapshotLink}>
                <span className={styles.snapshotGw}>
                  {t.common.gw(s.gw)}
                  {i === 0 && shelf ? (
                    <>
                      {" "}
                      <Badge tone="accent">{h.latest}</Badge>
                    </>
                  ) : null}
                </span>
                {s.takenAt ? (
                  <span className={styles.snapshotDate}>
                    {s.rebuilt ? h.rebuilt : h.saved} <LocalTime iso={s.takenAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                  </span>
                ) : s.rebuilt ? (
                  <span className={styles.snapshotDate}>{h.rebuilt}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
