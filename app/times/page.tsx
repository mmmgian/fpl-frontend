import type { Metadata } from "next";
import { Suspense } from "react";
import { TimesLibraryView } from "@/components/views/TimesLibraryView";
import { services } from "@/lib/container";
import { Skeleton, getT } from "@/components/ui";
import { TablesArchive } from "./archive";
import { initLocale } from "@/app/locale";

export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  const t = getT().meta;
  return {
    title: t.times,
    description: t.timesDescription,
    // Keep league material out of search results. This makes it unlisted, not private: the page is open to anyone
    // with the link. (Its PDFs and images get the same hint from an X-Robots-Tag header in next.config.ts.)
    robots: { index: false, follow: false },
  };
}

type Props = { searchParams: Promise<{ kind?: string | string[] }> };

export default async function TimesPage({ searchParams }: Props) {
  await initLocale();
  const model = await services.times.library((await searchParams).kind);
  return (
    <>
      <TimesLibraryView model={model} />
      <Suspense fallback={<Skeleton height={120} radius={16} />}>
        <TablesArchive />
      </Suspense>
    </>
  );
}
