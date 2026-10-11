import type { Metadata } from "next";
import { HistoryListView } from "@/components/views/HistoryListView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // free Render instance can take ~40s to wake
export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  return <HistoryListView snapshots={await services.history.list(leagueId())} />;
}
