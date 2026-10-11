import type { Metadata } from "next";
import { FixturesView } from "@/components/views/FixturesView";
import { services } from "@/lib/container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fixtures" };

type Props = { searchParams: Promise<{ gw?: string | string[]; n?: string | string[] }> };

export default async function FixturesPage({ searchParams }: Props) {
  const { gw, n } = await searchParams;
  return <FixturesView model={await services.fixtures.load(gw, n)} />;
}
