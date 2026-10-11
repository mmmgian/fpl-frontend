import Link from "next/link";
import { Badge, Crest, DataTable, MiniBars, Movement, type Column } from "@/components/ui";
import { formatMoney, rankMovement, type LeagueStats, type ManagerStats } from "@/lib/domain";
import type { StandingRow } from "@/lib/domain/types";
import { ManagerStatsDetail, StatsToggle } from "./ManagerStatsPanel";
import extras from "./leagueExtras.module.css";
import styles from "./views.module.css";

const CHIP_SHORT: Record<string, string> = { wildcard: "WC", freehit: "FH", bboost: "BB", "3xc": "TC", manager: "AM" };
const CHIP_FULL: Record<string, string> = { wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain", manager: "Assistant Manager" };

/** Badges that say something about a team's week or run. At most two, so a row stays tidy. */
function RowBadges({ s, gw }: { s: ManagerStats; gw: number }) {
  const badges = [];
  if (s.weekRank === 1 && s.weekPoints > 0) badges.push(<Badge key="week" tone="accent" srLabel={`Won gameweek ${gw}, the latest finished week`}>GW{gw} winner</Badge>);
  if (s.streak?.kind === "hot") badges.push(<Badge key="streak" tone="positive" srLabel={`On a hot streak: ${s.streak.length} weeks above the league average`}>Hot ×{s.streak.length}</Badge>);
  if (s.streak?.kind === "cold" && badges.length < 2) badges.push(<Badge key="streak" tone="neutral" srLabel={`In a cold spell: ${s.streak.length} weeks below the league average`}>Cold ×{s.streak.length}</Badge>);
  return badges.length ? <span className={extras.badges}>{badges.slice(0, 2)}</span> : null;
}

const formLabel = (s: ManagerStats) => `Latest ${s.form.length} gameweeks after hits: ${s.form.join(", ")}`;

interface StandingsTableProps {
  rows: StandingRow[];
  caption: string;
  hideCaption?: boolean;
  /** Link team names to /team/[entry]. Off for frozen history snapshots of past seasons. */
  linkTeams?: boolean;
  showMovement?: boolean;
  highlightEntry?: number;
  /** Per-manager extras from the league service. Left out for frozen history tables. */
  stats?: Pick<LeagueStats, "byEntry" | "comparable" | "gw">;
}

export function StandingsTable({ rows, caption, hideCaption, linkTeams = true, showMovement = true, highlightEntry, stats: leagueExtras }: StandingsTableProps) {
  const stats = leagueExtras?.byEntry;
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
          <span className={styles.rank}>
            {r.rank}
            {r.rank_approximate ? (
              <>
                <span aria-hidden="true" title="Order between managers level on points and overall rank is approximate">
                  ≈
                </span>
                <span className="sr-only"> (approximate)</span>
              </>
            ) : null}
          </span>
          {showMovement ? <Movement delta={rankMovement(r.rank, r.last_rank)} approximate={r.rank_approximate === true || r.last_rank_approximate === true} /> : null}
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
            {stats?.[r.entry] ? (
              <>
                {leagueExtras?.comparable ? <RowBadges s={stats[r.entry]} gw={leagueExtras.gw} /> : null}
                <span className={extras.mobileForm}>
                  <MiniBars values={stats[r.entry].form} label={formLabel(stats[r.entry])} />
                </span>
                <StatsToggle teamName={r.entry_name} />
              </>
            ) : null}
          </span>
        </span>
      ),
    },
    ...(stats
      ? ([
          {
            key: "form",
            header: "Form",
            hideBelow: "md",
            width: "6rem",
            cell: (r) => (stats[r.entry] ? <MiniBars values={stats[r.entry].form} reference={stats[r.entry].average} label={formLabel(stats[r.entry])} /> : <span className={extras.muted}>–</span>),
          },
          { key: "value", header: "Value", align: "end", hideBelow: "md", width: "5.5rem", cell: (r) => (stats[r.entry] ? <span className={extras.num}>{formatMoney(stats[r.entry].value)}</span> : "–") },
          { key: "bench", header: "Bench", align: "end", hideBelow: "md", width: "4.5rem", cell: (r) => (stats[r.entry] ? <span className={extras.num}>{stats[r.entry].benchPoints}</span> : "–") },
          {
            key: "hits",
            header: "Hits",
            align: "end",
            hideBelow: "md",
            width: "4.5rem",
            cell: (r) => (stats[r.entry] ? stats[r.entry].hitPoints === 0 ? <span className={extras.muted}>–</span> : <span className={extras.num}>−{stats[r.entry].hitPoints}</span> : "–"),
          },
          {
            key: "chips",
            header: "Chips",
            hideBelow: "md",
            width: "7rem",
            cell: (r) =>
              stats[r.entry]?.chips.length ? (
                <span className={extras.num}>
                  {stats[r.entry].chips.map((c, i) => (
                    <span key={`${c.name}-${c.event}`}>
                      {i > 0 ? ", " : ""}
                      <span aria-hidden="true" title={`${CHIP_FULL[c.name] ?? c.name}, GW${c.event}`}>{CHIP_SHORT[c.name] ?? c.name}</span>
                      <span className="sr-only">{CHIP_FULL[c.name] ?? c.name}, gameweek {c.event}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className={extras.muted}>–</span>
              ),
          },
        ] satisfies Column<StandingRow>[])
      : []),
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
      detail={stats ? (r) => (stats[r.entry] ? <ManagerStatsDetail stats={stats[r.entry]} teamName={r.entry_name} comparable={leagueExtras?.comparable} /> : null) : undefined}
      empty="No managers in this league yet."
    />
  );
}
