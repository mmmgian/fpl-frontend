import type { ReactNode } from "react";
import { LiveRefresh, LocalTime, PageHeader, Skeleton, StateMessage, StatList, gameweekName, gameweekShort, getFormat, getT } from "@/components/ui";
import { isolateName, refreshIntervalMs } from "@/lib/domain";
import type { LeagueModel, LeagueTable } from "@/lib/services/models";
import { GwStatusBadge } from "./GwStatusBadge";
import { LeagueAwards } from "./LeagueAwards";
import { StandingsTable } from "./StandingsTable";
import { phaseOf, storyLines, vary } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

/**
 * The league page. On its own it renders the whole model. The page can instead pass `extras` to stand in for the
 * parts the per-manager data feeds (see LeagueExtrasSections), e.g. a Suspense boundary that streams them in later.
 */
export function LeagueView({ model, extras }: { model: LeagueModel; extras?: ReactNode }) {
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

  const { gameweek, summary, variety } = model;
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
          ) : model.gameweekUnavailable ? (
            // FPL's game file failing, usually while the game updates around a deadline: say so rather than go blank.
            <span>{t.updating}</span>
          ) : (
            <span>{t.preSeason}</span>
          )
        }
        actions={refreshFor(model)}
      />

      {!summary ? (
        <StateMessage title={t.emptyTitle}>
          <p>
            {/* Pre-season wording only before the season; a new league mid-season fills in with FPL's next update. */}
            {gameweek ? vary(t.emptyInSeason, variety) : vary(t.emptyBodies, variety)}
            {model.newEntries ? t.joined(model.newEntries) : ""}
            {!gameweek && model.nextDeadline ? (
              <>
                {" "}
                <DeadlineSentence deadline={model.nextDeadline} />
              </>
            ) : null}
          </p>
        </StateMessage>
      ) : (
        <>
          <StatList
            label={t.summary}
            items={[
              // The title race is read off the table alone, so this hint is the same before and after the extras arrive.
              {
                label: t.leader,
                value: f.number(summary.leader.total),
                hint: gap?.kind === "titleRace" ? vary(t.leaderHint, variety, 1)(isolateName(summary.leader.entryName), getT().common.points(gap.gap)) : summary.leader.entryName,
              },
              ...(summary.best && gameweek
                ? [{ label: t.best(gameweekShort(gameweek.name)), value: f.number(summary.best.total), hint: gameweek.status === "live" ? t.bestLive(isolateName(summary.best.entryName)) : summary.best.entryName }]
                : []),
              { label: t.managers, value: summary.managers, hint: model.truncated ? t.truncated : undefined },
            ]}
          />
          {extras ?? <LeagueExtrasSections model={model} />}
        </>
      )}
    </>
  );
}

/**
 * Everything under the headline numbers that the managers' histories and squads feed: the storyline, the awards and
 * the table with its form, value, chips and stats panels. Given the whole model it is the page as it always was.
 */
