/**
 * The League and Team pages know when something is actually being played: they refresh by the fixture schedule, say
 * when the next match kicks off on a quiet live day, give the next deadline once a week is played, and know when the
 * season is over. Plus the copy fixes that came with it: plurals, ties, number formatting, and current facts kept away
 * from older gameweeks.
 */
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setRequestLocale } from "@/components/ui/i18n";
import { LeagueExtrasSections, LeagueView } from "@/components/views/LeagueView";
import { awardFigure, awardLine } from "@/components/views/leagueCopy";
import { TeamView } from "@/components/views/TeamView";
import { MESSAGES, type Award } from "@/lib/domain";
import type { ScheduledFixture } from "@/lib/domain/types";
import { createLeagueService } from "@/lib/services/league";
import type { LeagueTable, TeamModel } from "@/lib/services/models";
import { ifAlreadyIn, pulseOf } from "@/lib/services/shared";
import { createTeamService } from "@/lib/services/team";
import { bootstrap, event, standing } from "./fixtures";
import { clock, fakeFpl, NOW } from "./support";

const MIN = 60_000;
const at = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * MIN).toISOString();
const match = (over: Partial<ScheduledFixture>): ScheduledFixture => ({
  id: 1, event: 6, team_h: 1, team_a: 2, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: at(-30), started: true, finished: false, finished_provisional: false, ...over,
});
/** GW6 is live in the shared fixtures (deadline yesterday): one match on now, one quiet gap, or all played. */
const playing = [match({ id: 1, kickoff_time: at(-30) })];
const between = [match({ id: 1, kickoff_time: at(-24 * 60), finished: true }), match({ id: 2, kickoff_time: at(5 * 60), started: false })];
const allPlayed = [match({ id: 1, kickoff_time: at(-24 * 60), finished: true }), match({ id: 2, kickoff_time: at(-4 * 60), finished: true })];

const rows = [
  standing({ entry: 1, entry_name: "Alpha FC", rank: 1, last_rank: 1, total: 320 }),
  standing({ entry: 2, entry_name: "Bravo FC", rank: 2, last_rank: 2, total: 300 }),
];
const league = { league: { id: 1, name: "The Lobster League" }, standings: { has_next: false, results: rows }, new_entries: { results: [] as unknown[] } };
/** A table too big for the per-manager extras, so only the table-level model matters here. */
const leagueModel = async (over: Parameters<typeof fakeFpl>[0] = {}) => {
  const { model } = await createLeagueService(fakeFpl({ standings: async () => league, history: async () => null, ...over }), { now: clock }).loadStreaming(1);
  if (model.kind !== "ok") throw new Error("expected ok");
  return model;
};
const finalBootstrap = (next: boolean) => ({
  ...bootstrap,
  events: [
    event({ id: 6, name: "Gameweek 6", is_current: true, finished: true, data_checked: true }),
    ...(next ? [event({ id: 7, name: "Gameweek 7", is_current: false, is_next: true, finished: false, deadline_time: "2026-10-17T10:30:00Z" })] : []),
  ],
});

afterEach(() => setRequestLocale("en"));

describe("ifAlreadyIn and pulseOf", () => {
  it("takes optional data only if it has already settled, never waiting a timer tick, and treats a failure as none", async () => {
    expect(await ifAlreadyIn(Promise.resolve(3))).toBe(3);
    expect(await ifAlreadyIn(Promise.reject(new Error("x")))).toBeNull();
    expect(await ifAlreadyIn(new Promise(() => {}))).toBeNull();
    expect(await ifAlreadyIn(new Promise((r) => setTimeout(() => r(1), 0)))).toBeNull();
  });
  it("reads the schedule FPL sends on a bad day without crashing", () => {
    expect(pulseOf(null, 6, NOW)).toBeNull();
    expect(pulseOf("x", 6, NOW)).toBeNull();
    expect(pulseOf([null, 3, { event: "x" }, ...playing], 6, NOW)).toMatchObject({ state: "playing", playing: 1 });
  });
});

