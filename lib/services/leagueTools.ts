import { currentEvent, MAX_STATS_MANAGERS } from "../domain";
import { buildLeagueTools, type LeagueManager, type LeagueTools } from "../domain/leagueTools";
import type { Bootstrap, EntryPicks, FplEvent, HistoryChip, StandingRow } from "../domain/types";
import type { FplPort } from "./ports";
import { withinDeadline } from "./shared";

/** The most managers (from the top of the table) the league tools ask FPL about: two requests each. */
export const LEAGUE_TOOLS_CAP = MAX_STATS_MANAGERS;

export interface LeagueToolsRun {
  /** The current gameweek's picks for a manager, asked for at most once per page however many tools want them. */
  picksOf(entry: number): Promise<EntryPicks | null>;
  /** The tools, once every answer is in or the page's deadline for extras has passed. Never rejects. */
  ready: Promise<LeagueTools | null>;
}

/**
 * Starts the league tools' requests: every covered manager's current picks and entry history, all at once, so the
 * wait is one deadline however many managers there are. A manager whose request fails, 404s or is too slow is simply
 * missing from what arrived (shown as unavailable), never an error for the page.
 */
export function startLeagueTools(
  fpl: Pick<FplPort, "picks" | "history">,
  {
    bootstrap,
    rows,
    event = currentEvent(bootstrap.events),
    nextGw,
    vs,
  }: {
    bootstrap: Bootstrap;
    rows: StandingRow[];
    /** The gameweek whose picks are read (the latest locked in); FPL's current one when not given. */
    event?: FplEvent | null;
    nextGw: number | null;
    vs?: string | string[];
  },
): LeagueToolsRun {
  const memo = new Map<number, Promise<EntryPicks | null>>();
  const picksOf = (entry: number): Promise<EntryPicks | null> => {
    if (!event) return Promise.resolve(null);
    let p = memo.get(entry);
    if (!p) {
      p = Promise.resolve().then(() => fpl.picks(entry, event.id, event.finished));
      p.catch(() => {}); // each caller handles the failure its own way
      memo.set(entry, p);
    }
    return p;
  };

  const seen = new Set<number>();
  const managers: LeagueManager[] = rows
    .filter((r) => Number.isInteger(r.entry) && r.entry > 0 && !seen.has(r.entry) && seen.add(r.entry))
    .slice(0, LEAGUE_TOOLS_CAP)
    .map((r) => ({ entry: r.entry, teamName: r.entry_name, manager: r.player_name, rank: r.rank }));
  if (managers.length === 0) return { picksOf, ready: Promise.resolve(null) };

  const squads = new Map<number, EntryPicks>();
  const histories = new Map<number, { chips: HistoryChip[] }>();
  const work = Promise.allSettled([
    ...managers.map((m) =>
      picksOf(m.entry).then((p) => {
        if (p && Array.isArray(p.picks)) squads.set(m.entry, p);
      }),
    ),
    ...managers.map((m) =>
      Promise.resolve()
        .then(() => fpl.history(m.entry))
        .then((h) => {
          if (h) histories.set(m.entry, { chips: Array.isArray(h.chips) ? h.chips : [] });
        }),
    ),
  ]);
  const ready = withinDeadline(work)
    .then(() =>
      buildLeagueTools({
        bootstrap,
        total: seen.size,
        managers,
        gw: event?.id ?? null,
        nextGw,
        // what arrived by the deadline: late answers must not change the model while it is being built
        squads: new Map(squads),
        histories: new Map(histories),
        vs,
      }),
    )
    .catch(() => null);
  return { picksOf, ready };
}
