import Link from "next/link";
import { ButtonLink, LocalTime, PageHeader, StateMessage, getFormat, getT } from "@/components/ui";
import type { SnapshotModel } from "@/lib/services/models";
import { StandingsTable } from "./StandingsTable";

/** `snapshot` is null when that gameweek hasn't been saved yet. */
export function SnapshotView({ gw, snapshot }: { gw: number; snapshot: SnapshotModel | null }) {
  const t = getT();
  const h = t.history;
  const f = getFormat();
  const back = <Link href="/times#tables">{h.back}</Link>;

  if (!snapshot) {
    return (
      <>
        <PageHeader back={back} eyebrow={h.eyebrow} title={t.common.gameweek(gw)} />
        <StateMessage title={h.missingTitle(gw)} action={<ButtonLink href="/">{t.common.seeLiveTable}</ButtonLink>}>
          <p>{h.missingBody}</p>
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
      <StandingsTable rows={snapshot.rows} caption={h.standingsAfter(snapshot.leagueName, gw)} hideCaption />
    </>
  );
}