describe("league service: refresh plan, pulse, next deadline, season over", () => {
  it("refreshes every minute while a match is on", async () => {
    const m = await leagueModel({ allFixtures: async () => playing });
    expect(m.gameweek?.status).toBe("live");
    expect(m).toMatchObject({ refreshMs: MIN, pulse: { state: "playing" }, nextDeadline: null, seasonOver: false });
  });
  it("sleeps through a quiet gap until just before the next kick-off (at most 15 minutes), and names the kick-off", async () => {
    const m = await leagueModel({ allFixtures: async () => between });
    expect(m.pulse).toMatchObject({ state: "between", nextKickoff: at(5 * 60) });
    expect(m.refreshMs).toBe(15 * MIN);
  });
  it("checks every five minutes once every match is played, until FPL closes the week", async () => {
    const m = await leagueModel({ allFixtures: async () => allPlayed });
    expect(m).toMatchObject({ refreshMs: 5 * MIN, pulse: { state: "over" } });
  });
  it("falls back to every minute while live when the schedule fails or is slow", async () => {
    expect(await leagueModel({ allFixtures: async () => { throw new Error("503"); } })).toMatchObject({ refreshMs: MIN, pulse: null });
    expect(await leagueModel({ allFixtures: () => new Promise(() => {}) })).toMatchObject({ refreshMs: MIN, pulse: null });
  });
  it("gives the next deadline once the week is final, stops refreshing, and isn't over while a deadline remains", async () => {
    const m = await leagueModel({ bootstrap: async () => finalBootstrap(true) });
    expect(m).toMatchObject({ refreshMs: null, nextDeadline: { gw: 7, at: "2026-10-17T10:30:00Z" }, seasonOver: false });
  });
  it("knows the season is over after the last gameweek", async () => {
    expect(await leagueModel({ bootstrap: async () => finalBootstrap(false) })).toMatchObject({ refreshMs: null, nextDeadline: null, seasonOver: true });
  });
  it("retries slowly while FPL's game file can't be read", async () => {
    const m = await leagueModel({ bootstrap: async () => { throw new Error("updating"); } });
    expect(m).toMatchObject({ gameweekUnavailable: true, refreshMs: 5 * MIN });
  });
});

describe("team service: the same, for the latest gameweek only", () => {
  const entry = async () => ({ id: 7, name: "Gaucho F.C.", player_first_name: "Gian", player_last_name: "Jaen", started_event: 1, current_event: 6, summary_overall_points: null, summary_overall_rank: null, summary_event_points: null });
  const load = async (gw: string | undefined, over: Parameters<typeof fakeFpl>[0] = {}) => {
    const m = await createTeamService(fakeFpl({ entry, ...over }), { now: clock }).load(7, gw);
    if (m.kind !== "ok") throw new Error(`expected ok, got ${m.kind}`);
    return m;
  };
  it("plans the refresh from the schedule while the latest week is live", async () => {
    expect((await load(undefined, { allFixtures: async () => between })).gameweek).toMatchObject({ refreshMs: 15 * MIN, pulse: { state: "between" }, nextDeadline: null });
    expect((await load(undefined, { allFixtures: async () => playing })).gameweek).toMatchObject({ refreshMs: MIN, pulse: { state: "playing" } });
  });
  it("never refreshes an older gameweek, nor gives it a deadline", async () => {
    expect((await load("5", { allFixtures: async () => playing })).gameweek).toMatchObject({ gw: 5, refreshMs: null, pulse: null, nextDeadline: null, seasonOver: false });
  });
  it("gives the next deadline beside the latest final week, and the season's end after the last", async () => {
    expect((await load(undefined, { bootstrap: async () => finalBootstrap(true) })).gameweek).toMatchObject({ refreshMs: null, nextDeadline: { gw: 7 }, seasonOver: false });
    expect((await load(undefined, { bootstrap: async () => finalBootstrap(false) })).gameweek).toMatchObject({ nextDeadline: null, seasonOver: true });
  });
});

// ------------------------------------------------------------------------------------------------- the views

const table = (over: Partial<LeagueTable> = {}): LeagueTable => ({
  kind: "ok", leagueId: 1, name: "The Lobster League", gameweek: { name: "Gameweek 6", status: "live" }, gameweekUnavailable: false,
  rows, truncated: false, newEntries: 0,
  summary: { leader: { entryName: "Alpha FC", total: 320 }, best: { entryName: "Alpha FC", total: -2 }, managers: 2 } as LeagueTable["summary"],
  currentGw: 6, variety: undefined as unknown as number, stats: null, statsPhase: null, headlines: [], ...over,
});
const story = (m: LeagueTable) => {
  const { container, unmount } = render(<LeagueExtrasSections model={m} />);
  const text = container.querySelector("[class*=storyPhase]")?.textContent ?? "";
  const time = container.querySelector("[class*=storyPhase] time")?.getAttribute("datetime") ?? null;
  unmount();
  return { text, time };
};

