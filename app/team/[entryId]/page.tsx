import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamView } from "@/components/views/TeamView";
import { services } from "@/lib/container";
import { parseEntryId } from "@/lib/domain";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ gw?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const id = parseEntryId((await params).entryId);
  const team = id ? await services.team.identify(id) : null;
  return { title: team ? `${team.teamName} (${team.firstName} ${team.lastName})` : getT().meta.team };
}

export default async function TeamPage({ params, searchParams }: Props) {
  await initLocale();
  const id = parseEntryId((await params).entryId);
  if (!id) notFound();

  const model = await services.team.load(id, (await searchParams).gw);
  if (model.kind === "not-found") notFound();
  return <TeamView model={model} />;
}