export function LeagueExtrasSections({ model }: { model: LeagueTable }) {
  const t = getT().league;
  const { gameweek, summary, rows, variety } = model;
  const names = new Map(rows.map((r) => [r.entry, r.entry_name]));
  const stories = summary ? storyLines(model.headlines, (entry) => names.get(entry) ?? "", variety, model.seasonOver) : [];
  const phase = gameweek && model.currentGw ? phaseOf(gameweek.status, model.currentGw, { pulse: model.pulse, seasonOver: model.seasonOver, variety }) : null;
  // LeagueAwards renders (with its h2) only when an award goes to a manager in the table; otherwise the panels' headings
  // sit straight under the page title.
  const awardsShown = Boolean(model.stats?.awards.some((a) => names.has(a.entry)));
  return (
    <>
      {stories.length || phase || model.nextDeadline ? (
        <section aria-label={t.storyLabel}>
          <p className={styles.story}>
            {/* Before the season there is no gameweek to describe, only the first deadline. */}
            {!phase && model.nextDeadline ? (
              <span className={styles.storyPhase}>
                <DeadlineSentence deadline={model.nextDeadline} />
              </span>
            ) : null}
            {phase ? (
              <span className={styles.storyPhase}>
                {phase.at ? (
                  <>
                    {phase.text}
                    <LocalTime iso={phase.at} options={WHEN} />
                    {phase.after}
                  </>
                ) : (
                  phase.text
                )}
                {model.nextDeadline ? (
                  <>
                    {" "}
                    <DeadlineSentence deadline={model.nextDeadline} />
                  </>
                ) : null}
              </span>
            ) : null}
            {stories.map((line) => ` ${line}`).join("")}
          </p>
        </section>
      ) : null}
      {model.stats ? (
        <LeagueAwards awards={model.stats.awards} rows={rows} gw={model.stats.gw} phase={model.statsPhase} liveGw={model.currentGw} variety={variety} />
      ) : null}
      <StandingsTable rows={rows} caption={t.caption(model.name)} hideCaption zones stats={model.stats ?? undefined} variety={variety} panelHeadingLevel={awardsShown ? 3 : 2} />
    </>
  );
}

/** One row of award cards: the usual count, so the table below does not move when they arrive. */
const AWARD_PLACEHOLDERS = 4;

/**
 * Stands in for LeagueExtrasSections while the extras load (see LeagueStream): the table itself straight away, with
 * room held for the storyline, the awards and the stats columns, so nothing jumps when the real ones replace it. Only
 * the placeholders are busy; the table is already the real one and stays readable.
 */
export function LeagueExtrasFallback({ model }: { model: LeagueTable }) {
  const t = getT();
  const { rows, variety } = model;
  return (
    <>
      <div className={styles.storyPending} role="status" aria-live="polite">
        <span className="sr-only">{vary(t.loading.leagueExtras, variety)}</span>
        <Skeleton width="100%" height="1.4em" />
        <Skeleton width="62%" height="1.4em" />
      </div>
      <div className={styles.awards} aria-hidden="true">
        <Skeleton width={120} height="0.8125rem" />
        <ul className={styles.awardList}>
          {Array.from({ length: AWARD_PLACEHOLDERS }, (_, i) => (
            <li key={i} className={styles.award}>
              <Skeleton width="55%" height="0.6875rem" />
              <Skeleton width="45%" height="2.2rem" />
              <Skeleton width="75%" height={22} />
              <Skeleton width="100%" height="2.3em" />
            </li>
          ))}
        </ul>
      </div>
      <StandingsTable rows={rows} caption={t.league.caption(model.name)} hideCaption zones statsPending variety={variety} />
    </>
  );
}

/** A kick-off or deadline in the reader's own time: weekday and time, with the date once it is further off. */
const WHEN: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

/** "GW7 deadline: Sat 11 Oct, 11:30." in the reader's time; the service only sets it once the latest week is played. */
function DeadlineSentence({ deadline }: { deadline: { gw: number; at: string } }) {
  const d = getT().league.deadline;
  return (
    <>
      {d.before(deadline.gw)}
      <LocalTime iso={deadline.at} options={WHEN} />
      {d.after}
    </>
  );
}

/**
 * How often the page reloads itself. The service plans it from the fixtures (refreshPlan: every minute while a match is
 * on, asleep through quiet gaps, slowly while FPL signs the week off, never once it is final). Without a plan (hand-built
 * models) every minute while live and slowly while provisional; an unreadable gameweek (FPL's game file failing while
 * the game updates) is retried slowly, like provisional.
 */
function refreshFor(model: LeagueTable) {
  const status = model.gameweekUnavailable ? "provisional" : model.gameweek?.status;
  const every = model.refreshMs !== undefined ? model.refreshMs : status ? refreshIntervalMs(status) : null;
  return every ? <LiveRefresh enabled intervalMs={every} /> : undefined;
}
