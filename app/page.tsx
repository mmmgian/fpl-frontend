import { Suspense } from "react";
import { LeagueExtrasFallback, LeagueView } from "@/components/views/LeagueView";
import { leagueId } from "@/lib/config";
import { services } from "@/lib/container";
import { initLocale } from "@/app/locale";
import { warmHistoryAfterResponse } from "./_warm";
import { LeagueExtrasStream, ifAlreadyIn } from "./_league/Extras";

export const dynamic = "force-dynamic";

/**
 * The table is sent as soon as FPL returns the standings (and the small, cached game file). The storyline, awards and
 * stats need one request per manager, so they stream in behind a Suspense boundary, with placeholders holding their
 * place meanwhile.
 */
export default async function LeaguePage() {
  await initLocale();
  warmHistoryAfterResponse();
  const { model, extras, pending } = await services.league.loadStreaming(leagueId());
  if (model.kind !== "ok" || !pending) return <LeagueView model={model} />;
  const ready = await ifAlreadyIn(extras);
  if (ready) return <LeagueView model={{ ...model, ...ready }} />;
  return (
    <LeagueView
      model={model}
      extras={
        <Suspense fallback={<LeagueExtrasFallback model={model} />}>
          <LeagueExtrasStream model={model} extras={extras} />
        </Suspense>
      }
    />
  );
}
