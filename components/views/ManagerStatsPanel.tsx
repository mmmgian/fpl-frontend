import { MiniBars, getFormat, getT } from "@/components/ui";
import type { ManagerStats } from "@/lib/domain";
import { streakLabel } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

/**
 * The "Stats" pill in a team's cell. It is a real checkbox (keyboard and screen-reader friendly, no script): ticking
 * it reveals the full-width detail row under the team, which the table holds hidden until then.
 */
export function StatsToggle({ teamName }: { teamName: string }) {
  const t = getT().table;
  return (
    <label className={styles.toggle}>
      <input type="checkbox" data-expand="" className={styles.toggleInput} />
      <span className={styles.togglePill} aria-hidden="true">
        {t.stats}
      </span>
      <span className="sr-only">{t.showStats(teamName)}</span>
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
  const t = getT();
  const s = t.stats;
  const f = getFormat();
  const streak = comparable ? streakLabel(stats) : null;
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;
  const chips = stats.chips.length ? stats.chips.map((c) => `${chipName(c.name)} (${t.common.gw(c.event)})`).join(", ") : s.noChips;
  const form = stats.form.map((v, i) => s.formEntry(t.common.gw(stats.formGws[i]), v)).join(", ");
  return (
    <section className={styles.panel} aria-label={s.region(teamName)}>
      <div className={styles.chart}>
        <MiniBars
          values={stats.form}
          labels={stats.formGws.map((g) => t.common.gw(g))}
          reference={stats.average}
          showValues
          showLabels
          height={56}
          barWidth={28}
          label={s.chart(form, f.oneDecimal(stats.average))}
        />
        <p className={styles.legend}>{s.legend}</p>
        {streak ? <p className={styles.streak}>{streak}</p> : null}
      </div>
      <dl className={styles.facts}>
        <Fact label={s.average}>{f.oneDecimal(stats.average)}</Fact>
        <Fact label={s.best}>
          {stats.best.points} <small>{t.common.gw(stats.best.gw)}</small>
        </Fact>
        <Fact label={s.worst}>
          {stats.worst.points} <small>{t.common.gw(stats.worst.gw)}</small>
        </Fact>
        <Fact label={s.behindLeader}>{stats.behindLeader === 0 ? s.leading : s.pts(stats.behindLeader)}</Fact>
        {stats.behindNext !== null ? <Fact label={s.behindNext}>{stats.behindNext === 0 ? s.level : s.pts(stats.behindNext)}</Fact> : null}
        <Fact label={s.teamValue}>{f.money(stats.value)}</Fact>
        <Fact label={s.bank}>{f.money(stats.bank)}</Fact>
        <Fact label={s.benchPoints}>{stats.benchPoints}</Fact>
        <Fact label={s.hits}>{stats.hitPoints === 0 ? s.none : s.hitsValue(stats.hitPoints, stats.transfers)}</Fact>
        <Fact label={s.overall}>
          {f.rank(stats.overallRank)}
          {stats.overallMoved ? <small> {stats.overallMoved > 0 ? `▲${f.number(stats.overallMoved)}` : `▼${f.number(Math.abs(stats.overallMoved))}`}</small> : null}
        </Fact>
        <Fact label={s.chipsPlayed}>{chips}</Fact>
      </dl>
    </section>
  );
}
