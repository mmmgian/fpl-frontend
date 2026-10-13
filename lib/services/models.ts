/**
 * View models: the plain, serialisable data each page needs, already decided by a use case.
 * Views render these and nothing else, so they need no domain logic and no data access.
 * Every model is a discriminated union on `kind`, so a view must handle every state.
 */
import type { GwPhase, Issue, IssueKind, IssueSummary, MatchPulse, ShelfStatus, SnapshotFacts, TransferPulse } from "../domain";
import type { MascotImage } from "./ports";
import type { LeagueTools } from "../domain/leagueTools";
import type { Planning } from "../domain/planning";
import type {
  BestXI, Deadline, Lab, Upside, EoTier, PriceRow, PositionId,
  AutoSub, ClubMatch, ClubNewsItem, ClubOutlook, EuropeMatch, Headline, PredictedXI, Result, BenchInsight, BonusSource, CaptainInsight, ChipSlot, DefconProgress, FdrBand, FdrWindow, FeedGameweek, FixtureOutlook, FixtureState,
  FreeTransfers, GwStatus, LeagueHeadline, LeagueStats, StatsPhase, Ownership, PlayersRemaining, RotationRisk, SeasonCharts, SeasonForm, SquadFlag, StandingRow, TeamSheet, Tenure,
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
      /** null before the season starts, or when FPL's game-info file couldn't be read (see gameweekUnavailable). */
      gameweek: GameweekInfo | null;
      /** FPL's game-info file failed: the gameweek is unknown (not pre-season), and there are no extras. */
      gameweekUnavailable: boolean;
      rows: StandingRow[];
      /** More pages exist than were fetched. */
      truncated: boolean;
      /** Managers who joined but have no row yet (pre-season). */
      newEntries: number;
      /** null for an empty league. */
      summary: LeagueSummary | null;
      /** The fun extras (form, streaks, awards...). null when there is no history to work from. */
      stats: LeagueStats | null;
      /** The current gameweek's number; null before the season starts. */
      currentGw: number | null;
      /** Where the extras' week stands against the current gameweek (null without extras). */
      statsPhase: StatsPhase | null;
      /** The league's storylines, most newsworthy first (see leagueHeadlines). */
      headlines: LeagueHeadline[];
      /** Seeds the wording, never the facts: new every UTC day and whenever FPL moves the gameweek on (see varietyKey). */
      variety: number;
      /**
       * How often the page refreshes itself (ms), or null for never (see refreshPlan): every minute while a match is on,
       * asleep through quiet gaps. Absent in hand-built models: the view falls back to refreshIntervalMs(status).
       */
      refreshMs?: number | null;
      /** Whether anything is being played in the live gameweek (null when not live, or the schedule is unknown). */
      pulse?: MatchPulse | null;
      /** The next deadline still ahead (null once the season is over, or FPL is unreadable). */
      nextDeadline?: { gw: number; at: string } | null;
      /** The season's last gameweek is final: nothing is ahead. */
      seasonOver?: boolean;
    };

/** The league page for a league FPL knows (LeagueModel's "ok" state). */
export type LeagueTable = Extract<LeagueModel, { kind: "ok" }>;

/** What the per-manager histories and squads add to the table: they arrive after it (see LeagueStream). */
export type LeagueExtras = Pick<LeagueTable, "stats" | "statsPhase" | "headlines">;

/**
 * The league page in two parts, so the table can be shown as soon as FPL returns the standings. `model` has
 * everything read off the standings and the game file. While `pending`, its extras are placeholders: no stats and the
 * storylines the table alone can tell. `extras` then has the real ones. It never rejects; a failure or a manager
 * past the deadline means fewer extras, or none. When not `pending`, `model` is already the whole page.
 */
export interface LeagueStream {
  model: LeagueModel;
  extras: Promise<LeagueExtras>;
  pending: boolean;
}

// ---------- Team sheet ----------

