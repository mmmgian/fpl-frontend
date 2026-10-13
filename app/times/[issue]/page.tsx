import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TimesReaderView } from "@/components/views/TimesReaderView";
import { services } from "@/lib/container";
import { getLocale, getT } from "@/components/ui";
import { issueAssets, localizeIssue } from "@/lib/domain";
import { initLocale } from "@/app/locale";
import { openGraph } from "@/app/meta";

type Props = {
  params: Promise<{ issue: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await initLocale();
  const t = getT();
  const model = await services.times.issue((await params).issue, undefined);
  const robots = { index: false, follow: false };
  if (model.kind !== "ok") return { title: t.meta.times, robots };
  const issue = localizeIssue(model.issue, getLocale());
  // Every newspaper is called "The Lobster Times": the gameweek (or the kicker) is what tells two tabs or two shared links apart.
  const title = issue.gameweek ? `${issue.title}, ${t.common.gw(issue.gameweek)}` : issue.kicker ? `${issue.title} · ${issue.kicker}` : issue.title;
  const description = issue.summary ?? t.meta.timesDescription;
  return {
    title,
    description,
    openGraph: openGraph(description, {
      title,
      type: "article",
      publishedTime: issue.published,
      images: [{ url: issueAssets.page(issue.id, 1, "l"), width: issue.cover.width, height: issue.cover.height, alt: title }],
    }),
    robots,
  };
}

export default async function IssuePage({ params, searchParams }: Props) {
  await initLocale();
  const model = await services.times.issue((await params).issue, (await searchParams).p);
  if (model.kind === "not-found") notFound();
  return <TimesReaderView model={model} />;
}
