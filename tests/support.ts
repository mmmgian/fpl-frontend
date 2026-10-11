/** Fakes for the service layer: ports backed by in-memory fixtures, so use cases are tested with no fetch at all. */
import type { Bootstrap, Fixture } from "@/lib/domain/types";
import { createBonusService } from "@/lib/services/bonus";
import type { FixtureCard } from "@/lib/services/models";
import type { FplPort, HistoryPort } from "@/lib/services/ports";
import { bootstrap, live, picks } from "./fixtures";

export const NOW = new Date("2026-10-11T12:00:00Z");
export const clock = () => NOW;

const unexpected = (name: string) => () => {
  throw new Error(`unexpected call to fpl.${name}`);
};

/** A port that serves the shared fixtures; override any method per test. Unlisted calls fail loudly. */
export function fakeFpl(over: Partial<FplPort> = {}): FplPort {
  return {
    bootstrap: async () => bootstrap,
    standings: unexpected("standings"),
    entry: unexpected("entry"),
    picks: async () => picks,
    live: async () => live,
    fixtures: async () => [],
    allFixtures: async () => [],
    history: async () => null,
    ...over,
  };
}

export function fakeHistory(over: Partial<HistoryPort> = {}): HistoryPort {
  return { list: async () => [], get: async () => null, ...over };
}

/** Run a fixture through the real bonus use case to get the card a view would receive. */
export async function cardFor(f: Fixture, bs: Bootstrap = bootstrap): Promise<FixtureCard> {
  const model = await createBonusService(fakeFpl({ bootstrap: async () => bs, fixtures: async () => [f] }), { now: clock }).load(undefined);
  if (model.kind !== "ok") throw new Error("expected an ok bonus model");
  return model.fixtures[0];
}
