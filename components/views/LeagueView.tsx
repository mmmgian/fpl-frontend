import { LiveRefresh, PageHeader, StateMessage, StatList, gameweekName, gameweekShort, getFormat, getT } from "@/components/ui";
import { refreshIntervalMs } from "@/lib/domain";
import type { LeagueModel } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { LeagueAwards } from "./LeagueAwards";
import { StandingsTable } from "./StandingsTable";
import { phaseLine, storyLines, vary } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

export function LeagueView({ model }: { model: LeagueModel }) {
  const t = getT().league;
  const f = getFormat();
  if (model.kind === "not-found") {
    return (
      <StateMessage tone="error" title={t.notFoundTitle} headingLevel={1}>
        <p>
          {t.notFoundLead(model.leagueId)}
          <code>LEAGUE_ID</code>
          {t.notFoundTail}
        </p>
      </StateMessage>
    );
  }

  const { gameweek, summary, rows, variety } = model;
  const names = new Map(rows.map((r) => [r.entry, r.entry_name]));
  const stories = summary ? storyLines(model.headlines, (entry) => names.get(entry) ?? "", variety) : [];
  const gap = model.headlines.find((h) => h.kind === "titleRace");
  return (
    <>
      <PageHeader
        centered
        title={model.name}
        meta={
          gameweek ? (
            <>
              <span>{gameweekName(gameweek.name)}</span>
              <GwStatusBadge status={gameweek.status} />
            </>
          ) : (
            <span>{t.preSeason}</span>
          )
        }
        actions={refreshFor(gameweek?.status)}
      />


      {!summary ? (
        <StateMessage title={t.emptyTitle}>
          <p>
            {vary(t.emptyBodies, variety)}
            {model.newEntries ? t.joined(model.newEntries) : ""}
          </p>
        </StateMessage>
      ) : (
        <>
          <StatList
            label={t.summary}
            items={[
              {
                label: t.leader,
                value: f.number(summary.leader.total),
                hint: gap?.kind === "titleRace" ? vary(t.leaderHint, variety, 1)(summary.leader.entryName, getT().common.points(gap.gap)) : summary.leader.entryName,
              },
              ...(summary.best && gameweek
                ? [{ label: t.best(gameweekShort(gameweek.name)), value: summary.best.total, hint: gameweek.status === "live" ? t.bestLive(summary.best.entryName) : summary.best.entryName }]
                : []),
              { label: t.managers, value: summary.managers, hint: model.truncated ? t.truncated : undefined },
            ]}
          />
          {stories.length || (gameweek && model.currentGw) ? (
            <section aria-label={t.storyLabel}>
              <p className={styles.story}>
                {gameweek && model.currentGw ? <span className={styles.storyPhase}>{phaseLine(gameweek.status, model.currentGw, variety)}</span> : null}
                {stories.map((line) => ` ${line}`).join("")}
              </p>
            </section>
          ) : null}
          {model.stats ? (
            <LeagueAwards awards={model.stats.awards} rows={rows} gw={model.stats.gw} phase={model.statsPhase} liveGw={model.currentGw} variety={variety} />
          ) : null}
          <StandingsTable rows={rows} caption={t.caption(model.name)} hideCaption zones stats={model.stats ?? undefined} variety={variety} />
        </>
      )}
    </>
  );
}

/** Poll every minute while live, and slowly while provisional so the table flips to final once FPL confirms it. */
function refreshFor(status: Parameters<typeof refreshIntervalMs>[0] | undefined) {
  const every = status ? refreshIntervalMs(status) : null;
  return every ? <LiveRefresh enabled intervalMs={every} /> : undefined;
}
