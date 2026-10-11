/**
 * The series behind the team page's charts, from one manager's season history. Pure: no I/O.
 *
 * Like the other season statistics, these run through the last *finished* gameweek: a gameweek in progress has
 * partial points and would drag every chart's latest point down.
 */
import { INTL_LOCALE, type Locale } from "./i18n/locales";
import type { FplEvent, HistoryChip, HistoryGameweek } from "./types";

export interface SeasonCharts {
  /** Points scored each gameweek before hits, next to the average manager's score. */
  points: { gw: number; points: number; hit: number; average: number | null }[];
  /** Weeks beaten the average manager, out of the weeks where an average is known. */
  beatAverage: { weeks: number; of: number } | null;
  /** Overall rank after each gameweek (gameweeks FPL gave no rank for are left out). */
  ranks: { gw: number; rank: number }[];
  /** Team value (squad plus bank) after each gameweek, in tenths of £m. */
  values: { gw: number; value: number }[];
  /** Points left on the bench each gameweek. A Bench Boost week is 0 here: those points counted, so none were left. */
  bench: { gw: number; points: number }[];
  /** Gameweeks played with Bench Boost (excluded from `bench`). */
  benchBoostWeeks: number[];
  /** Transfers made each gameweek and the points they cost. */
  transfers: { gw: number; made: number; hit: number }[];
}

export function seasonCharts(current: HistoryGameweek[], events: Pick<FplEvent, "id" | "average_entry_score">[], settledThrough: number, chips: HistoryChip[] = []): SeasonCharts | null {
  const settled = [...current].filter((g) => g.event <= settledThrough).sort((a, b) => a.event - b.event);
  if (settled.length === 0) return null;
  const boosted = new Set(chips.filter((c) => c.name === "bboost").map((c) => c.event));
  const average = new Map(events.filter((e) => (e.average_entry_score ?? 0) > 0).map((e) => [e.id, e.average_entry_score!]));

  const points = settled.map((g) => ({ gw: g.event, points: g.points, hit: g.event_transfers_cost, average: average.get(g.event) ?? null }));
  const known = points.filter((p) => p.average !== null);
  return {
    points,
    beatAverage: known.length ? { weeks: known.filter((p) => p.points > p.average!).length, of: known.length } : null,
    ranks: settled.filter((g): g is HistoryGameweek & { overall_rank: number } => g.overall_rank != null && g.overall_rank > 0).map((g) => ({ gw: g.event, rank: g.overall_rank })),
    values: settled.map((g) => ({ gw: g.event, value: g.value + g.bank })),
    bench: settled.map((g) => ({ gw: g.event, points: boosted.has(g.event) ? 0 : g.points_on_bench })),
    benchBoostWeeks: settled.filter((g) => boosted.has(g.event)).map((g) => g.event),
    transfers: settled.map((g) => ({ gw: g.event, made: g.event_transfers, hit: g.event_transfers_cost })),
  };
}

/** 7295417 -> "7.3M", 147643 -> "148k", 950 -> "950". For ranks, where the digits past the second don't help. */
export function compactNumber(n: number, locale: Locale = "en"): string {
  const abs = Math.abs(n);
  if (abs >= 999_500) return `${trim(n / 1_000_000, locale)}M`;       // 999,999 is "1M", not "1000k"
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  if (abs >= 1_000) return `${trim(n / 1000, locale)}k`;
  return String(Math.round(n));
}
const trim = (x: number, locale: Locale) => (Math.round(x * 10) / 10).toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 1 });
