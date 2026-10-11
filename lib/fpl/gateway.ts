/** Adapter: the FPL API as seen through the `FplPort` the services depend on. */
import type { FplPort } from "../services/ports";
import { getBootstrap } from "./bootstrap";
import { getAllFixtures, getEntry, getEntryHistory, getEntryPicks, getEventLive, getFixtures, getLeagueStandings } from "./endpoints";
import { isNotFound } from "./http";

/** Map FPL's 404 to null (the port's "not found"); every other failure still rejects. */
const orNull = <T>(request: Promise<T>): Promise<T | null> =>
  request.catch((e: unknown) => {
    if (isNotFound(e)) return null;
    throw e;
  });

export const fplGateway: FplPort = {
  bootstrap: getBootstrap,
  standings: (leagueId) => orNull(getLeagueStandings(leagueId)),
  entry: (entryId) => orNull(getEntry(entryId)),
  picks: (entryId, gw, settled) => orNull(getEntryPicks(entryId, gw, settled)),
  live: getEventLive,
  fixtures: getFixtures,
  allFixtures: getAllFixtures,
  history: (entryId) => orNull(getEntryHistory(entryId)),
};
