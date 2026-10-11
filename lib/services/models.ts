/**
 * View models: the plain, serialisable data each page needs, already decided by a use case.
 * Views render these and nothing else, so they need no domain logic and no data access.
 * Every model is a discriminated union on `kind`, so a view must handle every state.
 */
import type {
  AutoSub, BenchInsight, BonusSource, CaptainInsight, ChipSlot, DefconProgress, FdrBand, FdrWindow, FixtureOutlook, FixtureState,
  FreeTransfers, GwStatus, Ownership, PlayersRemaining, RotationRisk, SeasonForm, SquadFlag, StandingRow, TeamSheet, Tenure,
} from "../domain";

// ---------- League table ----------

export interface GameweekInfo {
  name: string;
  status: GwStatus;
}

export interface LeagueSummary {
  leader: { entryName: string; total: number };
  /** Best gameweek score; null when there is no current gameweek to attribute it to. */
  best: { entryName: string; total: number } | null;
  managers: number;
}

export type LeagueModel =
  | { kind: "not-found"; leagueId: number }
  | {
      kind: "ok";
      leagueId: number;
      name: string;
      /** null before the season starts. */
      gameweek: GameweekInfo | null;
      rows: StandingRow[];
      /** More pages exist than were fetched. */
      truncated: boolean;
      /** Managers who joined but have no row yet (pre-season). */
      newEntries: number;
      /** null for an empty league. */
      summary: LeagueSummary | null;
    };

// ---------- Team sheet ----------

export interface TeamIdentity {
  entryId: number;
  teamName: string;
  firstName: string;
  lastName: string;
  /** "First Last", trimmed. */
  manager: string;
}

export interface TeamGameweek {
  gw: number;
  name: string;
  status: GwStatus;
  /** Navigation bounds: the team's first gameweek .. the latest one. */
  min: number;
  max: number;
  /** The latest gameweek is in progress (enables auto-refresh). */
  isLive: boolean;
}

export interface TeamSummary {
  gwPoints: number;
  /** Transfer hit in points (0 = none). */
  hit: number;
  total: number;
  overallRank: number | null;
  transfers: number;
  /** Tenths of a million, as FPL reports them. */
  value: number;
  bank: number;
}

/** The next opponent shown beside a player. */
export interface NextMatch {
  opponent: string;
  home: boolean;
  difficulty: number;
}

/** Facts about this gameweek's squad. Everything is optional-by-data: empty or null when FPL didn't provide it. */
export interface GameweekInsights {
  captain: CaptainInsight | null;
  /** null when FPL returned no player points. */
  bench: BenchInsight | null;
  /** What the active chip added, isolated (Bench Boost = bench points; Triple Captain = one extra captain copy). */
  chip: { chip: string; points: number } | null;
  autoSubs: AutoSub[];
  /** Fit players with 0 minutes although their club's matches are over. */
  rotation: RotationRisk[];
  /** Only while the gameweek is live. */
  remaining: PlayersRemaining | null;
  defcon: DefconProgress[];
  flags: SquadFlag[];
}

export interface SquadInsights {
  ownership: Ownership | null;
  /** Only for the latest gameweek. */
  outlook: FixtureOutlook | null;
}

export interface SeasonInsights {
  /** Through the last finished gameweek; null until one has finished. */
  form: SeasonForm | null;
  /** The last gameweek of the season, so "free transfers for GW{n+1}" can be hidden at the end. */
  seasonEnd: number;
  tenure: Tenure;
  freeTransfers: FreeTransfers;
  chips: ChipSlot[];
}

export interface TeamInsights {
  gameweek: GameweekInsights;
  squad: SquadInsights;
  /** null when FPL's history for this team couldn't be loaded. */
  season: SeasonInsights | null;
}

export type TeamModel =
  | { kind: "not-found" }
  | { kind: "no-season"; team: TeamIdentity }
  | { kind: "not-started"; team: TeamIdentity; startedEvent: number; deadlineName: string }
  | { kind: "no-picks"; team: TeamIdentity; gameweek: TeamGameweek }
  | {
      kind: "ok";
      team: TeamIdentity;
      gameweek: TeamGameweek;
      /** FPL chip code, e.g. "bboost"; null if none was played. */
      chip: string | null;
      summary: TeamSummary;
      sheet: TeamSheet;
      /** False when FPL returned no player points, so the sheet is shown without scores. */
      showPoints: boolean;
      insights: TeamInsights;
      /** Next opponent(s) by player id (two in a double gameweek); only for the latest gameweek. */
      next: Record<number, NextMatch[]>;
    };

// ---------- Fixture difficulty ----------

export interface FdrMatchView {
  opponent: string;
  home: boolean;
  difficulty: number;
  band: FdrBand;
}

export interface FdrRowView {
  team: { id: number; name: string; short: string; code: number };
  /** 1 = easiest run. */
  rank: number;
  /** One per column; an empty list is a blank gameweek. */
  cells: FdrMatchView[][];
  /** The figure rows are ranked by (difficulty per gameweek, a blank counting as 3), so shown order matches it. */
  average: number;
}

export type FixturesModel =
  | { kind: "no-season" }
  | {
      kind: "ok";
      start: number;
      window: FdrWindow;
      windows: readonly FdrWindow[];
      /** Navigation bounds for the starting gameweek. */
      min: number;
      max: number;
      columns: { gw: number; deadline: string | null }[];
      rows: FdrRowView[];
    };

// ---------- Bonus points ----------

export interface ClubSide {
  name: string;
  short: string;
  code: number | undefined;
}

export interface BonusLine {
  key: string;
  /** Bonus points awarded (3, 2, 1) or 0 for a player just outside the bonus. */
  bonus: number;
  player: string;
  /** Short club name; undefined if the club is unknown. */
  club: string | undefined;
  bps: number;
  /** BPS as a percentage of the match's top BPS, for a bar. */
  share: number;
}

export interface EventLine {
  player: string;
  count: number;
}

export interface FixtureCard {
  id: number;
  state: FixtureState;
  minutes: number;
  home: ClubSide;
  away: ClubSide;
  score: { home: number; away: number } | null;
  kickoff: string | null;
  /** Top BPS per side, with the bonus each earned (or 0). Early in a match many players tie, so each side is capped. */
  bonus: { source: BonusSource; home: BonusLine[]; away: BonusLine[]; hidden: { home: number; away: number } };
  /** Goals, assists and red cards; empty lists when none. */
  events: { goals: EventLine[]; assists: EventLine[]; redCards: EventLine[] };
}

export type BonusModel =
  | { kind: "no-season" }
  | {
      kind: "ok";
      gameweek: { gw: number; name: string; status: GwStatus; min: number; max: number };
      fixtures: FixtureCard[];
      finished: number;
      anyLive: boolean;
      /** Matches by state, for the summary line. */
      counts: { live: number; finished: number; upcoming: number };
    };

// ---------- History ----------

export interface SnapshotListItem {
  gw: number;
  takenAt: string;
}

export interface SnapshotModel {
  gw: number;
  leagueName: string;
  takenAt: string;
  rows: StandingRow[];
}
