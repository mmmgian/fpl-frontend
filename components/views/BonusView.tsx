import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage } from "@/components/ui";
import type { BonusModel } from "@/lib/services/models";
import { FixtureBonusCard, SOURCE_NOTE } from "./FixtureBonusCard";
import { GwStatusBadge } from "./GwStatusBadge";
import styles from "./bonus.module.css";

export function BonusView({ model }: { model: BonusModel }) {
  if (model.kind === "no-season") {
    return (
      <>
        <PageHeader title="Bonus points" />
        <StateMessage title="The season hasn't started">
          <p>Bonus points appear here once Gameweek 1 kicks off.</p>
        </StateMessage>
      </>
    );
  }

  const { gameweek: gw, fixtures } = model;
  return (
    <>
      <PageHeader
        eyebrow="Bonus points"
        title={gw.name}
        meta={
          <>
            <GwStatusBadge status={gw.status} />
            <span>
              {model.finished} of {fixtures.length} matches finished
            </span>
          </>
        }
        actions={
          <>
            <GameweekPager gw={gw.gw} min={gw.min} max={gw.max} href={(n) => `/bonus?gw=${n}`} />
            {model.anyLive ? <LiveRefresh enabled /> : null}
          </>
        }
      />

      {fixtures.length > 0 ? (
        <div className={styles.legend}>
          <span>
            <strong>{model.counts.live}</strong> live · <strong>{model.counts.finished}</strong> finished · <strong>{model.counts.upcoming}</strong> to come
          </span>
          {(["confirmed", "provisional", "projected"] as const).map((source) => {
            const note = SOURCE_NOTE[source]!;
            return (
              <span key={source}>
                <Badge tone={note.tone}>{note.label}</Badge> {note.help}
              </span>
            );
          })}
        </div>
      ) : null}

      {fixtures.length === 0 ? (
        <StateMessage title={`No fixtures in ${gw.name}`}>
          <p>Every match in this gameweek has been postponed or rescheduled.</p>
        </StateMessage>
      ) : (
        <div className={styles.grid}>
          {fixtures.map((card) => (
            <FixtureBonusCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </>
  );
}