describe("league page: what the phase line says", () => {
  it("names the next kick-off, in the reader's time, when nothing is on during a live week", () => {
    const s = story(table({ pulse: { state: "between", nextKickoff: "2026-10-11T17:00:00.000Z", playing: 0 } }));
    expect(s.text).toMatch(/^GW6 is live, between matches\. Next kick-off .+\.$/);
    expect(s.time).toBe("2026-10-11T17:00:00.000Z");
    expect(s.text).not.toMatch(/still running|every goal/);
  });
  it("says every match is played (not that matches are running) before FPL closes the week", () => {
    expect(story(table({ pulse: { state: "over", nextKickoff: null, playing: 0 } })).text).toBe("Every GW6 match has been played. FPL closes the week once the last points are in.");
  });
  it("keeps the live wording while a match is on, or with no schedule", () => {
    expect(story(table({ pulse: { state: "playing", nextKickoff: null, playing: 1 } })).text).toBe("GW6 is live: totals move with every goal, card and clean sheet.");
    expect(story(table({ pulse: null })).text).toBe("GW6 is live: totals move with every goal, card and clean sheet.");
  });
  it("adds the next deadline once the week is final", () => {
    const s = story(table({ gameweek: { name: "Gameweek 6", status: "final" }, nextDeadline: { gw: 7, at: "2026-10-17T10:30:00Z" } }));
    expect(s.text).toMatch(/^GW6 is final: FPL has signed it off\. GW7 deadline: .+\.$/);
    expect(s.time).toBe("2026-10-17T10:30:00.000Z");
  });
  it("says the season is over, crowns the champion and drops the look-ahead", () => {
    const m = table({ gameweek: { name: "Gameweek 38", status: "final" }, currentGw: 38, seasonOver: true, headlines: [{ kind: "titleRace", entry: 1, other: 2, gap: 20 }, { kind: "bottom", entry: 2, gap: 20 }] });
    const { container } = render(<LeagueExtrasSections model={m} />);
    const text = container.textContent ?? "";
    expect(text).toContain("GW38 was the last of the season, and FPL has signed it off. That's the season.");
    expect(text).toContain("Champions: Alpha FC, finishing 20 points clear of Bravo FC in second.");
    expect(text).not.toMatch(/leads|must close/);
  });
  it("gives the first deadline before the season", () => {
    const s = story(table({ gameweek: null, currentGw: null, nextDeadline: { gw: 1, at: "2026-08-15T17:30:00Z" } }));
    expect(s.text).toMatch(/^GW1 deadline: .+\.$/);
  });
});

describe("league page: header and empty states", () => {
  it("explains a missing gameweek while FPL updates, instead of going blank", () => {
    render(<LeagueView model={table({ gameweek: null, gameweekUnavailable: true })} extras={<></>} />);
    expect(screen.getByText("FPL is updating the game. This page refreshes on its own.")).toBeInTheDocument();
  });
  it("uses pre-season wording only before the season, and counts one manager as one", () => {
    const empty = { summary: null, rows: [] };
    const inSeason = renderToStaticMarkup(<LeagueView model={table({ ...empty, newEntries: 1 })} />);
    expect(inSeason).toContain("Standings appear once FPL next updates the league. 1 manager has joined so far.");
    expect(inSeason).not.toMatch(/first deadline|Gameweek 1 kicks off/);
    const pre = renderToStaticMarkup(<LeagueView model={table({ ...empty, gameweek: null, currentGw: null, newEntries: 3 })} />);
    expect(pre).toContain("Standings appear after the first gameweek deadline. 3 managers have joined so far.");
  });
  it("labels the week's best as GW6, with a real minus sign for a negative score", () => {
    render(<LeagueView model={table()} extras={<></>} />);
    expect(screen.getByText("Best GW6")).toBeInTheDocument();
    expect(screen.getByText("−2")).toBeInTheDocument();
  });
});

describe("award figures use real minus signs", () => {
  const award = (key: Award["key"], value: number): Award => ({ key, entry: 1, value, tiedWith: 0 }) as Award;
  it("on the card and in the sentence", () => {
    expect(awardFigure(award("woodenSpoon", -3))).toBe("−3");
    expect(awardLine(award("woodenSpoon", -3), "Alpha FC", 5)).toContain("−3 points");
    expect(awardLine(award("woodenSpoon", -3), "Alpha FC", 5)).not.toContain("-3");
  });
});

