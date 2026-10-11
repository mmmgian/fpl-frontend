/** Subset of the official FPL API shapes that this app reads. */

export type PositionId = 1 | 2 | 3 | 4;

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  data_checked: boolean;
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
  first_name: string;
  second_name: string;
  team: number;
  element_type: PositionId;
}

export interface Bootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
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
}

export interface LeagueStandings {
  league: { id: number; name: string };
  standings: { has_next: boolean; page?: number; results: StandingRow[] };
  new_entries?: { results: unknown[] };
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

export interface EntryPicks {
  active_chip: string | null;
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

export interface LiveElement {
  id: number;
  stats: { total_points: number; minutes: number; bonus: number; bps: number };
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
  stats: { identifier: string; h: FixtureStatSide[]; a: FixtureStatSide[] }[];
}