export interface TeamIdentity {
  entryId: number;
  teamName: string;
  firstName: string;
  lastName: string;
  /** "First Last", trimmed. */
  manager: string;
  /** The manager's drawn avatar, if there is one; the initials show otherwise. */
  avatar: string | null;
  /** The mascot's football action and press-conference scenes, if drawn. */
  mascot: { action: MascotImage; press: MascotImage; trip: MascotImage | null } | null;
  /** Where the team stands in the league and who is either side of it; set when the page loads the team. */
  league?: LeagueSpot | null;
  /** The team's readable address ("gaucho-f-c"), if the league's table could be read to make it unique. */
  slug?: string | null;
}

export interface LeagueNeighbour {
  entryId: number;
  /** The neighbour's readable address. */
  slug: string;
  teamName: string;
  rank: number;
  /** League points. */
  points: number;
}

/** The team's place in the league table, with the managers just above and just below it. */
export interface LeagueSpot {
  rank: number;
  size: number;
  /** League points. */
  points: number;
  /** The team at the top of the table (this team, when it leads). */
  leader: LeagueNeighbour;
  /** Places climbed since the last gameweek (negative = fell); 0 when unknown. */
  moved: number;
  /** The manager one place higher, if there is one. */
  prev: LeagueNeighbour | null;
  /** The manager one place lower, if there is one. */
  next: LeagueNeighbour | null;
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
  /**
   * Seed for the page's wording (`varietyKey`): changes every UTC day and when FPL moves the gameweek to provisional or
   * final, so copy is redrawn then. Wording only; facts never depend on it. Absent in hand-built models.
   */
  variety?: number;
  /**
   * How often the page refreshes itself (ms), or null for never (see refreshPlan); only the latest gameweek moves.
   * Absent in hand-built models: the view falls back to the status alone.
   */
  refreshMs?: number | null;
  /** Whether anything is being played in the live latest gameweek (null otherwise, or when the schedule is unknown). */
  pulse?: MatchPulse | null;
  /** The next deadline still ahead, for the latest gameweek once it has been played (null otherwise). */
  nextDeadline?: { gw: number; at: string } | null;
  /** The season's last gameweek is final: nothing is ahead. */
  seasonOver?: boolean;
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
  /** How many managers play FPL this season, when FPL says. */
  fieldSize?: number | null;
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
  /** Who little-owned and likely to score the manager could chase (for the altered press conference); null if unknown. */
  upside?: Upside | null;
  /** The lab's simulations and trackers for the next gameweek, with this squad's own players included. */
  lab?: Lab | null;
  ownership: Ownership | null;
  /** Only for the latest gameweek. */
  outlook: FixtureOutlook | null;
}

