import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TimesReaderView } from "@/components/views/TimesReaderView";
import { services } from "@/lib/container";

type Props = {
  params: Promise<{ issue: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const model = await services.times.issue((await params).issue, undefined);
  return {
    title: model.kind === "ok" ? model.issue.title : "The Times",
    robots: { index: false, follow: false },
  };
}

export default async function IssuePage({ params, searchParams }: Props) {
  const model = await services.times.issue((await params).issue, (await searchParams).p);
  if (model.kind === "not-found") notFound();
  return <TimesReaderView model={model} />;
}
