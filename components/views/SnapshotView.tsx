import Link from "next/link";
import { ButtonLink, LocalTime, PageHeader, StateMessage } from "@/components/ui";
import { formatNumber } from "@/lib/domain";
import type { SnapshotModel } from "@/lib/services/models";
import { StandingsTable } from "./StandingsTable";

const back = <Link href="/history">← All snapshots</Link>;

/** `snapshot` is null when that gameweek hasn't been saved yet. */
export function SnapshotView({ gw, snapshot }: { gw: number; snapshot: SnapshotModel | null }) {
  if (!snapshot) {
    return (
      <>
        <PageHeader back={back} eyebrow="History" title={`Gameweek ${gw}`} />
        <StateMessage title={`No snapshot for Gameweek ${gw}`} action={<ButtonLink href="/">See the live table</ButtonLink>}>
          <p>No photo of this one yet. Snapshots are taken once a gameweek is over and its bonus points are confirmed.</p>
        </StateMessage>
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={back}
        eyebrow={snapshot.leagueName}
        title={`Gameweek ${gw} standings`}
        meta={
          <span>
            {snapshot.rebuilt ? "Rebuilt" : "Saved"} <LocalTime iso={snapshot.rebuilt?.builtAt ?? snapshot.takenAt} />
          </span>
        }
      />
      {snapshot.rebuilt ? (
        <StateMessage tone="info" title="Rebuilt after the gameweek">
          <p>
            This table wasn&apos;t saved at the time. It was rebuilt from each manager&apos;s FPL results: the points are FPL&apos;s own and the order is worked out from them.
            Managers level on points are ordered by overall rank, as FPL does.
          </p>
          {snapshot.rebuilt.level.length ? (
            <p>
              Level on points <em>and</em> overall rank, so their order is approximate (marked ≈):{" "}
              {snapshot.rebuilt.level.map((g) => `${g.names.join(" and ")} (${formatNumber(g.total)} pts)`).join("; ")}.
            </p>
          ) : null}
          {snapshot.rebuilt.movementApproximate ? (
            <p>A ≈ beside a rise, fall or dash means one of the two ranks it compares is approximate, so the change may be a place out.</p>
          ) : null}
        </StateMessage>
      ) : null}
      <StandingsTable rows={snapshot.rows} caption={`${snapshot.leagueName} standings after Gameweek ${gw}`} hideCaption />
    </>
  );
}
