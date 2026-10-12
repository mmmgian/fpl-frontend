import { MiniBars, getFormat, getT, isTrip } from "@/components/ui";
import { daresFor, type ManagerStats, type SquadWeek } from "@/lib/domain";
import { dareLine, streakLabel } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

/**
 * The "Stats" pill in a team's cell. It is a real checkbox (keyboard and screen-reader friendly, no script): ticking
 * it reveals the full-width detail row under the team, which the table holds hidden until then.
 */
export function StatsToggle({ teamName }: { teamName: string }) {
  const t = getT();
  const trip = isTrip();
  return (
    <label className={styles.toggle}>
      <input type="checkbox" data-expand="" className={styles.toggleInput} />
      <span className={trip ? `${styles.togglePill} ${styles.togglePillTrip}` : styles.togglePill} aria-hidden="true">
        {trip ? t.blotter.toggle : t.table.stats}
      </span>
      <span className="sr-only">{trip ? t.blotter.showStats(teamName) : t.table.showStats(teamName)}</span>
    </label>
  );
}

function Fact({ label, children, keepCase = false }: { label: string; children: React.ReactNode; keepCase?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt className={keepCase ? styles.keepCase : undefined}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One team's full breakdown: the weekly bars with every number, then the facts. */
export function ManagerStatsDetail({ stats, teamName, comparable = true, squad }: { stats: ManagerStats; teamName: string; comparable?: boolean; squad?: SquadWeek }) {
  const t = getT();
  const trip = isTrip();
  // The altered view relabels the facts (same figures, same order); everything not relabelled falls back to the plain words.
  const s = trip ? { ...t.stats, ...t.blotter } : t.stats;
  const f = getFormat();
  const latestGw = stats.formGws.at(-1) ?? 1;
  const dares = trip && comparable ? daresFor(stats, latestGw) : [];
  const streak = comparable ? streakLabel(stats) : null;
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;
  const chips = stats.chips.length ? stats.chips.map((c) => `${chipName(c.name)} (${t.common.gw(c.event)})`).join(", ") : s.noChips;
  const form = stats.form.map((v, i) => s.formEntry(t.common.gw(stats.formGws[i]), v)).join(", ");
  return (
    <section className={trip ? `${styles.panel} ${styles.mind}` : styles.panel} aria-label={trip ? t.blotter.heading(teamName) : s.region(teamName)}>
      {trip ? <h3 className={styles.mindTitle}>{t.blotter.heading(teamName)}</h3> : null}
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
        {squad ? <p className={styles.legend}>{s.squadNote(t.common.gw(squad.gw))}</p> : null}
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
        {squad ? (
          <>
            <Fact label={s.xg} keepCase>{f.oneDecimal(squad.xg)}</Fact>
            <Fact label={s.xa} keepCase>{f.oneDecimal(squad.xa)}</Fact>
            {squad.defcon !== null && squad.defconPoints !== null ? (
              <Fact label={s.defcon} keepCase>
                {squad.defconUnsure > 0 ? (
                  <>
                    <span className="sr-only">{s.atLeast} </span>
                    {squad.defcon}+
                  </>
                ) : (
                  squad.defcon
                )}{" "}
                <small>{s.defconPts(squad.defconPoints)}</small>
              </Fact>
            ) : null}
          </>
        ) : null}
        <Fact label={s.hits}>{stats.hitPoints === 0 ? s.none : s.hitsValue(stats.hitPoints, stats.transfers)}</Fact>
        <Fact label={s.overall}>
          {f.rank(stats.overallRank)}
          {stats.overallMoved ? <small> {stats.overallMoved > 0 ? `▲${f.number(stats.overallMoved)}` : `▼${f.number(Math.abs(stats.overallMoved))}`}</small> : null}
        </Fact>
        <Fact label={s.chipsPlayed}>{chips}</Fact>
      </dl>
      {dares.length ? (
        <div className={styles.dares}>
          <h4 className={styles.daresTitle}>{t.blotter.daresHeading}</h4>
          <ol className={styles.dareList}>
            {dares.map((d) => (
              <li key={d.key} className={styles.dare}>
                {dareLine(d)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
