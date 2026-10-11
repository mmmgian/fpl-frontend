import type { Bootstrap, EntryPicks, EventLive, Fixture, FplEvent, StandingRow } from "@/lib/domain/types";

export const event = (over: Partial<FplEvent> = {}): FplEvent => ({
  id: 6,
  name: "Gameweek 6",
  deadline_time: "2026-10-10T10:00:00Z",
  is_current: true,
  is_next: false,
  finished: false,
  data_checked: false,
  ...over,
});

export const bootstrap: Bootstrap = {
  events: [event({ id: 5, name: "Gameweek 5", is_current: false, finished: true, data_checked: true }), event()],
  teams: [
    { id: 1, code: 3, name: "Arsenal", short_name: "ARS" },
    { id: 2, code: 43, name: "Man City", short_name: "MCI" },
  ],
  elements: [
    { id: 1, web_name: "Raya", first_name: "David", second_name: "Raya", team: 1, element_type: 1, selected_by_percent: "20.5" },
    { id: 2, web_name: "Saliba", first_name: "William", second_name: "Saliba", team: 1, element_type: 2, selected_by_percent: "9.2" },
    { id: 3, web_name: "Saka", first_name: "Bukayo", second_name: "Saka", team: 1, element_type: 3, selected_by_percent: "38.4" },
    { id: 4, web_name: "Haaland", first_name: "Erling", second_name: "Haaland", team: 2, element_type: 4, selected_by_percent: "62.1" },
    { id: 5, web_name: "Ortega", first_name: "Stefan", second_name: "Ortega", team: 2, element_type: 1, status: "i", news: "Knee injury - expected back in November", chance_of_playing_next_round: 0, selected_by_percent: "3.0" },
    { id: 6, web_name: "Gvardiol", first_name: "Josko", second_name: "Gvardiol", team: 2, element_type: 2, selected_by_percent: "4.3" },
  ],
  chips: [
    { name: "wildcard", start_event: 2, stop_event: 19 },
    { name: "wildcard", start_event: 20, stop_event: 38 },
    { name: "freehit", start_event: 2, stop_event: 19 },
    { name: "freehit", start_event: 20, stop_event: 38 },
    { name: "bboost", start_event: 1, stop_event: 19 },
    { name: "bboost", start_event: 20, stop_event: 38 },
    { name: "3xc", start_event: 1, stop_event: 19 },
    { name: "3xc", start_event: 20, stop_event: 38 },
  ],
};

export const picks: EntryPicks = {
  active_chip: null,
  entry_history: {
    event: 6, points: 20, total_points: 427, rank: 1, overall_rank: 175936, bank: 14, value: 997,
    event_transfers: 1, event_transfers_cost: 4, points_on_bench: 3,
  },
  picks: [
    { element: 1, position: 1, multiplier: 1, is_captain: false, is_vice_captain: false },
    { element: 2, position: 2, multiplier: 1, is_captain: false, is_vice_captain: true },
    { element: 3, position: 3, multiplier: 1, is_captain: false, is_vice_captain: false },
    { element: 4, position: 4, multiplier: 2, is_captain: true, is_vice_captain: false },
    { element: 5, position: 12, multiplier: 0, is_captain: false, is_vice_captain: false },
    { element: 6, position: 13, multiplier: 0, is_captain: false, is_vice_captain: false },
    { element: 999, position: 14, multiplier: 0, is_captain: false, is_vice_captain: false },
  ],
};

export const live: EventLive = {
  elements: [
    { id: 1, stats: { total_points: 2, minutes: 90, bonus: 0, bps: 10 } },
    { id: 2, stats: { total_points: 6, minutes: 90, bonus: 1, bps: 30 } },
    { id: 3, stats: { total_points: 5, minutes: 80, bonus: 0, bps: 20 } },
    { id: 4, stats: { total_points: 9, minutes: 90, bonus: 3, bps: 40 } },
    { id: 5, stats: { total_points: 1, minutes: 0, bonus: 0, bps: 0 } },
    { id: 6, stats: { total_points: 2, minutes: 90, bonus: 0, bps: 12 } },
  ],
};

export const fixture = (over: Partial<Fixture> = {}): Fixture => ({
  id: 51,
  event: 6,
  team_h: 1,
  team_a: 2,
  team_h_score: 2,
  team_a_score: 1,
  kickoff_time: "2026-10-10T11:30:00Z",
  started: true,
  finished: false,
  finished_provisional: false,
  minutes: 63,
  stats: [
    { identifier: "bps", h: [{ element: 3, value: 35 }, { element: 2, value: 28 }], a: [{ element: 4, value: 35 }, { element: 6, value: 20 }] },
    { identifier: "bonus", h: [], a: [] },
  ],
  ...over,
});

export const standing = (over: Partial<StandingRow> = {}): StandingRow => ({
  entry: 1,
  entry_name: "Bart's Team",
  player_name: "Bart Simp",
  rank: 1,
  last_rank: 3,
  event_total: 49,
  total: 430,
  club_badge_src: null,
  ...over,
});
