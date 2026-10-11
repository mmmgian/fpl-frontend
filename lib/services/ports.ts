/**
 * Ports: what the use cases need from the outside world, expressed in domain terms.
 * Adapters in lib/fpl and lib/backend implement these; services never import an adapter.
 *
 * "Not found" is part of the contract (null), so services don't need to know about HTTP status codes.
 * Any other failure rejects.
 */
import type { EuropeMatch, Headline } from "../domain/club";
import type { Issue, IssueSummary } from "../domain/times";
import type {
  Bootstrap, Entry, EntryHistory, EntryPicks, EventLive, Fixture, LeagueStandings, ScheduledFixture, Snapshot, SnapshotSummary,
} from "../domain/types";

export interface FplPort {
  bootstrap(): Promise<Bootstrap>;
  /** All fetched pages of a classic league; null if the league doesn't exist. */
  standings(leagueId: number): Promise<LeagueStandings | null>;
  /** null if the team doesn't exist. */
  entry(entryId: number): Promise<Entry | null>;
  /** null if FPL has no picks for that team and gameweek. `settled` lets the adapter cache finished gameweeks longer. */
  picks(entryId: number, gw: number, settled: boolean): Promise<EntryPicks | null>;
  live(gw: number, settled: boolean): Promise<EventLive>;
  fixtures(gw: number, settled: boolean): Promise<Fixture[]>;
  /** The whole season's schedule with difficulty ratings. */
  allFixtures(): Promise<ScheduledFixture[]>;
  /** A manager's season so far; null if the team doesn't exist. */
  history(entryId: number): Promise<EntryHistory | null>;
}

export interface HistoryPort {
  /** Oldest first. */
  list(leagueId: number): Promise<SnapshotSummary[]>;
  /** null if no snapshot exists for that gameweek. */
  get(leagueId: number, gw: number): Promise<Snapshot | null>;
}

export interface TimesPort {
  /** Every issue, in no particular order. */
  library(): Promise<IssueSummary[]>;
  /** One issue with its pages (sizes, not text: that is fetched on demand); null if there is no such issue. */
  issue(id: string): Promise<Issue | null>;
}

/** The drawn avatars for managers who have no badge of their own. */
export interface AvatarPort {
  /** A URL for the manager's avatar, or null if none has been drawn. */
  src(entry: number): string | null;
}

/** Written news about a club, from an outside publisher. */
export interface NewsPort {
  /** Null if the publisher has nothing for this club. Rejects if the publisher can't be reached. */
  headlines(club: { name: string }): Promise<{ items: Headline[]; creditUrl: string } | null>;
}

/** A club's European fixtures, from an outside data provider. */
export interface EuropePort {
  /** Rejects if the provider can't be reached or doesn't know the club. */
  fixtures(club: { name: string; short: string }): Promise<EuropeMatch[]>;
}

/** Injectable clock, so "is this gameweek live?" is testable. */
export interface ServiceOptions {
  now?: () => Date;
  /** If given, managers without a badge of their own get their drawn avatar. */
  avatars?: AvatarPort;
}
