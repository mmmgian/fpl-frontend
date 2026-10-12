import { Badge, Card, ClubLink, Crest, LocalTime, getT, type BadgeTone } from "@/components/ui";
import type { BonusSource, FixtureState } from "@/lib/domain";
import type { BonusLine, ClubSide, EventLine, FixtureCard } from "@/lib/services/models";
import styles from "./bonus.module.css";

const STATE_BADGE: Record<FixtureState, { key: "live" | "ft"; tone: BadgeTone } | null> = {
  upcoming: null,
  live: { key: "live", tone: "live" },
  provisional: { key: "ft", tone: "neutral" },
  final: { key: "ft", tone: "neutral" },
};

const SOURCE_TONE: Record<Exclude<BonusSource, "none">, BadgeTone> = { confirmed: "positive", provisional: "warning", projected: "warning" };

/** The label and help text for where a fixture's bonus comes from, in the page's language; null when there is none. */
export function sourceNote(source: BonusSource): { label: string; tone: BadgeTone; help: string } | null {
  if (source === "none") return null;
  return { ...getT().bonus.sources[source], tone: SOURCE_TONE[source] };
}

/** A club's crest and short name in a match heading, linked to its page when we know which club it is. */
function ClubTitle({ club, crestFirst = false }: { club: ClubSide; crestFirst?: boolean }) {
  const parts = crestFirst ? (
    <>
      <Crest code={club.code} name={club.name} size={24} />
      <span>{club.short}</span>
    </>
  ) : (
    <>
      <span>{club.short}</span>
      <Crest code={club.code} name={club.name} size={24} />
    </>
  );
  return club.id === null ? (
    <span className={styles.titleSide}>{parts}</span>
  ) : (
    <ClubLink name={club.name} className={styles.titleSide}>
      {parts}
    </ClubLink>
  );
}

function Side({ club, lines, hidden }: { club: ClubSide; lines: BonusLine[]; hidden: number }) {
  const b = getT().bonus;
  return (
    <div className={styles.side}>
      <h3 className={styles.sideTitle}>{club.short}</h3>
      {lines.length === 0 ? (
        <p className={styles.muted}>{b.noBonusYet}</p>
      ) : (
        <ol className={styles.lines} aria-label={b.bonusList(club.name)}>
          {lines.map((line) => (
            <li key={line.key} className={`${styles.line} ${line.bonus > 0 ? styles.awarded : ""}`}>
              <span className={styles.pts}>
                {line.bonus > 0 ? (
                  <>
                    <span aria-hidden="true">+{line.bonus}</span>
                    <span className="sr-only">{b.bonusSr(line.bonus)}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">{b.noBonus}</span>
                  </>
                )}
              </span>
              <span className={styles.name}>{line.player}</span>
              <span className={styles.bps}>{line.bps}</span>
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.barFill} style={{ width: `${line.share}%` }} />
              </span>
              <span className="sr-only">{b.bps(line.bps)}</span>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 ? <p className={styles.more}>{b.more(hidden)}</p> : null}
    </div>
  );
}

const list = (items: EventLine[]) => items.map((e) => (e.count > 1 ? `${e.player} ×${e.count}` : e.player)).join(", ");

/** Renders one fixture. Everything it shows has already been resolved by the bonus service. */
export function FixtureBonusCard({ card }: { card: FixtureCard }) {
  const b = getT().bonus;
  const { home, away, state, score, events } = card;
  const badge = STATE_BADGE[state];
  const note = sourceNote(card.bonus.source);
  const noBonusData = card.bonus.home.length === 0 && card.bonus.away.length === 0;
  const eventRows = [
    [b.goals, events.goals],
    [b.assists, events.assists],
    [b.redCards, events.redCards],
  ] as const;
  const hasEvents = eventRows.some(([, items]) => items.length > 0);

  const title = (
    <span className={styles.title}>
      <ClubTitle club={home} crestFirst />
      <span className={styles.score}>
        {score ? (
          <>
            <span aria-hidden="true">
              {score.home}–{score.away}
            </span>
            <span className="sr-only">
              {b.scoreSr(home.name, score.home, away.name, score.away)}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true">v</span>
            <span className="sr-only">
              {b.versus(home.name, away.name)}
            </span>
          </>
        )}
      </span>
      <ClubTitle club={away} />
    </span>
  );

  return (
    <Card as="article" className={`${styles.card} ${state === "live" ? styles.live : ""}`}>
      <header className={styles.header}>
        <h2 className={styles.heading}>{title}</h2>
        <p className={styles.meta}>
          {badge ? <Badge tone={badge.tone}>{state === "live" ? `${b.state[badge.key]} ${card.minutes}′` : b.state[badge.key]}</Badge> : null}
          {note ? (
            <Badge tone={note.tone} title={note.help}>
              {note.label}
            </Badge>
          ) : null}
          {state === "upcoming" ? (
            <span>
              {b.kickoff} <LocalTime iso={card.kickoff} />
            </span>
          ) : null}
        </p>
      </header>

      {state === "upcoming" ? (
        <p className={styles.muted}>{b.upcomingNote}</p>
      ) : noBonusData ? (
        <p className={styles.muted}>{b.noData}</p>
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
