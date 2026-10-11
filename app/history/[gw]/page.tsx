import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, LocalTime, PageHeader, StateMessage } from "@/components/ui";
import { StandingsTable } from "@/components/views/StandingsTable";
import { getSnapshot } from "@/lib/backend";
import { leagueId } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ gw: string }> };

function parseGwParam(raw: string): number | null {
  return /^\d{1,2}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 38 ? Number(raw) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gw = parseGwParam((await params).gw);
  return { title: gw ? `GW${gw} standings` : "History" };
}

const back = <Link href="/history">← All snapshots</Link>;

export default async function SnapshotPage({ params }: Props) {
  const gw = parseGwParam((await params).gw);
  if (!gw) notFound();

  const snap = await getSnapshot(leagueId(), gw);
  if (!snap) {
    return (
      <>
        <PageHeader back={back} eyebrow="History" title={`Gameweek ${gw}`} />
        <StateMessage title={`No snapshot for Gameweek ${gw}`} action={<ButtonLink href="/">See the live table</ButtonLink>}>
          <p>Snapshots are saved after a gameweek ends and bonus is confirmed. This one hasn&apos;t been taken yet.</p>
        </StateMessage>
      </>
    );
  }

  const rows = snap.data?.standings?.results ?? [];
  const name = snap.data?.league?.name ?? "League";

  return (
    <>
      <PageHeader
        back={back}
        eyebrow={name}
        title={`Gameweek ${gw} standings`}
        meta={
          <span>
            Saved <LocalTime iso={snap.taken_at} />
          </span>
        }
      />
      <StandingsTable rows={rows} caption={`${name} standings after Gameweek ${gw}`} hideCaption />
    </>
  );
}
