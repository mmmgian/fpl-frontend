import type { Metadata } from "next";
import { BonusView } from "@/components/views/BonusView";
import { services } from "@/lib/container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bonus points" };

type Props = { searchParams: Promise<{ gw?: string | string[] }> };

export default async function BonusPage({ searchParams }: Props) {
  return <BonusView model={await services.bonus.load((await searchParams).gw)} />;
}
