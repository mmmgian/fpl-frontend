import Link from "next/link";
import { Crest, DataTable, Movement, type Column } from "@/components/ui";
import { rankMovement } from "@/lib/domain";
import type { StandingRow } from "@/lib/domain/types";
import styles from "./views.module.css";

interface StandingsTableProps {
  rows: StandingRow[];
  caption: string;
  hideCaption?: boolean;
  /** Link team names to /team/[entry]. Off for frozen history snapshots of past seasons. */
  linkTeams?: boolean;
  showMovement?: boolean;
  highlightEntry?: number;
}

export function StandingsTable({ rows, caption, hideCaption, linkTeams = true, showMovement = true, highlightEntry }: StandingsTableProps) {
  const columns: Column<StandingRow>[] = [
    {
      key: "rank",
      header: (
        <>
          <span aria-hidden="true">#</span>
          <span className="sr-only">Rank</span>
        </>
      ),
      width: showMovement ? "5.5rem" : "3.5rem",
      cell: (r) => (
        <span className={styles.rankCell}>
          <span className={styles.rank}>{r.rank}</span>
          {showMovement ? <Movement delta={rankMovement(r.rank, r.last_rank)} /> : null}
        </span>
      ),
    },
    {
      key: "team",
      header: "Team",
      rowHeader: true,
      cell: (r) => (
        <span className={styles.teamCell}>
          <Crest src={r.club_badge_src} name={r.entry_name} size={28} />
          <span className={styles.teamText}>
            {linkTeams ? (
              <Link href={`/team/${r.entry}`} className={styles.teamLink}>
                {r.entry_name}
              </Link>
            ) : (
              <span className={styles.teamName}>{r.entry_name}</span>
            )}
            <span className={styles.manager}>{r.player_name}</span>
          </span>
        </span>
      ),
    },
    { key: "gw", header: "GW", align: "end", width: "4.5rem", cell: (r) => r.event_total },
    { key: "total", header: "Total", align: "end", width: "5rem", cell: (r) => <strong>{r.total.toLocaleString("en-GB")}</strong> },
  ];

  return (
    <DataTable
      caption={caption}
      hideCaption={hideCaption}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.entry}
      isCurrentRow={highlightEntry ? (r) => r.entry === highlightEntry : undefined}
      empty="No managers in this league yet."
    />
  );
}
