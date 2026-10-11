import type { Metadata } from "next";
import { BonusView } from "@/components/views/BonusView";
import { services } from "@/lib/container";
import { getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: getT().meta.bonus };
}

type Props = { searchParams: Promise<{ gw?: string | string[] }> };

export default async function BonusPage({ searchParams }: Props) {
  await initLocale();
  return <BonusView model={await services.bonus.load((await searchParams).gw)} />;
}
