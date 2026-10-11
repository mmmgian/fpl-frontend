import { LeagueView } from "@/components/views/LeagueView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  return <LeagueView model={await services.league.load(leagueId())} />;
}
