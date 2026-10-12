import { LiveRefresh, PageHeader, StateMessage, StatList, gameweekName, gameweekShort, getFormat, getT } from "@/components/ui";
import type { LeagueModel } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { LeagueAwards } from "./LeagueAwards";
import { StandingsTable } from "./StandingsTable";

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

  const { gameweek, summary, rows } = model;
  return (
    <>
      <PageHeader
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
        actions={gameweek?.status === "live" ? <LiveRefresh enabled /> : undefined}
      />


      {!summary ? (
        <StateMessage title={t.emptyTitle}>
          <p>
            {t.emptyBody}
            {model.newEntries ? t.joined(model.newEntries) : ""}
          </p>
        </StateMessage>
      ) : (
        <>
          <StatList
            label={t.summary}
            items={[
              { label: t.leader, value: f.number(summary.leader.total), hint: summary.leader.entryName },
              ...(summary.best && gameweek
                ? [{ label: t.best(gameweekShort(gameweek.name)), value: summary.best.total, hint: summary.best.entryName }]
                : []),
              { label: t.managers, value: summary.managers, hint: model.truncated ? t.truncated : undefined },
            ]}
          />
          {model.stats ? <LeagueAwards awards={model.stats.awards} rows={rows} gw={model.stats.gw} /> : null}
          <StandingsTable rows={rows} caption={t.caption(model.name)} hideCaption zones stats={model.stats ?? undefined} />
        </>
      )}
    </>
  );
}
