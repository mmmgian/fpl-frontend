import { HistoryListView } from "@/components/views/HistoryListView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { initLocale } from "@/app/locale";

/**
 * The past league tables, under the newspapers. It streams in after them: the history server runs on free hosting
 * that can take a while to wake, and the newspapers should not wait for it.
 */
export async function TablesArchive() {
  await initLocale();
  const shelf = await services.history.shelf(leagueId());
  return <HistoryListView snapshots={shelf.snapshots} shelf={shelf} />;
}
