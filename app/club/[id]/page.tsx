import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ClubView } from "@/components/views/ClubView";
import { services } from "@/lib/container";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  // The title can fall back to a generic one; the page itself shows the error if FPL is down.
  const found = await services.club.resolve((await params).id).catch(() => null);
  const club = found ? await services.club.identify(found.id) : null;
  return { title: club?.name ?? getT().meta.club, alternates: found && club ? { canonical: `/club/${found.slug}` } : undefined };
}

export default async function ClubPage({ params }: Props) {
  await initLocale();
  const param = (await params).id;
  const found = await services.club.resolve(param);
  if (!found) notFound();
  // A number, or a short name, is sent on to the club's name: one address for each club.
  if (found.slug !== param && /^[a-z0-9-]+$/.test(found.slug)) permanentRedirect(`/club/${found.slug}`);
  const model = await services.club.load(found.id);
  if (model.kind === "not-found") notFound();
  return <ClubView model={model} />;
}
