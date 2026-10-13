import type { ReactNode } from "react";
import { Badge, ButtonLink, GameweekPager, LiveRefresh, LocalTime, StateMessage, StatList, gameweekName, getFormat, getT } from "@/components/ui";
import { refreshIntervalMs, varietyKey } from "@/lib/domain";
import type { TeamGameweek, TeamIdentity, TeamModel, TeamSummary } from "@/lib/services/models";
import { InterviewPanel } from "./InterviewPanel";
import { GwStatusBadge } from "./GwStatusBadge";
import { MatchdayInsights, SeasonInsightsView, chooser, type Choose } from "./TeamInsightsView";
import { TeamHeader, type HeaderFact } from "./TeamHeader";
import { TeamSheetView } from "./TeamSheetView";
import styles from "./sheet.module.css";

type TeamState = Exclude<TeamModel, { kind: "not-found" }>;

const header = (team: TeamIdentity, facts?: HeaderFact[], actions?: ReactNode, gw?: number) => <TeamHeader team={team} facts={facts} actions={actions} gw={gw} />;

const hrefFor = (team: TeamIdentity) => (n: number) => `/team/${team.slug ?? team.entryId}?gw=${n}`;

/**
 * The pager, and a way straight back to the latest gameweek from deep in the past (one step back is already the pager's
 * own "next" button, so the shortcut only shows from two weeks back).
 */
const pagerFor = (team: TeamIdentity, gw: TeamGameweek) => {
  const t = getT().team;
  return (
    <>
      <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={hrefFor(team)} />
      {gw.gw < gw.max - 1 ? (
        <ButtonLink size="sm" variant="ghost" href={hrefFor(team)(gw.max)} aria-label={t.latestLabel(gw.max)} scroll={false}>
          {t.latest(getT().common.gw(gw.max))}
        </ButtonLink>
      ) : null}
    </>
  );
};

/** Local time of a deadline: weekday, date and time, in the reader's timezone. */
const DEADLINE_TIME: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

function Summary({ summary, gw, gameweekName: gwName, pick }: { summary: TeamSummary; gw: TeamGameweek; gameweekName: string; pick: Choose }) {
  const t = getT().team;
  const f = getFormat();
  const { hit } = summary;
  const { isLive } = gw;
  // Where FPL is with the latest gameweek's points: still checking, or signed off (data_checked). Past weeks are all final.
  const phase =
    gw.gw !== gw.max ? null : gw.status === "provisional" ? pick(t.vary.provisional, 40) : gw.status === "final" ? pick(t.vary.final, 41) : null;
  return (
    <StatList
      label={t.summary(gwName)}
      items={[
        {
          label: isLive ? t.gwPointsLive : t.gwPoints,
          value: f.number(summary.gwPoints),
          tone: "accent" as const,
          hint: [hit ? t.inclHit(hit) : null, isLive ? t.beforeAutoSubs : null, phase].filter(Boolean).join(" · ") || undefined,
        },
        { label: t.total, value: f.number(summary.total), tone: "cool" as const },
        { label: t.overallRank, value: f.rank(summary.overallRank), tone: "good" as const },
        { label: t.transfers, value: summary.transfers, hint: hit ? t.hitPts(hit) : t.noHit, tone: hit ? ("bad" as const) : ("warn" as const) },
        { label: t.teamValue, value: f.money(summary.value), hint: t.inBank(f.money(summary.bank)), tone: "cool" as const },
      ]}
    />
  );
}

/**
 * The ruled row under the name: which gameweek and its state, the chip if one is played, the league position (only on
 * the latest gameweek: it is today's table) and, once the latest week is played, the next deadline in the reader's time.
 * The manager's experience is not repeated here: the Experience card says it, with more.
 */
function factsFor(gw: TeamGameweek, extra: { chip?: string | null; league?: string | null } = {}): HeaderFact[] {
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
    ...(extra.league ? [{ label: h.league, value: extra.league }] : []),
    ...(gw.nextDeadline
      ? [
          {
            label: h.deadline,
            value: (
              <>
                <span>{t.common.gw(gw.nextDeadline.gw)}</span> <LocalTime iso={gw.nextDeadline.at} options={DEADLINE_TIME} />
              </>
            ),
          },
        ]
      : []),
  ];
}

/**
 * The team's place in the league: position, movement since last gameweek, and the gap to the top (or the lead). Only
 * beside the latest gameweek: it is today's table, and would read as that week's beside an older one.
 */
function leagueLine(team: TeamIdentity, gw: TeamGameweek, pick: Choose): string | null {
  const spot = team.league;
  if (!spot || gw.gw !== gw.max) return null;
  const gap = spot.rank === 1 ? spot.points - (spot.next?.points ?? spot.points) : spot.leader.points - spot.points;
  return pick(getT().team.vary.leagueSpot, 42)(spot.rank, spot.size, spot.moved, gap);
}

/** `now` is only used when the model carries no variety key (hand-built models); tests can pin it. */
export function TeamView({ model, now }: { model: TeamState; now?: Date }) {
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
      const variety = gw.variety ?? varietyKey(gw.gw, gw.status, now ?? new Date());
      const pick = chooser(variety, team.entryId);
      return page(
        <>
          {header(
            team,
            factsFor(gw, { chip: model.chip, league: leagueLine(team, gw, pick) }),
            <>
              {pagerFor(team, gw)}
              {refreshEvery(gw) ? <LiveRefresh enabled intervalMs={refreshEvery(gw)!} /> : null}
            </>,
            gw.gw,
          )}

          <Summary summary={model.summary} gw={gw} gameweekName={gameweekName(gw.name)} pick={pick} />

          {!model.showPoints ? (
            <StateMessage tone="info" title={tv.noLiveTitle}>
              <p>{tv.noLiveBody(gameweekName(gw.name))}</p>
            </StateMessage>
          ) : null}

          <InterviewPanel model={model} />

          <MatchdayInsights data={model.insights.gameweek} gameweek={gameweekName(gw.name)} status={gw.status} variety={variety} slot={team.entryId} />

          <TeamSheetView
            sheet={model.sheet}
            showPoints={model.showPoints}
            next={model.next}
            hit={model.summary.hit}
            benchCounted={model.insights.gameweek.bench?.counted ?? false}
          />

          <SeasonInsightsView season={model.insights.season} squad={model.insights.squad} nextGw={gw.max + 1} variety={variety} slot={team.entryId} />
        </>,
      );
    }
  }
}

/**
 * Only the latest gameweek moves. The service's plan (refreshPlan: every minute while a match is on, asleep through quiet
 * gaps, slowly while FPL signs it off); without one (hand-built models), every minute while live, slowly while provisional.
 */
const refreshEvery = (gw: TeamGameweek): number | null =>
  gw.gw !== gw.max ? null : (gw.refreshMs ?? (gw.isLive ? 60_000 : refreshIntervalMs(gw.status)));
