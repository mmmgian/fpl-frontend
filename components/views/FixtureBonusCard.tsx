import { Badge, Card, Crest, LocalTime, type BadgeTone } from "@/components/ui";
import { fixtureState, matchBonus, type BonusSource, type FixtureState } from "@/lib/fpl/derive";
import type { Fixture, FplElement, FplTeam } from "@/lib/fpl/types";
import styles from "./views.module.css";

const STATE_BADGE: Record<FixtureState, { label: string; tone: BadgeTone } | null> = {
  upcoming: null,
  live: { label: "Live", tone: "live" },
  provisional: { label: "FT", tone: "neutral" },
  final: { label: "FT", tone: "neutral" },
};

const SOURCE_NOTE: Record<BonusSource, { label: string; tone: BadgeTone; help: string } | null> = {
  confirmed: { label: "Confirmed", tone: "positive", help: "Official bonus, added to scores." },
  provisional: { label: "Provisional", tone: "warning", help: "FPL's provisional bonus; may change until confirmed." },
  projected: { label: "Projected", tone: "warning", help: "Calculated from live BPS; will change as the match goes on." },
  none: null,
};

interface FixtureBonusCardProps {
  fixture: Fixture;
  teams: Map<number, FplTeam>;
  players: Map<number, FplElement>;
}

export function FixtureBonusCard({ fixture: f, teams, players }: FixtureBonusCardProps) {
  const home = teams.get(f.team_h);
  const away = teams.get(f.team_a);
  const homeName = home?.name ?? "Home";
  const awayName = away?.name ?? "Away";
  const state = fixtureState(f);
  const badge = STATE_BADGE[state];
  const { source, rows } = matchBonus(f);
  const note = SOURCE_NOTE[source];
  const hasScore = f.team_h_score != null && f.team_a_score != null;

  const title = (
    <span className={styles.fixtureTitle}>
      <span className={styles.fixtureSide}>
        <Crest code={home?.code} name={homeName} size={22} />
        <span>{home?.short_name ?? "HOM"}</span>
      </span>
      <span className={styles.score}>
        {hasScore ? (
          <>
            <span aria-hidden="true">
              {f.team_h_score}–{f.team_a_score}
            </span>
            <span className="sr-only">
              {homeName} {f.team_h_score}, {awayName} {f.team_a_score}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true">v</span>
            <span className="sr-only">
              {homeName} versus {awayName}
            </span>
          </>
        )}
      </span>
      <span className={styles.fixtureSide}>
        <span>{away?.short_name ?? "AWY"}</span>
        <Crest code={away?.code} name={awayName} size={22} />
      </span>
    </span>
  );

  return (
    <Card as="article" className={styles.fixtureCard}>
      <header className={styles.fixtureHeader}>
        <h2 className={styles.fixtureHeading}>{title}</h2>
        <p className={styles.fixtureMeta}>
          {badge ? <Badge tone={badge.tone}>{state === "live" ? `${badge.label} ${f.minutes}′` : badge.label}</Badge> : null}
          {state === "upcoming" ? (
            <span>
              Kick-off <LocalTime iso={f.kickoff_time} fallback="TBC" />
            </span>
          ) : null}
        </p>
      </header>

      {state === "upcoming" ? (
        <p className={styles.muted}>Bonus points appear once the match kicks off.</p>
      ) : rows.length === 0 ? (
        <p className={styles.muted}>No bonus data yet.</p>
      ) : (
        <>
          <ol className={styles.bonusList} aria-label={`Bonus points, ${homeName} v ${awayName}`}>
            {rows.map((r) => {
              const p = players.get(r.element);
              const club = r.side === "h" ? home : away;
              return (
                <li key={`${r.side}-${r.element}`} className={styles.bonusRow}>
                  <span className={styles.bonusPts}>
                    <span aria-hidden="true">+{r.bonus}</span>
                    <span className="sr-only">
                      {r.bonus} bonus {r.bonus === 1 ? "point" : "points"}:
                    </span>
                  </span>
                  <span className={styles.bonusName}>{p?.web_name ?? `Player ${r.element}`}</span>
                  <span className={styles.bonusClub}>{club?.short_name}</span>
                  {r.bps != null ? <span className={styles.bps}>{r.bps} BPS</span> : null}
                </li>
              );
            })}
          </ol>
          {note ? (
            <p className={styles.sourceNote}>
              <Badge tone={note.tone}>{note.label}</Badge> <span>{note.help}</span>
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
