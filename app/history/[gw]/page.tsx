import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnapshotView } from "@/components/views/SnapshotView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { parseSnapshotGw } from "@/lib/domain";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ gw: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const gw = parseSnapshotGw((await params).gw);
  const t = getT().meta;
  return { title: gw ? t.snapshot(gw) : t.history };
}

export default async function SnapshotPage({ params }: Props) {
  await initLocale();
  const gw = parseSnapshotGw((await params).gw);
  if (!gw) notFound();

  return <SnapshotView gw={gw} snapshot={await services.history.snapshot(leagueId(), gw)} now={new Date()} />;
}
