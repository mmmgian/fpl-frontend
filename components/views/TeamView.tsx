import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage, StatList, gameweekName, getFormat, getT } from "@/components/ui";
import type { TeamGameweek, TeamIdentity, TeamModel, TeamSummary } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { MatchdayInsights, SeasonInsightsView } from "./TeamInsightsView";
import { TeamSheetView } from "./TeamSheetView";

type TeamState = Exclude<TeamModel, { kind: "not-found" }>;

const header = (team: TeamIdentity, meta?: ReactNode, actions?: ReactNode) => (
  <PageHeader back={<Link href="/">{getT().common.leagueTable}</Link>} eyebrow={team.manager} title={team.teamName} meta={meta} actions={actions} />
);

/** "Playing since 2019 · 7 earlier seasons": the line under the manager's name. */
const experience = (season: { tenure: { seasons: number; firstSeason: string | null } } | null) =>
  season && season.tenure.firstSeason ? <span>{getT().team.experience(season.tenure.firstSeason.split("/")[0], season.tenure.seasons)}</span> : null;

const pagerFor = (team: TeamIdentity, gw: TeamGameweek) => (
  <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={(n) => `/team/${team.entryId}?gw=${n}`} />
);

function Summary({ summary, isLive, gameweekName: gwName }: { summary: TeamSummary; isLive: boolean; gameweekName: string }) {
  const t = getT().team;
  const f = getFormat();
  const { hit } = summary;
  return (
    <StatList
      label={t.summary(gwName)}
      items={[
        {
          label: isLive ? t.gwPointsLive : t.gwPoints,
          value: summary.gwPoints,
          hint: [hit ? t.inclHit(hit) : null, isLive ? t.beforeAutoSubs : null].filter(Boolean).join(" · ") || undefined,
        },
        { label: t.total, value: f.number(summary.total) },
        { label: t.overallRank, value: f.rank(summary.overallRank) },
        { label: t.transfers, value: summary.transfers, hint: hit ? t.hitPts(hit) : t.noHit },
        { label: t.teamValue, value: f.money(summary.value), hint: t.inBank(f.money(summary.bank)) },
      ]}
    />
  );
}

export function TeamView({ model }: { model: TeamState }) {
  const { team } = model;
  const t = getT();
  const tv = t.team;

  switch (model.kind) {
    case "no-season":
      return (
        <>
          {header(team)}
          <StateMessage title={tv.noSeasonTitle}>
            <p>{tv.noSeasonBody}</p>
          </StateMessage>
        </>
      );

    case "not-started":
      return (
        <>
          {header(team)}
          <StateMessage title={tv.notStartedTitle(team.teamName, model.startedEvent)}>
            <p>{tv.notStartedBody(gameweekName(model.deadlineName))}</p>
          </StateMessage>
        </>
      );

    case "no-picks": {
      const gw = model.gameweek;
      const meta = (
        <>
          <span>{gameweekName(gw.name)}</span>
          <GwStatusBadge status={gw.status} />
        </>
      );
      return (
        <>
          {header(team, meta, pagerFor(team, gw))}
          <StateMessage title={tv.noPicksTitle(gameweekName(gw.name))}>
            <p>{tv.noPicksBody}</p>
          </StateMessage>
        </>
      );
    }

    case "ok": {
      const gw = model.gameweek;
      const meta = (
        <>
          <span>{gameweekName(gw.name)}</span>
          <GwStatusBadge status={gw.status} />
          {model.chip ? <Badge tone="accent">{(t.chips as Record<string, string>)[model.chip] ?? model.chip}</Badge> : null}
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

          <Summary summary={model.summary} isLive={gw.isLive} gameweekName={gameweekName(gw.name)} />

          {!model.showPoints ? (
            <StateMessage tone="info" title={tv.noLiveTitle}>
              <p>{tv.noLiveBody(gameweekName(gw.name))}</p>
            </StateMessage>
          ) : null}

          <MatchdayInsights data={model.insights.gameweek} gameweek={gameweekName(gw.name)} />

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
