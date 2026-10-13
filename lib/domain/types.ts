/** Data shapes the app works with: the subset of the official FPL API it reads, plus our history snapshots. */

export type PositionId = 1 | 2 | 3 | 4;

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  data_checked: boolean;
  /** The average manager's score for the gameweek (0 until it has been played). */
  average_entry_score?: number;
}

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
}

export interface FplElement {
  id: number;
  web_name: string;
  first_name?: string;
  second_name?: string;
  team: number;
  element_type: PositionId;
  /** "a" available, "d" doubtful, "i" injured, "s" suspended, "u" unavailable, "n" not in the squad list. */
  status?: string;
  news?: string;
  chance_of_playing_next_round?: number | null;
  /** Ownership, e.g. "12.3". */
  selected_by_percent?: string;
  /** Price in tenths of a million. */
  now_cost?: number;
  /** When the current news item was added (ISO). */
  news_added?: string | null;
  /** Season totals. */
  minutes?: number;
  starts?: number;
  total_points?: number;
  /** Recent form, e.g. "4.2". */
  form?: string;
  /** FPL's own expected points for the next gameweek, e.g. "5.3". */
  ep_next?: string;
  /** Managers who bought / sold the player since the last deadline, and how many price steps he has moved this gameweek and this season (tenths of £m). */
  transfers_in_event?: number;
  transfers_out_event?: number;
  cost_change_event?: number;
  cost_change_start?: number;
  /** Per 90 minutes, this season (numbers in the raw file). */
  expected_goals_per_90?: number;
  expected_assists_per_90?: number;
  clean_sheets_per_90?: number;
  defensive_contribution_per_90?: number;
  yellow_cards?: number;
  /** 1 = first-choice penalty taker, null/absent = not on penalties. */
  penalties_order?: number | null;
  /** FPL's order for direct free kicks and for corners and indirect free kicks: 1 = first choice, null/absent = not listed. */
  direct_freekicks_order?: number | null;
  corners_and_indirect_freekicks_order?: number | null;
  points_per_game?: string;
}

/** One chip window from bootstrap: each chip can be played once inside [start_event, stop_event]. */
export interface BootstrapChip {
  name: string;
  start_event: number;
  stop_event: number;
}

export interface Bootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  chips?: BootstrapChip[];
  /** Everyone playing FPL this season. */
  total_players?: number;
}

export interface StandingRow {
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  event_total: number;
  total: number;
  club_badge_src?: string | null;
  /** Set on rebuilt history: the rank depends on a tie whose true order FPL doesn't expose. */
  rank_approximate?: boolean;
  /** Set on rebuilt history: the previous rank this one is compared with was itself approximate. */
  last_rank_approximate?: boolean;
}

/** Present on a table that was rebuilt after the gameweek, not saved at the time. */
export interface RebuiltInfo {
  gw: number;
  method: string;
  tie_break: string;
  built_at: string;
  /** Managers level on points AND overall rank: their order is a deterministic guess. */
  unresolved_ties?: { total: number; entries: number[] }[];
}

export interface LeagueStandings {
  league: { id: number; name: string };
  standings: { has_next: boolean; page?: number; results: StandingRow[] };
  new_entries?: { results: unknown[] };
  reconstructed?: RebuiltInfo;
}

export interface Entry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  started_event: number;
  current_event: number | null;
  summary_overall_points: number | null;
  summary_overall_rank: number | null;
  summary_event_points: number | null;
}

export interface Pick {
  element: number;
  position: number; // 1-11 starting XI, 12-15 bench
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface AutomaticSub {
  element_in: number;
  element_out: number;
  event: number;
}

export interface EntryPicks {
  active_chip: string | null;
  automatic_subs?: AutomaticSub[];
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: Pick[];
}

export interface LiveStats {
  total_points: number;
  minutes: number;
  bonus: number;
  bps: number;
  goals_scored?: number;
  assists?: number;
  /** Counts towards the +2 DefCon bonus: CBIT for defenders, CBIRT for midfielders and forwards. */
  defensive_contribution?: number;
  /** Expected goals and assists this gameweek, as FPL sends them: decimal strings such as "0.38". */
  expected_goals?: string;
  expected_assists?: string;
  yellow_cards?: number;
  red_cards?: number;
  own_goals?: number;
  penalties_missed?: number;
  saves?: number;
  clean_sheets?: number;
  goals_conceded?: number;
}

export interface LiveElement {
  id: number;
  stats: LiveStats;
}

export interface EventLive {
  elements: LiveElement[];
}

export interface FixtureStatSide {
  value: number;
  element: number;
}

export interface Fixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  kickoff_time: string | null;
  started: boolean | null;
  finished: boolean;
  finished_provisional: boolean;
  minutes: number;
  team_h_difficulty?: number;
  team_a_difficulty?: number;
  stats: { identifier: string; h: FixtureStatSide[]; a: FixtureStatSide[] }[];
}

/** A fixture as it appears in the season schedule (no match stats): enough for difficulty and state. */
export interface ScheduledFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  started: boolean | null;
  finished: boolean;
  finished_provisional: boolean;
  /** Goals so far; null before kick-off. */
  team_h_score?: number | null;
  team_a_score?: number | null;
}

// ---------- A manager's season (entry history) ----------

export interface HistoryGameweek {
  event: number;
  /** Gross of any transfer hit: net score is points - event_transfers_cost. */
  points: number;
  total_points: number;
  rank: number | null;
  overall_rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface HistorySeason {
  season_name: string;
  total_points: number;
  rank: number;
}

export interface HistoryChip {
  name: string;
  event: number;
}

export interface EntryHistory {
  current: HistoryGameweek[];
  past: HistorySeason[];
  chips: HistoryChip[];
}

// ---------- League history (our own backend) ----------

export interface SnapshotSummary {
  gw: number;
  taken_at: string;
  /** True when the table was rebuilt afterwards. Older backends don't send it. */
  rebuilt?: boolean;
}

export interface Snapshot extends SnapshotSummary {
  league_id: number;
  data: LeagueStandings;
}
