/**
 * A six-club FPL world five gameweeks deep, for the planning tools: the season is in gameweek 6 and the next deadline
 * is gameweek 7. Club 1's fixtures harden, club 2's ease, clubs 3 and 4 blank in gameweek 10 and play twice in 11.
 */
import type { Bootstrap, FplElement, FplEvent, PositionId, ScheduledFixture } from "@/lib/domain/types";
import { event, standing } from "./fixtures";

export const NOW = new Date("2026-10-12T12:00:00Z");

/** The ISO time `hour`:00 UTC on gameweek `gw`'s Saturday (gameweek 6 is 10 October). */
const weekOf = (gw: number, hour: number) => new Date(Date.UTC(2026, 9, 10 + (gw - 6) * 7, hour)).toISOString();

export const teams = [1, 2, 3, 4, 5, 6].map((id) => ({ id, code: id * 10, name: `Club ${id}`, short_name: `C${id}` }));

export const events: FplEvent[] = [
  event({ id: 6, name: "Gameweek 6", is_current: true, finished: true, data_checked: true, deadline_time: "2026-10-10T10:00:00Z" }),
  ...[7, 8, 9, 10, 11].map((id) => event({ id, name: `Gameweek ${id}`, is_current: false, is_next: id === 7, finished: false, deadline_time: weekOf(id, 10) })),
];

let nextId = 1;
const fx = (gw: number | null, h: number, a: number, dh: number, da: number): ScheduledFixture => ({
  id: nextId++, event: gw, team_h: h, team_a: a, team_h_difficulty: dh, team_a_difficulty: da,
  kickoff_time: gw ? weekOf(gw, 15) : null, started: false, finished: false, finished_provisional: false,
});

export const schedule: ScheduledFixture[] = [
  fx(7, 1, 2, 2, 4), fx(7, 3, 4, 3, 3), fx(7, 5, 6, 3, 3),
  fx(8, 1, 3, 2, 4), fx(8, 2, 4, 4, 3), fx(8, 5, 6, 3, 3),
  fx(9, 1, 4, 5, 2), fx(9, 2, 3, 2, 3), fx(9, 5, 6, 3, 3),
  fx(10, 1, 5, 5, 2), fx(10, 2, 6, 2, 3),
  fx(11, 1, 6, 5, 2), fx(11, 2, 5, 2, 3), fx(11, 3, 4, 3, 3), fx(11, 4, 3, 3, 3),
  fx(null, 3, 5, 3, 3), // postponed, no gameweek yet
];

/** Four regulars per club (a defender, a midfielder, a forward, a keeper), all with real minutes, plus set-piece orders at clubs 1 and 2. */
export function makeElements(): FplElement[] {
  const out: FplElement[] = [];
  for (const t of teams) {
    ([2, 3, 4, 1] as PositionId[]).forEach((pos, i) => {
      const id = t.id * 10 + i;
      out.push({
        id, web_name: `P${id}`, team: t.id, element_type: pos, now_cost: 50 + pos * 10, selected_by_percent: String(5 + i * 10),
        minutes: 540, starts: 6, status: "a", ep_next: String(3 + pos + (t.id === 1 ? 2 : 0)),
        expected_goals_per_90: pos === 4 ? 0.6 + t.id * 0.05 : 0.15, expected_assists_per_90: 0.15, defensive_contribution_per_90: 8,
        transfers_in_event: 0, transfers_out_event: 0,
      });
    });
  }
  const set = (id: number, over: Partial<FplElement>) => Object.assign(out.find((e) => e.id === id)!, over);
  set(12, { penalties_order: 1, direct_freekicks_order: 2, corners_and_indirect_freekicks_order: 1 });
  set(11, { penalties_order: 2, direct_freekicks_order: 1, status: "d", chance_of_playing_next_round: 50 });
  set(22, { penalties_order: 1, status: "i", chance_of_playing_next_round: 0 });
  set(21, { penalties_order: 2, corners_and_indirect_freekicks_order: 1 });
  return out;
}

export const bootstrap = (): Bootstrap => ({ events, teams, elements: makeElements(), total_players: 11_000_000 });

export const league = (managers: number) => ({
  league: { id: 1, name: "L" },
  standings: { has_next: false, results: Array.from({ length: managers }, (_, i) => standing({ entry: 100 + i, entry_name: `Team ${i + 1}`, player_name: `Manager ${i + 1}`, rank: i + 1, total: 500 - i })) },
  new_entries: { results: [] as unknown[] },
});
