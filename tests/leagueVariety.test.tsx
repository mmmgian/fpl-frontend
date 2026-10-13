import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { LeagueView } from "@/components/views/LeagueView";
import { MAX_STORIES, angleLine, awardLine, awardsPhaseLine, phaseLine, storyLines, streakLabel, visionsLede } from "@/components/views/leagueCopy";
import {
  CHASE_GAP,
  anglesFor,
  leaderGap,
  leagueHeadlines,
  leagueStats,
  statsPhase,
  varietyKey,
  type Award,
  type GwStatus,
  type LeagueHeadline,
  type ManagerStats,
} from "@/lib/domain";
import { MESSAGES } from "@/lib/domain/i18n";
import { TRIP_OVERLAYS } from "@/lib/domain/i18n/trip";
import type { EntryHistory, HistoryGameweek } from "@/lib/domain/types";
import type { LeagueModel } from "@/lib/services/models";
import { standing } from "./fixtures";

afterEach(() => {
  setRequestTrip(false);
  setRequestLocale("en");
});

const g = (event: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 5000, bank: 5, value: 1004, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
const hist = (gws: HistoryGameweek[], chips: EntryHistory["chips"] = []): EntryHistory => ({ current: gws, past: [], chips });

const rows = [
  standing({ entry: 1, entry_name: "Alpha", player_name: "Ann", rank: 1, last_rank: 3, total: 300 }),
  standing({ entry: 2, entry_name: "Beta", player_name: "Bob", rank: 2, last_rank: 1, total: 291 }),
  standing({ entry: 3, entry_name: "Gamma", player_name: "Cat", rank: 3, last_rank: 2, total: 250 }),
  standing({ entry: 4, entry_name: "Delta", player_name: "Dan", rank: 4, last_rank: 4, total: 240 }),
];
const histories = new Map<number, EntryHistory>([
  [1, hist([g(1, 60), g(2, 70), g(3, 90)], [{ name: "bboost", event: 3 }])],
  [2, hist([g(1, 50), g(2, 50), g(3, 50)])],
  [3, hist([g(1, 40), g(2, 30), g(3, 20)])],
  [4, hist([g(1, 45), g(2, 35), g(3, 25)])],
]);
const stats = leagueStats(rows, histories)!;
const names = new Map(rows.map((r) => [r.entry, r.entry_name]));
const nameOf = (e: number) => names.get(e) ?? "";

const DAY = 86_400_000;
const T0 = new Date("2026-10-13T12:00:00Z");

// ------------------------------------------------------------------------------------------------ the facts

describe("the league's phase and storylines", () => {
  it("says which state the extras' week is in", () => {
    expect(statsPhase(3, null)).toBe("final");
    expect(statsPhase(3, { id: 4, status: "upcoming" })).toBe("final");
    expect(statsPhase(3, { id: 3, status: "provisional" })).toBe("provisional");
    expect(statsPhase(3, { id: 4, status: "live" })).toBe("live");
  });

  it("finds a new leader, the title race, movers, the week's best, chips and the bottom", () => {
    const h = leagueHeadlines(rows, stats);
    const kinds = h.map((x) => x.kind);
    expect(h[0]).toEqual({ kind: "newLeader", entry: 1, from: 3 });
    expect(h).toContainEqual({ kind: "titleRace", entry: 1, other: 2, gap: 9 });
    expect(kinds).toContain("weekHigh");
    expect(h).toContainEqual(expect.objectContaining({ kind: "chips", entry: 1, chip: "bboost", count: 1 }));
    expect(h).toContainEqual({ kind: "bottom", entry: 4, gap: 10 });
    // One place of movement is ordinary churn, not news.
    expect(kinds).not.toContain("riser");
    expect(kinds).not.toContain("faller");
  });

  it("calls a dead heat level and needs two places for a mover", () => {
    const level = [
      standing({ entry: 1, rank: 1, last_rank: 1, total: 100 }),
      standing({ entry: 2, rank: 2, last_rank: 5, total: 100 }),
      standing({ entry: 3, rank: 3, last_rank: 2, total: 90 }),
      standing({ entry: 4, rank: 4, last_rank: 3, total: 80 }),
      standing({ entry: 5, rank: 5, last_rank: 4, total: 70 }),
    ];
    const h = leagueHeadlines(level, null);
    expect(h.map((x) => x.kind)).not.toContain("newLeader");
    expect(h).toContainEqual({ kind: "level", entry: 1, other: 2 });
    expect(h).toContainEqual({ kind: "riser", entry: 2, places: 3, rank: 2 });
    expect(leagueHeadlines([], null)).toEqual([]);
    expect(leaderGap(level)).toBe(0);
    expect(leaderGap(level.slice(0, 1))).toBeNull();
  });

  it("finds talking points in a manager's own numbers", () => {
    const base = stats.byEntry[2];
    const s: ManagerStats = { ...base, behindNext: CHASE_GAP, benchPoints: 20, hitPoints: 0, transfers: 4, overallMoved: -1200 };
    const kinds = anglesFor(s, stats.gw).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["chase", "overallDown", "bench", "clean"]));
    expect(anglesFor({ ...s, behindNext: CHASE_GAP + 1 }, stats.gw).map((a) => a.kind)).not.toContain("chase");
    expect(anglesFor(stats.byEntry[1], stats.gw).map((a) => a.kind)).toContain("peak");
  });
});

