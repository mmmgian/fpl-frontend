/** A small FPL world with enough players to field a team, for the Tools tests. */
import type { Bootstrap, EntryPicks, FplElement, FplEvent, PositionId, ScheduledFixture } from "@/lib/domain/types";
import { event, standing } from "./fixtures";

export const NOW = new Date("2026-10-12T12:00:00Z");

const teams = [1, 2, 3, 4].map((id) => ({ id, code: id * 10, name: `Club ${id}`, short_name: `C${id}` }));

/** Ids: 1-2 keepers, 3-7 defenders, 8-12 midfielders, 13-15 forwards. Player 13 is the standout forward; 99 is injured but would top the list. */
export function makeElements(): FplElement[] {
  const rows: [number, PositionId][] = [[1, 1], [2, 1], ...[3, 4, 5, 6, 7].map((i) => [i, 2] as [number, PositionId]), ...[8, 9, 10, 11, 12].map((i) => [i, 3] as [number, PositionId]), ...[13, 14, 15].map((i) => [i, 4] as [number, PositionId])];
  const els: FplElement[] = rows.map(([id, pos]) => ({
    id, web_name: `Player${id}`, team: (id % 4) + 1, element_type: pos, now_cost: 40 + id, selected_by_percent: "10.0",
    ep_next: id === 13 ? "11.0" : id === 14 ? "9.0" : pos === 4 ? "3.0" : "5.0",
    transfers_in_event: 0, transfers_out_event: 0,
  }));
  els.push({ id: 99, web_name: "Injured", team: 1, element_type: 2, now_cost: 70, selected_by_percent: "50.0", ep_next: "20.0", status: "i", transfers_in_event: 900_000, transfers_out_event: 0 });
  // a player everyone is buying, and one everyone is selling
  els.find((e) => e.id === 3)!.transfers_in_event = 700_000;   // 700k of 1.1M owners = 63%
  els.find((e) => e.id === 4)!.transfers_out_event = 200_000;  // -18%
  return els;
}

export const events: FplEvent[] = [
  event({ id: 5, name: "Gameweek 5", is_current: false, finished: true, data_checked: true, deadline_time: "2026-10-03T10:00:00Z" }),
  event({ id: 6, name: "Gameweek 6", is_current: true, finished: false, deadline_time: "2026-10-10T10:00:00Z" }),
  event({ id: 7, name: "Gameweek 7", is_current: false, is_next: true, deadline_time: "2026-10-17T10:00:00Z" }),
];

export const bootstrap: Bootstrap = { events, teams, elements: makeElements(), total_players: 11_000_000 };

export const schedule: ScheduledFixture[] = [
  { id: 1, event: 7, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: "2026-10-17T15:00:00Z", started: false, finished: false, finished_provisional: false },
  { id: 2, event: 7, team_h: 3, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2026-10-17T15:00:00Z", started: false, finished: false, finished_provisional: false },
];

/** `managers` league rows, best first. */
export const rows = (managers: number) => Array.from({ length: managers }, (_, i) => standing({ entry: 100 + i, entry_name: `Team ${i + 1}`, player_name: `Manager ${i + 1}`, rank: i + 1, total: 500 - i }));

export const league = (managers: number) => ({ league: { id: 1, name: "L" }, standings: { has_next: false, results: rows(managers) }, new_entries: { results: [] as unknown[] } });

/** Every manager plays 13 as captain and 8 under the armband of nobody; manager 100 triple-captains 14 instead. */
export const picksFor = (entry: number): EntryPicks => ({
  active_chip: null,
  entry_history: { event: 6, points: 0, total_points: 0, rank: null, overall_rank: null, bank: 0, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0 },
  picks: [
    { element: 13, position: 1, multiplier: entry === 100 ? 1 : 2, is_captain: entry !== 100, is_vice_captain: false },
    { element: 14, position: 2, multiplier: entry === 100 ? 3 : 1, is_captain: entry === 100, is_vice_captain: entry !== 100 },
    { element: 8, position: 3, multiplier: 1, is_captain: false, is_vice_captain: false },
    { element: 9, position: 12, multiplier: 0, is_captain: false, is_vice_captain: false },
  ],
});
