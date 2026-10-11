import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClubView } from "@/components/views/ClubView";
import { services } from "@/lib/container";
import { parseEntryId } from "@/lib/domain";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const id = parseEntryId((await params).id);
  const club = id ? await services.club.identify(id) : null;
  return { title: club?.name ?? getT().meta.club };
}

export default async function ClubPage({ params }: Props) {
  await initLocale();
  const id = parseEntryId((await params).id);
  if (!id) notFound();
  const model = await services.club.load(id);
  if (model.kind === "not-found") notFound();
  return <ClubView model={model} />;
}
