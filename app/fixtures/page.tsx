import type { Metadata } from "next";
import { FixtureFeedView } from "@/components/views/FixtureFeedView";
import { FixturesView } from "@/components/views/FixturesView";
import { services } from "@/lib/container";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: getT().meta.fixtures };
}

type Props = { searchParams: Promise<{ gw?: string | string[]; n?: string | string[] }> };

export default async function FixturesPage({ searchParams }: Props) {
  await initLocale();
  const { gw, n } = await searchParams;
  // No window asked for: the whole season as a feed. A window (?n=3, 5 or 10) is the difficulty grid.
  if (n === undefined) return <FixtureFeedView model={await services.fixtures.feed(gw)} />;
  return <FixturesView model={await services.fixtures.load(gw, n)} />;
}
