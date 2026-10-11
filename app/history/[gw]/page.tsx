import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnapshotView } from "@/components/views/SnapshotView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { parseSnapshotGw } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ gw: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gw = parseSnapshotGw((await params).gw);
  return { title: gw ? `GW${gw} standings` : "History" };
}

export default async function SnapshotPage({ params }: Props) {
  const gw = parseSnapshotGw((await params).gw);
  if (!gw) notFound();

  return <SnapshotView gw={gw} snapshot={await services.history.snapshot(leagueId(), gw)} />;
}
