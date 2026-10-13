import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage, gameweekName, getT } from "@/components/ui";
import { DAY_CLOCK } from "@/components/ui/timeFormats";
import { pickVariant } from "@/lib/domain";
import type { BonusModel } from "@/lib/services/models";
import { FixtureBonusCard, sourceNote } from "./FixtureBonusCard";
import { GwStatusBadge } from "./GwStatusBadge";
import { withTime } from "./withTime";
import styles from "./bonus.module.css";

export function BonusView({ model }: { model: BonusModel }) {
  const b = getT().bonus;
  if (model.kind === "no-season") {
    return (
      <>
        <PageHeader title={b.title} />
        <StateMessage title={b.notStartedTitle}>
          <p>{b.notStartedBody}</p>
        </StateMessage>
      </>
    );
  }

  const { gameweek: gw, fixtures, summary, variety, pulse } = model;
  const name = gameweekName(gw.name);
  // Live but nothing on: a quiet day between match days, or every match played and FPL still checking.
  const paused = gw.status === "live" && pulse?.state === "between" && pulse.nextKickoff !== null;
  const allPlayed = gw.status === "live" && pulse?.state === "over";
  const phase = allPlayed ? "provisional" : gw.status;
  // Before a ball is kicked there is nothing to report but what is coming; after, the phase decides the verdict's tone.
  const lede = paused
    ? withTime((when) => pickVariant(b.lede.paused, variety)(name, when), pulse.nextKickoff!, DAY_CLOCK)
    : summary && phase !== "upcoming"
      ? pickVariant(b.lede[phase], variety)(name, summary.top.player, summary.top.club, summary.top.bps, summary.bestClub.club, summary.bestClub.bonus)
      : pickVariant(b.lede.upcoming, variety)(name, fixtures.length);
  // Explain only the labels a card on this page actually wears, in the order they first appear.
  const notes = [...new Map(fixtures.flatMap((card) => {
    const note = sourceNote(card.bonus.source, card.state);
    return note ? [[note.key, note] as const] : [];
  })).values()];
  return (
    <>
      <PageHeader
        eyebrow={b.title}
        title={gameweekName(gw.name)}
        meta={
          <>
            {paused ? <Badge tone="neutral">{b.paused}</Badge> : <GwStatusBadge status={phase} />}
            <span>
              {b.finishedOf(model.finished, fixtures.length)}
            </span>
          </>
        }
        actions={
          <>
            <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={(n) => `/bonus?gw=${n}`} />
            {model.refreshMs !== null ? <LiveRefresh enabled intervalMs={model.refreshMs} /> : null}
          </>
        }
      />

      {fixtures.length > 0 ? <p className={styles.lede}>{lede}</p> : null}

      {notes.length > 0 ? (
        <div className={styles.legend}>
          {notes.map((note) => (
            <span key={note.key}>
              <Badge tone={note.tone}>{note.label}</Badge> {note.help}
            </span>
          ))}
        </div>
      ) : null}

      {fixtures.length === 0 ? (
        <StateMessage title={b.noFixturesTitle(gameweekName(gw.name))}>
          <p>{b.noFixturesBody}</p>
        </StateMessage>
      ) : (
        <div className={styles.grid}>
          {fixtures.map((card) => (
            <FixtureBonusCard key={card.id} card={card} variety={variety} />
          ))}
        </div>
      )}
    </>
  );
}
