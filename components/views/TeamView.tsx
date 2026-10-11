import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage, StatList } from "@/components/ui";
import { CHIP_LABEL, formatMoney, formatNumber, formatRank } from "@/lib/domain";
import type { TeamGameweek, TeamIdentity, TeamModel, TeamSummary } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { MatchdayInsights, SeasonInsightsView } from "./TeamInsightsView";
import { TeamSheetView } from "./TeamSheetView";

type TeamState = Exclude<TeamModel, { kind: "not-found" }>;

const backLink = <Link href="/">← League table</Link>;

const header = (team: TeamIdentity, meta?: ReactNode, actions?: ReactNode) => (
  <PageHeader back={backLink} eyebrow={team.manager} title={team.teamName} meta={meta} actions={actions} />
);

/** "Playing since 2019 · 7 earlier seasons": the original's line under the manager's name, with the count made exact. */
const experience = (season: { tenure: { seasons: number; firstSeason: string | null } } | null) =>
  season && season.tenure.firstSeason ? (
    <span>
      Playing since {season.tenure.firstSeason.split("/")[0]} · {season.tenure.seasons} earlier {season.tenure.seasons === 1 ? "season" : "seasons"}
    </span>
  ) : null;

const pagerFor = (team: TeamIdentity, gw: TeamGameweek) => (
  <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={(n) => `/team/${team.entryId}?gw=${n}`} />
);

function Summary({ summary, isLive, gameweekName }: { summary: TeamSummary; isLive: boolean; gameweekName: string }) {
  const { hit } = summary;
  return (
    <StatList
      label={`${gameweekName} summary`}
      items={[
        {
          label: isLive ? "GW points (live)" : "GW points",
          value: summary.gwPoints,
          hint: [hit ? `incl. −${hit} hit` : null, isLive ? "before auto-subs" : null].filter(Boolean).join(" · ") || undefined,
        },
        { label: "Total", value: formatNumber(summary.total) },
        { label: "Overall rank", value: formatRank(summary.overallRank) },
        { label: "Transfers", value: summary.transfers, hint: hit ? `−${hit} pts` : "no hit" },
        { label: "Team value", value: formatMoney(summary.value), hint: `${formatMoney(summary.bank)} in the bank` },
      ]}
    />
  );
}

export function TeamView({ model }: { model: TeamState }) {
  const { team } = model;

  switch (model.kind) {
    case "no-season":
      return (
        <>
          {header(team)}
          <StateMessage title="The season hasn't started">
            <p>Team sheets appear after the Gameweek 1 deadline.</p>
          </StateMessage>
        </>
      );

    case "not-started":
      return (
        <>
          {header(team)}
          <StateMessage title={`${team.teamName} starts in Gameweek ${model.startedEvent}`}>
            <p>This team joined after the {model.deadlineName} deadline, so there&apos;s no team sheet yet.</p>
          </StateMessage>
        </>
      );

    case "no-picks": {
      const gw = model.gameweek;
      const meta = (
        <>
          <span>{gw.name}</span>
          <GwStatusBadge status={gw.status} />
        </>
      );
      return (
        <>
          {header(team, meta, pagerFor(team, gw))}
          <StateMessage title={`No team sheet for ${gw.name}`}>
            <p>FPL has no picks for this team in that gameweek.</p>
          </StateMessage>
        </>
      );
    }

    case "ok": {
      const gw = model.gameweek;
      const meta = (
        <>
          <span>{gw.name}</span>
          <GwStatusBadge status={gw.status} />
          {model.chip ? <Badge tone="accent">{CHIP_LABEL[model.chip] ?? model.chip}</Badge> : null}
          {experience(model.insights.season)}
        </>
      );
      return (
        <>
          {header(
            team,
            meta,
            <>
              {pagerFor(team, gw)}
              {gw.isLive ? <LiveRefresh enabled /> : null}
            </>,
          )}

          <Summary summary={model.summary} isLive={gw.isLive} gameweekName={gw.name} />

          {!model.showPoints ? (
            <StateMessage tone="info" title="Live points unavailable">
              <p>FPL didn&apos;t return player points for {gw.name}. The team is shown without scores.</p>
            </StateMessage>
          ) : null}

          <MatchdayInsights data={model.insights.gameweek} gameweek={gw.name} />

          <TeamSheetView
            sheet={model.sheet}
            showPoints={model.showPoints}
            next={model.next}
            hit={model.summary.hit}
            benchCounted={model.insights.gameweek.bench?.counted ?? false}
          />

          <SeasonInsightsView season={model.insights.season} squad={model.insights.squad} nextGw={gw.max + 1} />
        </>
      );
    }
  }
}