// ------------------------------------------------------------------------------------------------ the wording

describe("the league's wording", () => {
  const headlines = leagueHeadlines(rows, stats);
  const award: Award = { key: "weekWinner", entry: 1, value: 90, tiedWith: 0 };
  const sample = (key: number) =>
    [
      phaseLine("live", 4, key),
      ...storyLines(headlines, nameOf, key),
      awardLine(award, "Alpha", 3, { place: 1, variety: key }),
      awardsPhaseLine("provisional", 3, 3, key),
      streakLabel(stats.byEntry[1], key),
    ].join("|");

  it("is the same for the same day and phase", () => {
    const k = varietyKey(4, "live", T0);
    expect(varietyKey(4, "live", new Date(T0.getTime() + 3_600_000))).toBe(k);
    expect(sample(k)).toBe(sample(varietyKey(4, "live", T0)));
  });

  it("changes with the day and with the gameweek's phase", () => {
    const days = new Set(Array.from({ length: 10 }, (_, d) => sample(varietyKey(4, "live", new Date(T0.getTime() + d * DAY)))));
    expect(days.size).toBeGreaterThan(3);
    const phases = new Set((["upcoming", "live", "provisional", "final"] as GwStatus[]).map((s) => varietyKey(4, s, T0)));
    expect(phases.size).toBe(4);
  });

  it("keeps the facts whatever the wording", () => {
    for (let d = 0; d < 12; d++) {
      const k = varietyKey(4, "provisional", new Date(T0.getTime() + d * DAY));
      const lines = storyLines(headlines, nameOf, k);
      expect(lines.length).toBeLessThanOrEqual(MAX_STORIES);
      // A new leader is always the first storyline.
      expect(lines[0]).toMatch(/Alpha/);
      expect(lines[0]).toMatch(/3rd/);
      expect(phaseLine("provisional", 4, k)).toMatch(/GW4/);
      expect(awardLine(award, "Alpha", 3, { place: 1, variety: k })).toMatch(/90 points/);
    }
  });

  it("features each storyline on some day", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 40; d++) {
      const k = varietyKey(4, "final", new Date(T0.getTime() + d * DAY));
      for (const line of storyLines(headlines.slice(1), nameOf, k)) seen.add(line.split(" ")[0]);
    }
    // titleRace / weekHigh / chips / bottom mention different teams first across days.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("says something about every kind of headline and angle in every language", () => {
    const all: LeagueHeadline[] = [
      { kind: "newLeader", entry: 1, from: 2 },
      { kind: "titleRace", entry: 1, other: 2, gap: 4 },
      { kind: "level", entry: 1, other: 2 },
      { kind: "riser", entry: 3, places: 2, rank: 3 },
      { kind: "faller", entry: 4, places: 3, rank: 4 },
      { kind: "weekHigh", entry: 1, points: 90, gw: 3 },
      { kind: "chips", entry: 1, chip: "bboost", count: 2, points: 90, gw: 3 },
      { kind: "bottom", entry: 4, gap: 0 },
    ];
    for (const locale of ["en", "es", "fr"] as const) {
      for (const trip of [false, true]) {
        setRequestLocale(locale);
        setRequestTrip(trip);
        for (const h of all) for (let k = 0; k < 6; k++) expect(storyLines([h], nameOf, k * 7919)[0].length, `${locale} ${h.kind}`).toBeGreaterThan(10);
        for (const a of anglesFor({ ...stats.byEntry[2], behindNext: 5, benchPoints: 20, transfers: 4, overallMoved: 300 }, stats.gw))
          expect(angleLine(a, 2, 1).length).toBeGreaterThan(10);
        expect(visionsLede(3).length).toBeGreaterThan(5);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ the catalogs

describe("every language has as many variants", () => {
  const counts = (o: unknown, p = ""): string[] =>
    Array.isArray(o) ? [`${p}#${o.length}`] : typeof o === "object" && o ? Object.entries(o).flatMap(([k, v]) => counts(v, `${p}.${k}`)) : [];
  it("in the regular words and the altered view", () => {
    for (const sec of ["league", "stats", "awards", "blotter"] as const) {
      const en = counts(MESSAGES.en[sec]);
      expect(en.length, sec).toBeGreaterThan(0);
      for (const n of en.filter((c) => !c.includes("titles"))) expect(Number(n.split("#")[1]), `${sec}${n}`).toBeGreaterThanOrEqual(3);
      expect(counts(MESSAGES.es[sec]), sec).toEqual(en);
      expect(counts(MESSAGES.fr[sec]), sec).toEqual(en);
    }
    for (const sec of ["league", "stats"] as const) {
      const en = counts(TRIP_OVERLAYS.en[sec]);
      expect(counts(TRIP_OVERLAYS.es[sec]), sec).toEqual(en);
      expect(counts(TRIP_OVERLAYS.fr[sec]), sec).toEqual(en);
    }
  });
});

// ------------------------------------------------------------------------------------------------ the view

describe("LeagueView's storyline", () => {
  const model = (status: GwStatus, variety: number): LeagueModel => ({
    kind: "ok",
    leagueId: 1,
    name: "Test League",
    gameweek: { name: "Gameweek 4", status },
    gameweekUnavailable: false,
    rows,
    truncated: false,
    newEntries: 0,
    summary: { leader: { entryName: "Alpha", total: 300 }, best: { entryName: "Alpha", total: 90 }, managers: 4 },
    stats,
    currentGw: 4,
    statsPhase: status === "live" ? "live" : "final",
    headlines: leagueHeadlines(rows, stats),
    variety,
  });

  it("opens with the gameweek's phase and the leader's margin", () => {
    const k = varietyKey(4, "live", T0);
    render(<LeagueView model={model("live", k)} />);
    const story = screen.getByRole("region", { name: "This week in the league" });
    expect(story).toHaveTextContent(phaseLine("live", 4, k));
    expect(story).toHaveTextContent(/Alpha/);
    expect(screen.getByText(/Alpha, so far/)).toBeInTheDocument();
    expect(screen.getAllByText(/9 points/).length).toBeGreaterThan(0);
  });

  it("reads differently on another day without changing a number", () => {
    const a = render(<LeagueView model={model("final", varietyKey(4, "final", T0))} />);
    const first = a.container.textContent;
    a.unmount();
    const texts = new Set([first]);
    for (let d = 1; d < 6; d++) {
      const r = render(<LeagueView model={model("final", varietyKey(4, "final", new Date(T0.getTime() + d * DAY)))} />);
      texts.add(r.container.textContent);
      expect(r.container.textContent).toMatch(/300/);
      r.unmount();
    }
    expect(texts.size).toBeGreaterThan(1);
  });
});