export interface SeasonInsights {
  /** Through the last finished gameweek; null until one has finished. */
  form: SeasonForm | null;
  /** The series behind the season's charts; null whenever `form` is. */
  charts: SeasonCharts | null;
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

// ---------- A Premier League club ----------

/** What an outside source gave us: the items, why there are none, or that it isn't set up. */
export type Outside<T> =
  | { status: "ok"; items: T }
  | { status: "unavailable" }   // set up, but it failed or doesn't know this club
  | { status: "off" };          // not set up (e.g. no API key)

export interface ClubMatchView extends Omit<ClubMatch, "opponentId"> {
  /** `unknown`: FPL doesn't list this club (no crest, no club page); the view names it in the page's language. */
  opponent: { id: number; name: string; short: string; code: number; unknown?: true };
}

export type ClubModel =
  | { kind: "not-found" }
  | {
      kind: "ok";
      club: { id: number; name: string; short: string; code: number };
      /** Latest results, oldest first. */
      form: Result[];
      next: ClubMatchView[];
      recent: ClubMatchView[];
      news: ClubNewsItem[];
      lineup: PredictedXI | null;
      europe: Outside<EuropeMatch[]>;
      headlines: Outside<{ items: Headline[]; creditUrl: string }>;
      /** Form, the run ahead, the top scorer and who is out: what the opening lines are about. */
      outlook: ClubOutlook;
      /** Salt for the opening lines' wording (see varietyKey); never changes a fact. */
      variety: number;
    };

// ---------- Fixture difficulty ----------

export interface FdrMatchView {
  opponentId: number;
  opponentName: string;
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
      highlights: FdrHighlightsView | null;
      next: NextDeadlineView | null;
      /** Salt for the intro's wording (see varietyKey); never changes a fact. */
      variety: number;
    };

/** The best and worst run, the biggest swing and the first double and blank, with names resolved. */
export interface FdrHighlightsView {
  from: number;
  to: number;
  easiest: { team: string; average: number };
  toughest: { team: string; average: number };
  swing: { team: string; before: number; after: number; from: number } | null;
  double: { gw: number; teams: string[] } | null;
  blank: { gw: number; teams: string[] } | null;
}

/** The next deadline still ahead. */
export interface NextDeadlineView {
  gw: number;
  /** Whole hours until the deadline (0 = under an hour). */
  hours: number;
  matches: number;
}

/** The whole season as a scrollable feed (the Fixtures page's default view). */
export type FixtureFeedModel =
  | { kind: "no-season" }
  | {
      kind: "ok";
      /** Where the feed opens: the current or next gameweek, or the one asked for. */
      startIndex: number;
      gameweeks: FeedGameweek[];
      /** Everything the matches refer to by id. A plain object so it can cross to the browser. */
      teams: Record<number, FeedTeamRef>;
      /** The difficulty-grid windows offered next to the feed. */
      windows: readonly FdrWindow[];
      /** The next few gameweeks from the next deadline. */
      highlights: FdrHighlightsView | null;
      next: NextDeadlineView | null;
      /** Salt for the intro's wording (see varietyKey); never changes a fact. */
      variety: number;
    };

export interface FeedTeamRef {
  id: number;
  name: string;
  short: string;
  code: number;
}

// ---------- Bonus points ----------

export interface ClubSide {
  /** FPL team id, so the club can be linked to; null when the club is unknown. */
  id: number | null;
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
  /** How the bonus race stands (names resolved); null before anyone has BPS. */
  race: BonusRaceView | null;
}

export interface BonusRaceView {
  leader: string;
  bps: number;
  runnerUp: string | null;
  /** BPS between the top two; 0 = level. */
  lead: number | null;
  /** Last in, first out of the bonus, and the BPS between them; only when it is close (BUBBLE_GAP or less). */
  bubble: { inside: string; outside: string; gap: number } | null;
}

export type BonusModel =
  | { kind: "no-season" }
  | {
      kind: "ok";
      gameweek: { gw: number; name: string; status: GwStatus; min: number; max: number };
      fixtures: FixtureCard[];
      finished: number;
      anyLive: boolean;
      /** How long until the page should refresh itself (see refreshPlan); null when nothing on it can change. */
      refreshMs: number | null;
      /** While the week is live: is a match on, is it a quiet gap until the next kick-off, or is everything played. */
      pulse: { state: MatchPulse["state"]; nextKickoff: string | null } | null;
      /** Matches by state, for the summary line. */
      counts: { live: number; finished: number; upcoming: number };
      /** The gameweek's top BPS and the club collecting the most bonus; null before anyone has BPS. */
      summary: { top: { player: string; club: string; bps: number }; bestClub: { club: string; bonus: number } } | null;
      /** Salt for the wording (see varietyKey): new every day and when the gameweek goes live, provisional, final. */
      variety: number;
    };

// ---------- History ----------

export interface SnapshotListItem {
  gw: number;
  takenAt: string;
  /** Rebuilt after the gameweek rather than saved at the time. */
  rebuilt: boolean;
}

export interface SnapshotModel {
  gw: number;
  /** null when the stored table has no league name (the view titles it in the page's language). */
  leagueName: string | null;
  /** "" when the backend stored no time. */
  takenAt: string;
  rows: StandingRow[];
  /** Non-null when the table was rebuilt afterwards instead of saved at the time. */
  rebuilt: { builtAt: string; level: { total: number; names: string[] }[]; movementApproximate: boolean } | null;
  /** The table at a glance (leader, gap, top scorer, biggest moves); null for an empty table. */
  facts: SnapshotFacts | null;
  /** Salt for the wording (see varietyKey): new every day. */
  variety: number;
}

/** The shelf of past tables: the snapshots (null when the history server is down) and where the season stands. */
export interface HistoryShelfModel {
  snapshots: SnapshotListItem[] | null;
  status: ShelfStatus;
  /** Salt for the wording (see varietyKey): new every day and when the gameweek goes live, provisional, final. */
  variety: number;
}

// ---------- The Lobster Times ----------

export interface TimesFilter {
  /** null is "All". */
  value: IssueKind | null;
  label: string;
  count: number;
  active: boolean;
}

/** Where the press stands: the gameweek, its phase, and a finished gameweek whose newspaper hasn't been filed yet. */
export interface TimesPress {
  gw: number | null;
  phase: GwPhase["phase"] | null;
  /** A finished gameweek newer than the latest newspaper; null when the presses are up to date (or FPL is unknown). */
  awaiting: number | null;
  /** Salt for the wording (see varietyKey). */
  variety: number;
}

export type TimesLibraryModel =
  | { kind: "empty"; press: TimesPress }
  | {
      kind: "ok";
      press: TimesPress;
      /** The latest newspaper, featured; only on the unfiltered view. */
      hero: IssueSummary | null;
      /** What the grid lists: the filtered issues, newest first, without the hero. */
      issues: IssueSummary[];
      filters: TimesFilter[];
      active: IssueKind | null;
      total: number;
    };

export type TimesIssueModel =
  | { kind: "not-found" }
  | {
      kind: "ok";
      issue: Issue;
      /** The page to open, 1-based and always valid. */
      page: number;
      /** Neighbouring issues by date. */
      newer: IssueSummary | null;
      older: IssueSummary | null;
    };

// ---------- Tools ----------

export interface ToolsTeam {
  entry: number;
  teamName: string;
  manager: string;
  avatar: string | null;
  rank: number;
  total: number;
}

export interface ToolsEoRow {
  id: number;
  name: string;
  club: string;
  clubCode: number | null;
  /** Effective ownership across the chosen managers, percent. */
  eo: number;
  started: number;
  captained: number;
  /** Ownership across all of FPL, percent. */
  owned: number;
}

export interface ToolsPrices {
  /** The first rows of the filtered list. */
  rows: PriceRow[];
  /** How many players match the filters in all. */
  matching: number;
  clubs: { id: number; short: string }[];
  filter: { q: string; position: PositionId | null; team: number | null; movingOnly: boolean };
}

export type ToolsModel = {
  kind: "ok";
  now: string;
  deadline: Deadline | null;
  xi: { gw: number; best: BestXI } | null;
  prices: ToolsPrices;
  /** null when the league's picks could not be had. */
  eo: { gw: number; managers: number; tier: EoTier["key"]; tiers: EoTier[]; by: "eo" | "captain"; rows: ToolsEoRow[] } | null;
  /** League-aware tools (chip tracker, injury watch, template and differentials, head to head); null without a league. */
  leagueTools: LeagueTools | null;
  teams: ToolsTeam[];
  /** Little-owned players worth chasing, for the altered view. */
  upside: Upside | null;
  /** The lab: captaincy simulation, rotation pairs and trackers, for the altered view. */
  lab: Lab | null;
  /** Planning tools (captain shortlist, fixture swings, rotation pairs, set-piece orders); null when none can be worked out. */
  planning: Planning | null;
  /** Where the season stands (gameweek, phase, next deadline), carrying the salt for this visit's wording. */
  phase: GwPhase;
  /** While the gameweek is live: is a match on, or is it a quiet gap until the next kick-off; null otherwise or unknown. */
  matches: { state: MatchPulse["state"]; nextKickoff: string | null } | null;
  /** The crowd's week: most bought and sold, and the price pressure (all of FPL, not just the filtered rows). */
  pulse: TransferPulse;
};

/** The Tools page's league-dependent parts (they need every covered manager's squad), which may arrive after the rest. */
export type ToolsDeferred = Pick<ToolsModel, "eo" | "leagueTools">;

/** The query's league-dependent choices, validated, that the page's links and forms keep while those parts are on their way. */
export interface ToolsKept {
  eo: EoTier["key"] | null;
  by: "captain" | null;
  /** Head to head, `A,B`. */
  vs: string | null;
}
