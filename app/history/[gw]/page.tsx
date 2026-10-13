import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnapshotView } from "@/components/views/SnapshotView";
import { SITE_NAME, leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { parseSnapshotGw } from "@/lib/domain";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";
import { openGraph } from "@/app/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ gw: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const gw = parseSnapshotGw((await params).gw);
  const t = getT().meta;
  if (!gw) return { title: t.history };
  const title = t.snapshot(gw);
  const description = t.snapshotDescription(gw, SITE_NAME);
  return { title, description, openGraph: openGraph(description, { title }) };
}

export default async function SnapshotPage({ params }: Props) {
  await initLocale();
  const gw = parseSnapshotGw((await params).gw);
  if (!gw) notFound();

  // The list of saved gameweeks only feeds the pager: if it can't be read, the table still shows.
  const [snapshot, list] = await Promise.all([services.history.snapshot(leagueId(), gw), services.history.list(leagueId()).catch(() => null)]);
  return <SnapshotView gw={gw} snapshot={snapshot} saved={list?.map((s) => s.gw) ?? null} now={new Date()} />;
}
