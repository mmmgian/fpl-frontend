import { cache } from "react";

/**
 * Whether this request is for the altered view (see lib/domain/trip.ts), set beside the language by `initLocale`.
 * Kept apart from the language module so that small components shared with the browser (a crest) can read it
 * without pulling every language's catalog into the bundle. In the browser it is simply false.
 */
const slot = cache(() => ({ on: false }));

export function setRequestTrip(on: boolean): void {
  slot().on = on;
}
export const isTrip = (): boolean => slot().on;
