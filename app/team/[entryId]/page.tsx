import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { TeamView } from "@/components/views/TeamView";
import { services } from "@/lib/container";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ gw?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const found = await services.team.resolve((await params).entryId);
  const team = found ? await services.team.identify(found.entryId) : null;
  if (!team) return { title: getT().meta.team };
  const title = `${team.teamName} (${team.firstName} ${team.lastName})`;
  const press = team.mascot?.press;
  return {
    title,
    alternates: found?.slug ? { canonical: `/team/${found.slug}` } : undefined,
    // Shared, the link shows the team's mascot at its press conference.
    openGraph: press ? { title, images: [{ url: press.src, width: press.width, height: press.height, alt: team.teamName }] } : { title },
  };
}

export default async function TeamPage({ params, searchParams }: Props) {
  await initLocale();
  const param = (await params).entryId;
  const found = await services.team.resolve(param);
  if (!found) notFound();
  // A team number is sent on to the team's name, keeping the gameweek: one address for each team.
  const { gw } = await searchParams;
  if (found.slug && found.slug !== param) permanentRedirect(`/team/${found.slug}${typeof gw === "string" ? `?gw=${encodeURIComponent(gw)}` : ""}`);

  const model = await services.team.load(found.entryId, gw);
  if (model.kind === "not-found") notFound();
  return <TeamView model={model} />;
}
