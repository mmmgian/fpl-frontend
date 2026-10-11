import type { Metadata } from "next";
import { FixtureFeedView } from "@/components/views/FixtureFeedView";
import { FixturesView } from "@/components/views/FixturesView";
import { services } from "@/lib/container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fixtures" };

type Props = { searchParams: Promise<{ gw?: string | string[]; n?: string | string[] }> };

export default async function FixturesPage({ searchParams }: Props) {
  const { gw, n } = await searchParams;
  // No window asked for: the whole season as a feed. A window (?n=3, 5 or 10) is the difficulty grid.
  if (n === undefined) return <FixtureFeedView model={await services.fixtures.feed(gw)} />;
  return <FixturesView model={await services.fixtures.load(gw, n)} />;
}
