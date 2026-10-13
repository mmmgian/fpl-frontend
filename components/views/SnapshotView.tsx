import Link from "next/link";
import { ButtonLink, LocalTime, PageHeader, StateMessage, getFormat, getT } from "@/components/ui";
import { pickVariant, varietyKey } from "@/lib/domain";
import type { SnapshotModel } from "@/lib/services/models";
import { StandingsTable } from "./StandingsTable";
import styles from "./views.module.css";

/** The table at a glance, in one paragraph: each part drawn from its own variants so they don't change in step. */
function Summary({ facts, variety }: { facts: NonNullable<SnapshotModel["facts"]>; variety: number }) {
  const t = getT();
  const s = t.history.summary;
  const c = t.common;
  const parts = [
    pickVariant(s.leader, variety, 1)(facts.leader.name, c.points(facts.leader.total)),
    facts.gap === null ? null : facts.gap === 0 ? pickVariant(s.level, variety, 2) : pickVariant(s.gap, variety, 2)(c.points(facts.gap)),
    facts.best.points > 0 ? pickVariant(s.best, variety, 3)(facts.best.name, c.points(facts.best.points)) : null,
    facts.climber ? pickVariant(s.climber, variety, 4)(facts.climber.name, c.places(facts.climber.places)) : null,
    facts.faller ? pickVariant(s.faller, variety, 5)(facts.faller.name, c.places(facts.faller.places)) : null,
  ].filter((x): x is string => x !== null);
  return <p className={styles.snapshotSummary}>{parts.join(" ")}</p>;
}

/** `snapshot` is null when that gameweek hasn't been saved yet. */
/** `now` only salts the wording of a missing snapshot (a saved one carries its own salt); tests pass a fixed date. */
export function SnapshotView({ gw, snapshot, now }: { gw: number; snapshot: SnapshotModel | null; now?: Date }) {
  const t = getT();
  const h = t.history;
  const f = getFormat();
  const back = <Link href="/times#tables">{h.back}</Link>;

  if (!snapshot) {
    return (
      <>
        <PageHeader back={back} eyebrow={h.eyebrow} title={t.common.gameweek(gw)} />
        <StateMessage title={h.missingTitle(gw)} action={<ButtonLink href="/">{t.common.seeLiveTable}</ButtonLink>}>
          <p>{pickVariant(h.missingBody, varietyKey(gw, "upcoming", now ?? new Date(0)), 1)}</p>
        </StateMessage>
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={back}
        eyebrow={snapshot.leagueName}
        title={h.standings(gw)}
        meta={
          <span>
            {snapshot.rebuilt ? h.rebuilt : h.saved} <LocalTime iso={snapshot.rebuilt?.builtAt ?? snapshot.takenAt} />
          </span>
        }
      />
      {snapshot.rebuilt ? (
        <StateMessage tone="info" title={h.rebuiltTitle}>
          <p>{h.rebuiltBody}</p>
          {snapshot.rebuilt.level.length ? (
            <p>
              {h.levelLead}
              <em>{h.levelEm}</em>
              {h.level(snapshot.rebuilt.level.map((g) => h.levelGroup(g.names.join(h.and), f.number(g.total))).join("; "))}
            </p>
          ) : null}
          {snapshot.rebuilt.movementApproximate ? <p>{h.movementNote}</p> : null}
        </StateMessage>
      ) : null}
      {snapshot.facts ? <Summary facts={snapshot.facts} variety={snapshot.variety} /> : null}
      <StandingsTable rows={snapshot.rows} caption={h.standingsAfter(snapshot.leagueName, gw)} hideCaption />
    </>
  );
}
