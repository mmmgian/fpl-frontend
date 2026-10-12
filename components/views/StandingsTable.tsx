import Link from "next/link";
import { Badge, Crest, DataTable, MiniBars, Movement, getFormat, getT, type Column } from "@/components/ui";
import { entrySlugs, rankMovement, zoneOf, type LeagueStats, type ManagerStats } from "@/lib/domain";
import type { StandingRow } from "@/lib/domain/types";
import { ManagerStatsDetail, StatsToggle } from "./ManagerStatsPanel";
import extras from "./leagueExtras.module.css";
import styles from "./views.module.css";

/** Badges that say something about a team's week or run. At most two, so a row stays tidy. */
function RowBadges({ s, gw }: { s: ManagerStats; gw: number }) {
  const t = getT().table;
  const badges = [];
  if (s.weekRank === 1 && s.weekPoints > 0) badges.push(<Badge key="week" tone="accent" srLabel={t.winnerSr(gw)}>{t.winner(gw)}</Badge>);
  if (s.streak?.kind === "hot") badges.push(<Badge key="streak" tone="positive" srLabel={t.hotSr(s.streak.length)}>{t.hot(s.streak.length)}</Badge>);
  if (s.streak?.kind === "cold" && badges.length < 2) badges.push(<Badge key="streak" tone="neutral" srLabel={t.coldSr(s.streak.length)}>{t.cold(s.streak.length)}</Badge>);
  return badges.length ? <span className={extras.badges}>{badges.slice(0, 2)}</span> : null;
}


interface StandingsTableProps {
  rows: StandingRow[];
  caption: string;
  hideCaption?: boolean;
  /** Link team names to /team/[entry]. Off for frozen history snapshots of past seasons. */
  linkTeams?: boolean;
  showMovement?: boolean;
  highlightEntry?: number;
  /** Tint the top four green, fifth and sixth amber and the bottom four red, with a key above the table. */
  zones?: boolean;
  /** Per-manager extras from the league service. Left out for frozen history tables. */
  stats?: Pick<LeagueStats, "byEntry" | "comparable" | "gw" | "squad">;
}

export function StandingsTable({ rows, caption, hideCaption, linkTeams = true, showMovement = true, highlightEntry, zones = false, stats: leagueExtras }: StandingsTableProps) {
  const t = getT();
  const tt = t.table;
  const f = getFormat();
  const stats = leagueExtras?.byEntry;
  const slugs = entrySlugs(rows.map((r) => ({ id: r.entry, name: r.entry_name })));
  const formLabel = (s: ManagerStats) => tt.formLabel(s.form.length, s.form.join(", "));
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;
  const columns: Column<StandingRow>[] = [
    {
      key: "rank",
      header: (
        <>
          <span aria-hidden="true">#</span>
          <span className="sr-only">{tt.rank}</span>
        </>
      ),
      width: showMovement ? "5.5rem" : "3.5rem",
      cell: (r) => (
        <span className={styles.rankCell}>
          <span className={styles.rank}>
            {r.rank}
            {zones && zoneOf(r.rank, rows.length) ? <span className="sr-only"> ({tt.zones[zoneOf(r.rank, rows.length)!]})</span> : null}
            {r.rank_approximate ? (
              <>
                <span aria-hidden="true" title={tt.approxTitle}>
                  ≈
                </span>
                <span className="sr-only">{tt.approxSr}</span>
              </>
            ) : null}
          </span>
          {showMovement ? <Movement delta={rankMovement(r.rank, r.last_rank)} approximate={r.rank_approximate === true || r.last_rank_approximate === true} /> : null}
        </span>
      ),
    },
    {
      key: "team",
      header: tt.team,
      rowHeader: true,
      cell: (r) => (
        <span className={styles.teamCell}>
          <Crest src={r.club_badge_src} name={r.entry_name} size={28} />
          <span className={styles.teamText}>
            {linkTeams ? (
              <Link href={`/team/${slugs.get(r.entry) ?? r.entry}`} className={styles.teamLink}>
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
            header: tt.form,
            hideBelow: "md",
            width: "6rem",
            cell: (r) => (stats[r.entry] ? <MiniBars values={stats[r.entry].form} reference={stats[r.entry].average} label={formLabel(stats[r.entry])} /> : <span className={extras.muted}>–</span>),
          },
          { key: "value", header: tt.value, align: "end", hideBelow: "md", width: "5.5rem", cell: (r) => (stats[r.entry] ? <span className={extras.num}>{f.money(stats[r.entry].value)}</span> : "–") },
          { key: "bench", header: tt.bench, align: "end", hideBelow: "md", width: "4.5rem", cell: (r) => (stats[r.entry] ? <span className={extras.num}>{stats[r.entry].benchPoints}</span> : "–") },
          {
            key: "hits",
            header: tt.hits,
            align: "end",
            hideBelow: "md",
            width: "4.5rem",
            cell: (r) => (stats[r.entry] ? stats[r.entry].hitPoints === 0 ? <span className={extras.muted}>–</span> : <span className={extras.num}>−{stats[r.entry].hitPoints}</span> : "–"),
          },
          {
            key: "chips",
            header: tt.chips,
            hideBelow: "md",
            width: "7rem",
            cell: (r) =>
              stats[r.entry]?.chips.length ? (
                <span className={extras.num}>
                  {stats[r.entry].chips.map((c, i) => (
                    <span key={`${c.name}-${c.event}`}>
                      {i > 0 ? ", " : ""}
                      <span aria-hidden="true" title={tt.chipTitle(chipName(c.name), c.event)}>{tt.chipShort[c.name] ?? c.name}</span>
                      <span className="sr-only">{tt.chipSr(chipName(c.name), c.event)}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className={extras.muted}>–</span>
              ),
          },
        ] satisfies Column<StandingRow>[])
      : []),
    { key: "gw", header: tt.gw, align: "end", width: "4.5rem", cell: (r) => r.event_total },
    { key: "total", header: tt.total, align: "end", width: "5rem", cell: (r) => <strong>{f.number(r.total)}</strong> },
  ];

  const table = (
    <DataTable
      caption={caption}
      hideCaption={hideCaption}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.entry}
      isCurrentRow={highlightEntry ? (r) => r.entry === highlightEntry : undefined}
      rowTone={zones ? (r) => zoneOf(r.rank, rows.length) : undefined}
      detail={stats ? (r) => (stats[r.entry] ? <ManagerStatsDetail stats={stats[r.entry]} teamName={r.entry_name} comparable={leagueExtras?.comparable} squad={leagueExtras?.squad?.[r.entry]} /> : null) : undefined}
      empty={tt.empty}
    />
  );
  if (!zones || !zoneOf(1, rows.length)) return table;
  return (
    <div className={extras.zoned}>
      <ul className={extras.zoneKey} aria-label={tt.zonesLabel}>
        <li data-zone="good">{tt.zones.good}</li>
        <li data-zone="warn">{tt.zones.warn}</li>
        <li data-zone="bad">{tt.zones.bad}</li>
      </ul>
      {table}
    </div>
  );
}
