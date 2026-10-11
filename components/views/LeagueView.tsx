import { LiveRefresh, PageHeader, StateMessage, StatList } from "@/components/ui";
import { formatNumber } from "@/lib/domain";
import type { LeagueModel } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { LeagueAwards } from "./LeagueAwards";
import { StandingsTable } from "./StandingsTable";

export function LeagueView({ model }: { model: LeagueModel }) {
  if (model.kind === "not-found") {
    return (
      <StateMessage tone="error" title="League not found" headingLevel={1}>
        <p>
          FPL has no classic league with ID {model.leagueId}. Check the <code>LEAGUE_ID</code> environment variable.
        </p>
      </StateMessage>
    );
  }

  const { gameweek, summary, rows } = model;
  return (
    <>
      <PageHeader
        eyebrow={`Classic league · ID ${model.leagueId}`}
        title={model.name}
        meta={
          gameweek ? (
            <>
              <span>{gameweek.name}</span>
              <GwStatusBadge status={gameweek.status} />
            </>
          ) : (
            <span>Pre-season</span>
          )
        }
        actions={gameweek?.status === "live" ? <LiveRefresh enabled /> : undefined}
      />

      {!summary ? (
        <StateMessage title="The table is empty for now">
          <p>
            Standings appear after the first gameweek deadline.
            {model.newEntries ? ` ${model.newEntries} managers have joined so far.` : ""}
          </p>
        </StateMessage>
      ) : (
        <>
          <StatList
            label="League summary"
            items={[
              { label: "Leader", value: formatNumber(summary.leader.total), hint: summary.leader.entryName },
              ...(summary.best && gameweek
                ? [{ label: `Best ${gameweek.name.replace("Gameweek", "GW")}`, value: summary.best.total, hint: summary.best.entryName }]
                : []),
              { label: "Managers", value: summary.managers, hint: model.truncated ? "Showing first pages only" : undefined },
            ]}
          />
          {model.stats ? <LeagueAwards awards={model.stats.awards} rows={rows} gw={model.stats.gw} /> : null}
          <StandingsTable rows={rows} caption={`${model.name} standings`} hideCaption stats={model.stats ?? undefined} />
        </>
      )}
    </>
  );
}
