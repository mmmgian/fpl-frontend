import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { TeamView } from "@/components/views/TeamView";
import { services } from "@/lib/container";
import { SITE_NAME } from "@/lib/config";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";
import { openGraph } from "@/app/meta";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ gw?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const t = getT().meta;
  // A title is never worth an error page: if FPL is down the page itself says so, with a retry.
  const found = await services.team.resolve((await params).entryId).catch(() => null);
  const team = found ? await services.team.identify(found.entryId) : null;
  if (!team) return { title: t.team };
  // FPL can leave the manager's name out: then just the team, never "Team ()".
  const title = team.manager ? `${team.teamName} (${team.manager})` : team.teamName;
  const description = t.teamDescription(team.teamName, team.manager, SITE_NAME);
  const press = team.mascot?.press;
  return {
    title,
    description,
    alternates: found?.slug ? { canonical: `/team/${found.slug}` } : undefined,
    // Shared, the link shows the team's mascot at its press conference (the site's picture for teams without one).
    openGraph: openGraph(description, { title, ...(press ? { images: [{ url: press.src, width: press.width, height: press.height, alt: team.teamName }] } : {}) }),
  };
}

export default async function TeamPage({ params, searchParams }: Props) {
  await initLocale();
  const param = (await params).entryId;
  // Throws (the retry screen) when the league table can't be loaded to look a name up: that's an outage, not a 404.
  const found = await services.team.resolve(param);
  if (!found) notFound();
  // A team number is sent on to the team's name, keeping the gameweek: one address for each team.
  const { gw } = await searchParams;
  if (found.slug && found.slug !== param) permanentRedirect(`/team/${found.slug}${typeof gw === "string" ? `?gw=${encodeURIComponent(gw)}` : ""}`);

  const model = await services.team.load(found.entryId, gw);
  if (model.kind === "not-found") notFound();
  return <TeamView model={model} />;
}
