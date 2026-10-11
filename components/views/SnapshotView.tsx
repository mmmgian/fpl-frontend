import Link from "next/link";
import { ButtonLink, LocalTime, PageHeader, StateMessage } from "@/components/ui";
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
          <p>Snapshots are saved after a gameweek ends and bonus is confirmed. This one hasn&apos;t been taken yet.</p>
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
            Saved <LocalTime iso={snapshot.takenAt} />
          </span>
        }
      />
      <StandingsTable rows={snapshot.rows} caption={`${snapshot.leagueName} standings after Gameweek ${gw}`} hideCaption />
    </>
  );
}
