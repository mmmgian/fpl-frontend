import { LeagueView } from "@/components/views/LeagueView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { initLocale } from "@/app/locale";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  await initLocale();
  return <LeagueView model={await services.league.load(leagueId())} />;
}
