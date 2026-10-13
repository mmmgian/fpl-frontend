import Link from "next/link";
import { Crest, getT, isTrip } from "@/components/ui";
import { entrySlugs, type Award, type AwardKey, type StandingRow, type StatsPhase } from "@/lib/domain";
import { awardFigure, awardLine, awardsPhaseLine, awardTitle, tiedNote, visionsLede } from "./leagueCopy";
import styles from "./leagueExtras.module.css";

/** Each vision's sigil and hue in the altered view: decoration only, hidden from assistive technology. */
const VISION: Record<AwardKey, { glyph: string; hue: number }> = {
  weekWinner: { glyph: "✺", hue: 48 },
  woodenSpoon: { glyph: "☾", hue: 250 },
  hotStreak: { glyph: "✧", hue: 320 },
  climber: { glyph: "⇡", hue: 160 },
  rollercoaster: { glyph: "≋", hue: 195 },
  benchDisaster: { glyph: "◌", hue: 280 },
  hitMachine: { glyph: "⧖", hue: 12 },
  deepPockets: { glyph: "◈", hue: 95 },
};

interface LeagueAwardsProps {
  awards: Award[];
  rows: StandingRow[];
  /** The week the awards are for (the last finished one). */
  gw?: number;
  /** How settled that week is; with `liveGw`, the gameweek being played when it is not the awards' week. */
  phase?: StatsPhase | null;
  liveGw?: number | null;
  /** Picks the phrasings (see varietyKey); the first phrasing without it. */
  variety?: number;
}

/** The league's superlatives: who won the week, who is on fire, who is wasting the bench. Handed out by the numbers. */
export function LeagueAwards({ awards, rows, gw, phase, liveGw = null, variety }: LeagueAwardsProps) {
  const byEntry = new Map(rows.map((r) => [r.entry, r]));
  const slugs = entrySlugs(rows.map((r) => ({ id: r.entry, name: r.entry_name })));
  const items = awards.flatMap((a) => {
    const row = byEntry.get(a.entry);
    return row ? [{ a, row }] : [];
  });
  if (items.length === 0) return null;
  const trip = isTrip();
  const t = getT();

  return (
    <section aria-labelledby="awards-title" className={trip ? `${styles.awards} ${styles.visions}` : styles.awards}>
      <h2 id="awards-title" className={styles.awardsTitle}>
        {trip ? t.blotter.awardsHeading : t.league.awardsHeading}
      </h2>
      {trip ? <p className={styles.visionsLede}>{visionsLede(variety)}</p> : null}
      {phase && gw ? <p className={styles.awardsPhase}>{awardsPhaseLine(phase, gw, liveGw, variety)}</p> : null}
      <ul className={styles.awardList}>
        {items.map(({ a, row }, i) => (
          <li
            key={a.key}
            className={trip ? `${styles.award} ${styles.vision}` : styles.award}
            style={trip ? ({ "--hue": VISION[a.key].hue, "--i": i } as React.CSSProperties) : undefined}
          >
            {trip ? (
              <span className={styles.visionGlyph} aria-hidden="true">
                {VISION[a.key].glyph}
              </span>
            ) : null}
            <p className={styles.awardName}>{awardTitle(a.key)}</p>
            <p className={styles.awardFigure}>{awardFigure(a)}</p>
            <p className={styles.awardWho}>
              <Crest src={row.club_badge_src} name={row.entry_name} size={22} />
              <Link href={`/team/${slugs.get(row.entry) ?? row.entry}`} className={styles.awardLink}>
                {row.entry_name}
              </Link>
            </p>
            <p className={styles.awardLine}>{awardLine(a, row.entry_name, gw, { place: row.rank, variety })}</p>
            {tiedNote(a) ? <p className={styles.awardTie}>{tiedNote(a)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
