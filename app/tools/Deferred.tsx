import { Suspense } from "react";
import {
  ToolsEoCard,
  ToolsEoPending,
  ToolsInjuries,
  ToolsInjuriesNav,
  ToolsInjuriesPending,
  ToolsLeagueNav,
  ToolsLeaguePending,
  ToolsLeagueSections,
  type ToolsDeferredSlots,
} from "@/components/views/ToolsView";
import type { ToolsModel } from "@/lib/services/models";
import type { ToolsStream } from "@/lib/services/tools";
import { initLocale } from "@/app/locale";

type Parts = Pick<ToolsStream, "model" | "deferred">;

/** The full model once the league fan-out has settled (it never rejects, and settles by the page's deadline). */
async function arrived({ model, deferred }: Parts): Promise<ToolsModel> {
  const late = await deferred;
  // Streamed after the page itself: make sure this part speaks the same language and mode as the rest.
  await initLocale();
  return { ...model, ...late };
}

async function DeferredEo(parts: Parts) {
  return <ToolsEoCard model={await arrived(parts)} />;
}

async function DeferredLeague(parts: Parts) {
  return <ToolsLeagueSections model={await arrived(parts)} />;
}

async function DeferredNav(parts: Parts) {
  return <ToolsLeagueNav model={await arrived(parts)} />;
}

async function DeferredInjuries(parts: Parts) {
  return <ToolsInjuries model={await arrived(parts)} />;
}

async function DeferredInjuriesNav(parts: Parts) {
  return <ToolsInjuriesNav model={await arrived(parts)} />;
}

/**
 * The Tools page's league-dependent parts as streamed slots: the page paints with the cheap tools straight away and these
 * fill in behind <Suspense> once every covered manager's squad has been read. Each placeholder holds its part's place and
 * says what it is waiting for; the league tools' placeholder simply goes away if there turn out to be none, and their
 * jump links appear with their sections, so no link points at nothing.
 */
export function toolsSlots({ model, deferred, kept }: ToolsStream): ToolsDeferredSlots {
  const variety = model.phase.variety;
  return {
    kept,
    eo: (
      <Suspense fallback={<ToolsEoPending variety={variety} />}>
        <DeferredEo model={model} deferred={deferred} />
      </Suspense>
    ),
    league: (
      <Suspense fallback={<ToolsLeaguePending variety={variety} />}>
        <DeferredLeague model={model} deferred={deferred} />
      </Suspense>
    ),
    nav: (
      <Suspense fallback={null}>
        <DeferredNav model={model} deferred={deferred} />
      </Suspense>
    ),
    injuries: (
      <Suspense fallback={<ToolsInjuriesPending variety={variety} />}>
        <DeferredInjuries model={model} deferred={deferred} />
      </Suspense>
    ),
    injuriesNav: (
      <Suspense fallback={null}>
        <DeferredInjuriesNav model={model} deferred={deferred} />
      </Suspense>
    ),
  };
}
