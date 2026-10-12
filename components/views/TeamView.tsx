import type { ReactNode } from "react";
import { Badge, GameweekPager, LiveRefresh, StateMessage, StatList, gameweekName, getFormat, getT } from "@/components/ui";
import type { TeamGameweek, TeamIdentity, TeamModel, TeamSummary } from "@/lib/services/models";
import { InterviewPanel } from "./InterviewPanel";
import { GwStatusBadge } from "./GwStatusBadge";
import { MatchdayInsights, SeasonInsightsView } from "./TeamInsightsView";
import { TeamHeader, type HeaderFact } from "./TeamHeader";
import { TeamSheetView } from "./TeamSheetView";
import styles from "./sheet.module.css";

type TeamState = Exclude<TeamModel, { kind: "not-found" }>;

const header = (team: TeamIdentity, facts?: HeaderFact[], actions?: ReactNode, gw?: number) => <TeamHeader team={team} facts={facts} actions={actions} gw={gw} />;

/** "Playing since 2019 · 7 earlier seasons": the manager's experience, for the header. */
const experience = (season: { tenure: { seasons: number; firstSeason: string | null } } | null): string | null =>
  season && season.tenure.firstSeason ? getT().team.experience(season.tenure.firstSeason.split("/")[0], season.tenure.seasons) : null;

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
          tone: "accent" as const,
          hint: [hit ? t.inclHit(hit) : null, isLive ? t.beforeAutoSubs : null].filter(Boolean).join(" · ") || undefined,
        },
        { label: t.total, value: f.number(summary.total), tone: "cool" as const },
        { label: t.overallRank, value: f.rank(summary.overallRank), tone: "good" as const },
        { label: t.transfers, value: summary.transfers, hint: hit ? t.hitPts(hit) : t.noHit, tone: hit ? ("bad" as const) : ("warn" as const) },
        { label: t.teamValue, value: f.money(summary.value), hint: t.inBank(f.money(summary.bank)), tone: "cool" as const },
      ]}
    />
  );
}

/** The ruled row under the name: which gameweek and its state, the chip if one is played, and the manager's experience. */
function factsFor(gw: TeamGameweek, extra: { chip?: string | null; experience?: string | null } = {}): HeaderFact[] {
  const t = getT();
  const h = t.team.header;
  return [
    {
      label: h.gameweek,
      value: (
        <>
          <span>{gameweekName(gw.name)}</span>
          <GwStatusBadge status={gw.status} />
        </>
      ),
    },
    ...(extra.chip ? [{ label: h.chip, value: <Badge tone="accent">{(t.chips as Record<string, string>)[extra.chip] ?? extra.chip}</Badge> }] : []),
    ...(extra.experience ? [{ label: h.experience, value: extra.experience }] : []),
  ];
}

export function TeamView({ model }: { model: TeamState }) {
  const { team } = model;
  const tv = getT().team;

  const page = (content: ReactNode) => (
    <div className={styles.sheet}>
      {content}
    </div>
  );

  switch (model.kind) {
    case "no-season":
      return page(
        <>
          {header(team)}
          <StateMessage title={tv.noSeasonTitle}>
            <p>{tv.noSeasonBody}</p>
          </StateMessage>
        </>,
      );

    case "not-started":
      return page(
        <>
          {header(team)}
          <StateMessage title={tv.notStartedTitle(team.teamName, model.startedEvent)}>
            <p>{tv.notStartedBody(gameweekName(model.deadlineName))}</p>
          </StateMessage>
        </>,
      );

    case "no-picks": {
      const gw = model.gameweek;
      return page(
        <>
          {header(team, factsFor(gw), pagerFor(team, gw), gw.gw)}
          <StateMessage title={tv.noPicksTitle(gameweekName(gw.name))}>
            <p>{tv.noPicksBody}</p>
          </StateMessage>
        </>,
      );
    }

    case "ok": {
      const gw = model.gameweek;
      return page(
        <>
          {header(
            team,
            factsFor(gw, { chip: model.chip, experience: experience(model.insights.season) }),
            <>
              {pagerFor(team, gw)}
              {gw.isLive ? <LiveRefresh enabled /> : null}
            </>,
            gw.gw,
          )}

          <Summary summary={model.summary} isLive={gw.isLive} gameweekName={gameweekName(gw.name)} />

          {!model.showPoints ? (
            <StateMessage tone="info" title={tv.noLiveTitle}>
              <p>{tv.noLiveBody(gameweekName(gw.name))}</p>
            </StateMessage>
          ) : null}

          <InterviewPanel model={model} />

          <MatchdayInsights data={model.insights.gameweek} gameweek={gameweekName(gw.name)} />

          <TeamSheetView
            sheet={model.sheet}
            showPoints={model.showPoints}
            next={model.next}
            hit={model.summary.hit}
            benchCounted={model.insights.gameweek.bench?.counted ?? false}
          />

          <SeasonInsightsView season={model.insights.season} squad={model.insights.squad} nextGw={gw.max + 1} />
        </>,
      );
    }
  }
}
