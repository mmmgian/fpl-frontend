import { LeagueExtrasSections } from "@/components/views/LeagueView";
import type { LeagueExtras, LeagueTable } from "@/lib/services/models";

/**
 * The League page's storyline, awards and stats-filled table, streamed in behind a Suspense boundary once the
 * managers' histories and squads are back. The promise never rejects (see LeagueStream), so this never throws for want
 * of data: the worst case is the table as it already was.
 */
export async function LeagueExtrasStream({ model, extras }: { model: LeagueTable; extras: Promise<LeagueExtras> }) {
  return <LeagueExtrasSections model={{ ...model, ...(await extras) }} />;
}

/**
 * The extras if they are already here, else null. One macrotask is less than any network or cache round trip, so this
 * never delays the table; it only spares a skeleton that would flash for a frame when everything came back at once.
 */
export async function ifAlreadyIn<T>(work: Promise<T>): Promise<T | null> {
  const notYet = Symbol("not yet");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = new Promise<typeof notYet>((resolve) => (timer = setTimeout(() => resolve(notYet), 0)));
  const first = await Promise.race([work, tick]);
  clearTimeout(timer);
  return first === notYet ? null : (first as T);
}