describe("plurals and ties, in every language", () => {
  it("counts managers, points and transfers", () => {
    const { en, es, fr } = MESSAGES;
    expect(en.league.joined(1)).toBe(" 1 manager has joined so far.");
    expect(es.league.joined(1)).toBe(" Hasta ahora se ha unido 1 manager.");
    expect(fr.league.joined(1)).toBe(" 1 manager a rejoint la ligue pour l'instant.");
    expect(en.stats.pts(1)).toBe("1 pt");
    expect(en.stats.pts(2)).toBe("2 pts");
    expect(en.stats.hitsValue(8, 25)).toBe("−8 pts · 25 transfers in all");
    expect(en.stats.hitsValue(4, 1)).toBe("−4 pts · 1 transfer in all");
    expect(es.stats.hitsValue(4, 1)).toBe("−4 pts · 1 traspaso en total");
    expect(fr.stats.hitsValue(4, 1)).toBe("−4 pts · 1 transfert au total");
  });
  it("says level instead of '0 clear' when tied at the top or with the leader", () => {
    for (const lang of ["en", "es", "fr"] as const) {
      for (const line of MESSAGES[lang].team.vary.leagueSpot) {
        const top = line(1, 21, 0, 0);
        const second = line(2, 21, 0, 0);
        expect(top, lang).not.toMatch(/\b0\b/);
        expect(second, lang).not.toMatch(/\b0\b/);
        expect(line(2, 21, 0, 1), lang).toMatch(/\b1 (point|punto|point)\b|1 (pt)/);
      }
    }
    expect(MESSAGES.en.team.vary.leagueSpot[0](1, 21, 0, 0)).toBe("Top of 21, level with 2nd");
    expect(MESSAGES.en.team.vary.leagueSpot[0](3, 21, 1, 0)).toBe("3rd of 21, level with the leader · up 1");
    expect(MESSAGES.en.team.vary.leagueSpot[0](3, 21, 0, 12)).toBe("3rd of 21, 12 points off the top");
  });
  it("counts a bank-inclusive squad value as including the bank", () => {
    expect(MESSAGES.en.team.inBank("£1.4m")).toBe("incl. £1.4m in the bank");
    expect(MESSAGES.es.team.inBank("£1.4m")).toBe("incl. £1.4m en caja");
    expect(MESSAGES.fr.team.inBank("£1.4m")).toBe("dont £1.4m en banque");
  });
});

describe("team page: current facts stay with the latest gameweek", () => {
  const entry = async () => ({ id: 7, name: "Gaucho F.C.", player_first_name: "Gian", player_last_name: "Jaen", started_event: 1, current_event: 6, summary_overall_points: null, summary_overall_rank: null, summary_event_points: null });
  const leagueSpot = { rank: 2, size: 21, points: 380, moved: 1, leader: { entryId: 1, slug: "barts-team", teamName: "Bart's Team", rank: 1, points: 386 }, prev: null, next: null };
  const load = async (gw?: string, over: Parameters<typeof fakeFpl>[0] = {}): Promise<Extract<TeamModel, { kind: "ok" }>> => {
    const m = await createTeamService(fakeFpl({ entry, ...over }), { now: clock }).load(7, gw);
    if (m.kind !== "ok") throw new Error("expected ok");
    return { ...m, team: { ...m.team, league: leagueSpot } };
  };
  const facts = (m: TeamModel) => {
    const { container, unmount } = render(<TeamView model={m as Exclude<TeamModel, { kind: "not-found" }>} now={NOW} />);
    const dts = Array.from(container.querySelectorAll("dt")).map((d) => d.textContent);
    const html = container.innerHTML;
    unmount();
    return { dts, html };
  };
  it("shows the league position beside the latest gameweek only", async () => {
    expect(facts(await load()).dts).toContain("League");
    expect(facts(await load("5")).dts).not.toContain("League");
  });
  it("doesn't repeat the manager's experience in the header (the Experience card has it)", async () => {
    expect(facts(await load()).dts).not.toContain("Experience");
  });
  it("gives the next deadline beside the latest final week", async () => {
    const f = facts(await load(undefined, { bootstrap: async () => finalBootstrap(true) }));
    expect(f.dts).toContain("Next deadline");
    expect(f.html).toContain('datetime="2026-10-17T10:30:00.000Z"');
    expect(facts(await load()).dts).not.toContain("Next deadline"); // live: not yet
  });
  it("offers a way straight back to the latest gameweek from two or more weeks back", async () => {
    const events = [1, 2, 3, 4, 5].map((id) => event({ id, name: `Gameweek ${id}`, is_current: false, finished: true, data_checked: true }));
    const bs = async () => ({ ...bootstrap, events: [...events, ...bootstrap.events.filter((e) => e.id === 6)] });
    const { container, unmount } = render(<TeamView model={await load("3", { bootstrap: bs })} now={NOW} />);
    const latest = container.querySelector('a[aria-label="Go to the latest gameweek, Gameweek 6"]');
    expect(latest?.textContent).toBe("Latest: GW6");
    expect(latest?.getAttribute("href")).toMatch(/\?gw=6$/);
    unmount();
    // One week back the pager's own "next" already does it.
    const near = render(<TeamView model={await load("5", { bootstrap: bs })} now={NOW} />);
    expect(near.container.querySelector('a[aria-label^="Go to the latest gameweek"]')).toBeNull();
    near.unmount();
  });
});
