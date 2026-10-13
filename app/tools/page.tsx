import type { Metadata } from "next";
import { ToolsView } from "@/components/views/ToolsView";
import { getT } from "@/components/ui";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import type { ToolsQuery } from "@/lib/services/tools";
import { initLocale } from "@/app/locale";
import { toolsSlots } from "./Deferred";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: getT().meta.tools, description: getT().meta.toolsDescription };
}

/**
 * Paints as soon as the cheap tools are ready (bootstrap, schedule, standings); effective ownership and the league tools,
 * which read every covered manager's squad, stream in behind it.
 */
export default async function ToolsPage({ searchParams }: { searchParams: Promise<ToolsQuery> }) {
  await initLocale();
  const stream = await services.tools.loadStreaming(leagueId(), await searchParams);
  return <ToolsView model={stream.model} deferred={toolsSlots(stream)} />;
}
