import type { Metadata } from "next";
import { TimesLibraryView } from "@/components/views/TimesLibraryView";
import { services } from "@/lib/container";

export const metadata: Metadata = {
  title: "The Times",
  description: "Every Lobster League report, recap, plan and newspaper, one page at a time.",
  // Keep league material out of search results. This makes it unlisted, not private: the page is open to anyone
  // with the link. (Its PDFs and images get the same hint from an X-Robots-Tag header in next.config.ts.)
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ kind?: string | string[] }> };

export default async function TimesPage({ searchParams }: Props) {
  return <TimesLibraryView model={await services.times.library((await searchParams).kind)} />;
}
