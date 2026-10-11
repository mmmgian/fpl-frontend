import type { Metadata } from "next";
import { HistoryListView } from "@/components/views/HistoryListView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // free Render instance can take ~40s to wake
export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: getT().meta.history };
}

export default async function HistoryPage() {
  await initLocale();
  return <HistoryListView snapshots={await services.history.list(leagueId())} />;
}
