import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage, gameweekName, getT } from "@/components/ui";
import { pickVariant, refreshIntervalMs } from "@/lib/domain";
import type { BonusModel } from "@/lib/services/models";
import { FixtureBonusCard, sourceNote } from "./FixtureBonusCard";
import { GwStatusBadge } from "./GwStatusBadge";
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

  const { gameweek: gw, fixtures, summary, variety } = model;
  const name = gameweekName(gw.name);
  // Before a ball is kicked there is nothing to report but what is coming; after, the phase decides the verdict's tone.
  const lede =
    summary && gw.status !== "upcoming"
      ? pickVariant(b.lede[gw.status], variety)(name, summary.top.player, summary.top.club, summary.top.bps, summary.bestClub.club, summary.bestClub.bonus)
      : pickVariant(b.lede.upcoming, variety)(name, fixtures.length);
  return (
    <>
      <PageHeader
        eyebrow={b.title}
        title={gameweekName(gw.name)}
        meta={
          <>
            <GwStatusBadge status={gw.status} />
            <span>
              {b.finishedOf(model.finished, fixtures.length)}
            </span>
          </>
        }
        actions={
          <>
            <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={(n) => `/bonus?gw=${n}`} />
            {model.anyLive ? <LiveRefresh enabled /> : gw.gw === gw.max && refreshIntervalMs(gw.status) ? <LiveRefresh enabled intervalMs={refreshIntervalMs(gw.status)!} /> : null}
          </>
        }
      />

      {fixtures.length > 0 ? <p className={styles.lede}>{lede}</p> : null}

      {fixtures.length > 0 ? (
        <div className={styles.legend}>
          <span>
            <strong>{model.counts.live}</strong> {b.live} · <strong>{model.counts.finished}</strong> {b.finished} · <strong>{model.counts.upcoming}</strong> {b.toCome}
          </span>
          {(["confirmed", "provisional", "projected"] as const).map((source) => {
            const note = sourceNote(source)!;
            return (
              <span key={source}>
                <Badge tone={note.tone}>{note.label}</Badge> {note.help}
              </span>
            );
          })}
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
