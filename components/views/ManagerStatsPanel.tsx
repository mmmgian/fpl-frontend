import { MiniBars } from "@/components/ui";
import { CHIP_LABEL, formatMoney, formatRank, type ManagerStats } from "@/lib/domain";
import { streakLabel } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * The "Stats" pill in a team's cell. It is a real checkbox (keyboard and screen-reader friendly, no script): ticking
 * it reveals the full-width detail row under the team, which the table holds hidden until then.
 */
export function StatsToggle({ teamName }: { teamName: string }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" data-expand="" className={styles.toggleInput} />
      <span className={styles.togglePill} aria-hidden="true">
        Stats
      </span>
      <span className="sr-only">Show stats for {teamName}</span>
    </label>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One team's full breakdown: the weekly bars with every number, then the facts. */
export function ManagerStatsDetail({ stats, teamName, comparable = true }: { stats: ManagerStats; teamName: string; comparable?: boolean }) {
  const streak = comparable ? streakLabel(stats) : null;
  const chips = stats.chips.length ? stats.chips.map((c) => `${CHIP_LABEL[c.name] ?? c.name} (GW${c.event})`).join(", ") : "None yet";
  const form = stats.form.map((v, i) => `GW${stats.formGws[i]} ${v}`).join(", ");
  return (
    <section className={styles.panel} aria-label={`Stats for ${teamName}`}>
      <div className={styles.chart}>
        <MiniBars
          values={stats.form}
          labels={stats.formGws.map((g) => `GW${g}`)}
          reference={stats.average}
          showValues
          showLabels
          height={56}
          barWidth={28}
          label={`Points after hits, latest gameweeks: ${form}. Season average ${oneDecimal(stats.average)}.`}
        />
        <p className={styles.legend}>Points after hits. Dashed line: their season average.</p>
        {streak ? <p className={styles.streak}>{streak}</p> : null}
      </div>
      <dl className={styles.facts}>
        <Fact label="Season average">{oneDecimal(stats.average)}</Fact>
        <Fact label="Best week">
          {stats.best.points} <small>GW{stats.best.gw}</small>
        </Fact>
        <Fact label="Worst week">
          {stats.worst.points} <small>GW{stats.worst.gw}</small>
        </Fact>
        <Fact label="Behind the leader">{stats.behindLeader === 0 ? "Leading" : `${stats.behindLeader} pts`}</Fact>
        {stats.behindNext !== null ? <Fact label="Behind the team above">{stats.behindNext === 0 ? "Level on points" : `${stats.behindNext} pts`}</Fact> : null}
        <Fact label="Team value">{formatMoney(stats.value)}</Fact>
        <Fact label="Of which in the bank">{formatMoney(stats.bank)}</Fact>
        <Fact label="Bench points">{stats.benchPoints}</Fact>
        <Fact label="Transfer hits">{stats.hitPoints === 0 ? "None" : `−${stats.hitPoints} pts (${stats.transfers} transfers)`}</Fact>
        <Fact label="Overall rank">
          {formatRank(stats.overallRank)}
          {stats.overallMoved ? <small> {stats.overallMoved > 0 ? `▲${stats.overallMoved.toLocaleString("en-GB")}` : `▼${Math.abs(stats.overallMoved).toLocaleString("en-GB")}`}</small> : null}
        </Fact>
        <Fact label="Chips played">{chips}</Fact>
      </dl>
    </section>
  );
}
