import type { Metadata } from "next";
import { ToolsView } from "@/components/views/ToolsView";
import { getT } from "@/components/ui";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import type { ToolsQuery } from "@/lib/services/tools";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: getT().meta.tools, description: getT().meta.toolsDescription };
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<ToolsQuery> }) {
  await initLocale();
  return <ToolsView model={await services.tools.load(leagueId(), await searchParams)} />;
}
