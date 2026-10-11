import { Badge, Card, Crest, LocalTime, type BadgeTone } from "@/components/ui";
import type { BonusSource, FixtureState } from "@/lib/domain";
import type { BonusLine, ClubSide, EventLine, FixtureCard } from "@/lib/services/models";
import styles from "./bonus.module.css";

const STATE_BADGE: Record<FixtureState, { label: string; tone: BadgeTone } | null> = {
  upcoming: null,
  live: { label: "Live", tone: "live" },
  provisional: { label: "FT", tone: "neutral" },
  final: { label: "FT", tone: "neutral" },
};

export const SOURCE_NOTE: Record<BonusSource, { label: string; tone: BadgeTone; help: string } | null> = {
  confirmed: { label: "Confirmed", tone: "positive", help: "Official bonus, added to scores." },
  provisional: { label: "Provisional", tone: "warning", help: "FPL's provisional bonus; may change until confirmed." },
  projected: { label: "Projected", tone: "warning", help: "Calculated from live BPS; will change as the match goes on." },
  none: null,
};

function Side({ club, lines, hidden }: { club: ClubSide; lines: BonusLine[]; hidden: number }) {
  return (
    <div className={styles.side}>
      <h3 className={styles.sideTitle}>{club.short}</h3>
      {lines.length === 0 ? (
        <p className={styles.muted}>No bonus yet.</p>
      ) : (
        <ol className={styles.lines} aria-label={`Bonus points, ${club.name}`}>
          {lines.map((line) => (
            <li key={line.key} className={`${styles.line} ${line.bonus > 0 ? styles.awarded : ""}`}>
              <span className={styles.pts}>
                {line.bonus > 0 ? (
                  <>
                    <span aria-hidden="true">+{line.bonus}</span>
                    <span className="sr-only">
                      {line.bonus} bonus {line.bonus === 1 ? "point" : "points"}:
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">No bonus:</span>
                  </>
                )}
              </span>
              <span className={styles.name}>{line.player}</span>
              <span className={styles.bps}>{line.bps}</span>
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${line.share}%` }} />
              </span>
              <span className="sr-only">{line.bps} BPS</span>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 ? <p className={styles.more}>+{hidden} more with the same bonus or fewer BPS</p> : null}
    </div>
  );
}

const list = (items: EventLine[]) => items.map((e) => (e.count > 1 ? `${e.player} ×${e.count}` : e.player)).join(", ");

/** Renders one fixture. Everything it shows has already been resolved by the bonus service. */
export function FixtureBonusCard({ card }: { card: FixtureCard }) {
  const { home, away, state, score, events } = card;
  const badge = STATE_BADGE[state];
  const note = SOURCE_NOTE[card.bonus.source];
  const noBonusData = card.bonus.home.length === 0 && card.bonus.away.length === 0;
  const eventRows = [
    ["Goals", events.goals],
    ["Assists", events.assists],
    ["Red cards", events.redCards],
  ] as const;
  const hasEvents = eventRows.some(([, items]) => items.length > 0);

  const title = (
    <span className={styles.title}>
      <span className={styles.titleSide}>
        <Crest code={home.code} name={home.name} size={24} />
        <span>{home.short}</span>
      </span>
      <span className={styles.score}>
        {score ? (
          <>
            <span aria-hidden="true">
              {score.home}–{score.away}
            </span>
            <span className="sr-only">
              {home.name} {score.home}, {away.name} {score.away}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true">v</span>
            <span className="sr-only">
              {home.name} versus {away.name}
            </span>
          </>
        )}
      </span>
      <span className={styles.titleSide}>
        <span>{away.short}</span>
        <Crest code={away.code} name={away.name} size={24} />
      </span>
    </span>
  );

  return (
    <Card as="article" className={`${styles.card} ${state === "live" ? styles.live : ""}`}>
      <header className={styles.header}>
        <h2 className={styles.heading}>{title}</h2>
        <p className={styles.meta}>
          {badge ? <Badge tone={badge.tone}>{state === "live" ? `${badge.label} ${card.minutes}′` : badge.label}</Badge> : null}
          {note ? (
            <Badge tone={note.tone} title={note.help}>
              {note.label}
            </Badge>
          ) : null}
          {state === "upcoming" ? (
            <span>
              Kick-off <LocalTime iso={card.kickoff} fallback="TBC" />
            </span>
          ) : null}
        </p>
      </header>

      {state === "upcoming" ? (
        <p className={styles.muted}>Bonus points appear once the match kicks off.</p>
      ) : noBonusData ? (
        <p className={styles.muted}>No bonus data yet.</p>
      ) : (
        <div className={styles.sides}>
          <Side club={home} lines={card.bonus.home} hidden={card.bonus.hidden.home} />
          <Side club={away} lines={card.bonus.away} hidden={card.bonus.hidden.away} />
        </div>
      )}

      {hasEvents && state !== "upcoming" ? (
        <dl className={styles.events}>
          {eventRows.map(([label, items]) =>
            items.length ? (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{list(items)}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
    </Card>
  );
}
