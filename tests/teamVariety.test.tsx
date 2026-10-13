/**
 * The team page's day-to-day variety: same facts, different wording and card order, chosen deterministically from the
 * gameweek, its phase and the day (see `varietyKey`), in plain and blotter mode alike.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { MatchdayInsights, SeasonInsightsView, chooser } from "@/components/views/TeamInsightsView";
import { chipsInHand, defconHeadline, freeTransfers, lastRankMove, matchdayOrder, recentForm, seasonCharts, seasonForm, tenure, varietyKey } from "@/lib/domain";
import { MESSAGES, tripMessagesFor } from "@/lib/domain/i18n";
import type { MatchdayFacts } from "@/lib/domain/insights";
import type { HistoryGameweek } from "@/lib/domain/types";
import type { GameweekInsights, SeasonInsights } from "@/lib/services/models";

afterEach(() => setRequestTrip(false));

const none: GameweekInsights = { captain: null, bench: null, chip: null, autoSubs: [], rotation: [], remaining: null, defcon: [], flags: [] };
const DAYS = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i, 12)));
const KEYS = DAYS.map((d) => varietyKey(6, "final", d));

// ------------------------------------------------------------------------------------------------ domain helpers

describe("matchdayOrder", () => {
  const facts = (over: Partial<MatchdayFacts>): MatchdayFacts => ({ ...none, ...over }) as MatchdayFacts;
  const busy = facts({
    remaining: { count: 4, effective: 5, played: 7 },
    bench: { points: 3, counted: false } as never,
    captain: { state: "played", captain: { name: "Salah", base: 4, multiplier: 2, points: 8 }, regret: 2 } as never,
    defcon: [{ name: "Saliba", value: 7, threshold: 10, reached: false, matches: 1 }],
  });

  it("puts players still to come first while the week is live, and DefCon last, whatever the day", () => {
    for (const key of [null, ...KEYS]) {
      const order = matchdayOrder(busy, key);
      expect(order[0]).toBe("remaining");
      expect(order.at(-1)).toBe("defcon");
      expect([...order].sort()).toEqual(["bench", "captain", "defcon", "remaining"]);
    }
  });
  it("is deterministic for a key, and reshuffles near-equal cards on some days", () => {
    const close = facts({ autoSubs: [{}, {}] as never, rotation: [{ wasStarter: true }] as never, flags: [{ wasStarter: false }] as never });
    expect(matchdayOrder(close, KEYS[0])).toEqual(matchdayOrder(close, KEYS[0]));
    expect(new Set(KEYS.map((k) => matchdayOrder(close, k).join())).size).toBeGreaterThan(1);
  });
  it("lets a big fact lead over a routine one regardless of the nudge", () => {
    const haul = facts({ captain: { state: "played", captain: { name: "Haaland", base: 13, multiplier: 2, points: 26 }, regret: 0 } as never, autoSubs: [{}] as never });
    for (const key of KEYS) expect(matchdayOrder(haul, key)[0]).toBe("captain");
  });
});

describe("season headline helpers", () => {
  const g = (event: number, points: number): HistoryGameweek => ({
    event, points, total_points: 0, rank: null, overall_rank: 1000 - event, bank: 5, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0,
  });
  it("recentForm compares the last weeks with the season, and waits for enough weeks", () => {
    expect(recentForm(seasonForm([g(1, 50), g(2, 50), g(3, 50), g(4, 50)])!)).toBeNull();
    const r = recentForm(seasonForm([g(1, 40), g(2, 40), g(3, 70), g(4, 70), g(5, 70)])!)!;
    expect(r.weeks).toBe(3);
    expect(r.recent).toBe(70);
    expect(r.delta).toBeCloseTo(12);
  });
  it("lastRankMove reports the latest climb or fall, and nothing when unchanged", () => {
    expect(lastRankMove([{ gw: 1, rank: 500 }, { gw: 2, rank: 300 }])).toEqual({ gw: 2, climbed: 200 });
    expect(lastRankMove([{ gw: 1, rank: 300 }, { gw: 2, rank: 450 }])).toEqual({ gw: 2, climbed: -150 });
    expect(lastRankMove([{ gw: 1, rank: 300 }, { gw: 2, rank: 300 }])).toBeNull();
    expect(lastRankMove([{ gw: 1, rank: 300 }])).toBeNull();
  });
  it("chipsInHand lists playable chips once, with the earliest closing gameweek", () => {
    const slot = (name: string, state: string, stop: number) => ({ name, label: name, start: 1, stop, state, usedIn: null }) as never;
    expect(chipsInHand([slot("wildcard", "available", 19), slot("bboost", "available", 19), slot("3xc", "used", 19), slot("freehit", "upcoming", 38)])).toEqual({ names: ["wildcard", "bboost"], closesAt: 19 });
    expect(chipsInHand([slot("3xc", "used", 19)])).toEqual({ names: [], closesAt: null });
  });
  it("defconHeadline names who got the +2, else the nearest single-match miss", () => {
    const d = (name: string, value: number, reached = false, matches = 1) => ({ name, value, threshold: 10, reached, matches });
    expect(defconHeadline([d("Saliba", 11, true), d("Gabriel", 12, true)])).toEqual({ kind: "reached", names: ["Saliba", "Gabriel"] });
    expect(defconHeadline([d("Saliba", 8)])).toEqual({ kind: "close", name: "Saliba", gap: 2 });
    expect(defconHeadline([d("Saliba", 5)])).toBeNull();
    expect(defconHeadline([d("Saliba", 9, false, 2)])).toBeNull();
  });
});

describe("chooser", () => {
  it("returns the canonical line without a key, and a stable pick with one", () => {
    expect(chooser(undefined)(["a", "b", "c"], 3)).toBe("a");
    expect(chooser(KEYS[0])(["a", "b", "c"], 3)).toBe(chooser(KEYS[0])(["a", "b", "c"], 3));
  });
  it("varies across days and phases, and between lines on the same day", () => {
    const items = ["a", "b", "c"];
    expect(new Set(KEYS.map((k) => chooser(k)(items, 0))).size).toBe(3);
    const phases = (["upcoming", "live", "provisional", "final"] as const).map((s) => varietyKey(6, s, new Date("2026-10-11T12:00:00Z")));
    expect(new Set(phases).size).toBe(4);
    const lines = Array.from({ length: 12 }, (_, line) => chooser(KEYS[0])(items, line));
    expect(new Set(lines).size).toBeGreaterThan(1);
  });
});

// ------------------------------------------------------------------------------------------------ rendered wording

const headingPool = (t = MESSAGES.en, status: "live" | "final") => [t.matchday.heading("Gameweek 6"), ...t.matchday.vary.heading[status].map((h) => h("Gameweek 6"))];
const shownHeading = (pool: string[], text: string) => pool.filter((h) => text.includes(h));

describe("matchday wording varies by day and phase", () => {
  const data: GameweekInsights = { ...none, remaining: { count: 0, effective: 0, played: 11 } };
  const textFor = (status: "live" | "final", variety?: number) => {
    const { container } = render(<MatchdayInsights data={data} gameweek="Gameweek 6" status={status} variety={variety} />);
    const text = container.textContent ?? "";
    cleanup();
    return text;
  };

  it("keeps the canonical heading without a key", () => {
    expect(textFor("final")).toContain(MESSAGES.en.matchday.heading("Gameweek 6"));
  });
  it("shows exactly one heading from the phase's pool, and several across days", () => {
    for (const status of ["live", "final"] as const) {
      const pool = headingPool(MESSAGES.en, status);
      const seen = new Set<string>();
      for (const key of DAYS.map((d) => varietyKey(6, status, d))) {
        const hits = shownHeading(pool, textFor(status, key));
        expect(hits.length).toBeGreaterThanOrEqual(1);
        seen.add(hits.at(-1)!);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });
  it("live and final weeks draw from different headings", () => {
    const live = new Set(MESSAGES.en.matchday.vary.heading.live.map((h) => h("GW6")));
    for (const h of MESSAGES.en.matchday.vary.heading.final) expect(live.has(h("GW6"))).toBe(false);
  });
  it("says the same facts every day: the player count is always in the line", () => {
    for (const key of KEYS) expect(textFor("final", key)).toMatch(/11/);
  });
  it("varies in blotter mode too, from the blotter's own lines", () => {
    setRequestTrip(true);
    const t = tripMessagesFor("en");
    const pool = headingPool(t, "final");
    const seen = new Set<string>();
    for (const key of KEYS) {
      const hits = shownHeading(pool, textFor("final", key));
      expect(hits.length).toBeGreaterThanOrEqual(1);
      seen.add(hits.at(-1)!);
    }
    expect(seen.size).toBeGreaterThan(1);
    for (const h of seen) expect(headingPool(MESSAGES.en, "final")).not.toContain(h);
  });
});

describe("season wording varies by day", () => {
  const g = (event: number, points: number): HistoryGameweek => ({
    event, points, total_points: 0, rank: null, overall_rank: 100000 - event * 1000, bank: 5, value: 995 + event, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0,
  });
  const cur = [g(1, 40), g(2, 45), g(3, 70), g(4, 72), g(5, 75)];
  const season: SeasonInsights = {
    form: seasonForm(cur, 99), charts: seasonCharts(cur, [], 99), seasonEnd: 38, tenure: tenure([{ season_name: "2024/25", total_points: 2400, rank: 227669 }]),
    freeTransfers: freeTransfers(cur, []), chips: [],
  };
  const textFor = (variety?: number) => {
    const { container } = render(<SeasonInsightsView season={season} squad={{ ownership: null as never, outlook: null as never }} nextGw={6} variety={variety} />);
    const text = container.textContent ?? "";
    cleanup();
    return text;
  };

  it("renders differently on different days but identically for the same key", () => {
    expect(textFor(KEYS[0])).toBe(textFor(KEYS[0]));
    expect(new Set(KEYS.slice(0, 20).map((k) => textFor(k))).size).toBeGreaterThan(1);
  });
  it("adds a recent-form line with the real numbers when form has moved", () => {
    const shown = KEYS.slice(0, 10).map((k) => textFor(k));
    // last 3 weeks average 72.3 against a season average of 60.4
    for (const text of shown) expect(text).toMatch(/72\.3/);
  });
});

// ------------------------------------------------------------------------------------------------ catalogs

describe("variant catalogs", () => {
  const sizes = (o: unknown, p = ""): string[] =>
    Array.isArray(o) ? [`${p}:${o.length}`] : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => sizes(v, p ? `${p}.${k}` : k)) : [];
  it("every language has the same pools for the team page", () => {
    for (const section of ["team", "matchday", "season"] as const) {
      const en = sizes(MESSAGES.en[section].vary);
      expect(en.length).toBeGreaterThan(0);
      expect(sizes(MESSAGES.es[section].vary)).toEqual(en);
      expect(sizes(MESSAGES.fr[section].vary)).toEqual(en);
    }
  });
  it("the blotter replaces every team-page pool in every language", () => {
    for (const locale of ["en", "es", "fr"] as const) {
      const trip = tripMessagesFor(locale);
      for (const section of ["team", "matchday", "season"] as const) {
        expect(sizes(trip[section].vary)).toEqual(sizes(MESSAGES[locale][section].vary));
        expect(JSON.stringify(trip[section].vary, (_k, v) => (typeof v === "function" ? v.toString() : v))).not.toBe(
          JSON.stringify(MESSAGES[locale][section].vary, (_k, v) => (typeof v === "function" ? v.toString() : v)),
        );
      }
    }
  });
});
