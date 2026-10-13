import type { Metadata } from "next";
import { Suspense } from "react";
import { TimesLibraryView } from "@/components/views/TimesLibraryView";
import { services } from "@/lib/container";
import { LoadingState, Skeleton, getT } from "@/components/ui";
import styles from "@/components/views/views.module.css";
import { pickVariant, varietyKey } from "@/lib/domain";
import { TablesArchive } from "./archive";
import { initLocale } from "@/app/locale";
import { openGraph } from "@/app/meta";

// The past tables stream in from a history server that can take most of a minute to wake from sleep.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  const t = getT().meta;
  return {
    title: t.times,
    description: t.timesDescription,
    openGraph: openGraph(t.timesDescription, { title: t.times }),
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
      {/* The anchor wraps the fallback too, so "← Past tables" lands here even while the tables are still loading. */}
      <div id="tables">
        <Suspense fallback={<TablesLoading />}>
          <TablesArchive />
        </Suspense>
      </div>
    </>
  );
}

/** The past tables while the history server wakes: say what's coming and, after a few seconds, why it's slow. */
function TablesLoading() {
  const t = getT();
  return (
    <LoadingState label={pickVariant(t.loading.history, varietyKey(0, "upcoming", new Date()), 1)} slowHint={t.loading.historySlow}>
      <h2 className={styles.tablesTitle}>{t.history.title}</h2>
      <div className={styles.snapshotList}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={74} radius={12} />
        ))}
      </div>
    </LoadingState>
  );
}
