/**
 * The changing copy on Tools, History and The Times: the facts behind it (where the season is, the crowd's week, what
 * a saved table says), and the promise that only the wording moves, never the numbers.
 */
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryListView } from "@/components/views/HistoryListView";
import { SnapshotView } from "@/components/views/SnapshotView";
import { TimesLibraryView } from "@/components/views/TimesLibraryView";
import { ToolsView } from "@/components/views/ToolsView";
import { gwPhase, shelfStatus, snapshotFacts, transferPulse, type PriceRow } from "@/lib/domain";
import { MESSAGES } from "@/lib/domain/i18n";
import type { Bootstrap, FplEvent } from "@/lib/domain/types";
import { createHistoryService } from "@/lib/services/history";
import { createTimesService } from "@/lib/services/times";
import { createToolsService } from "@/lib/services/tools";
import { event, standing } from "./fixtures";
import { fakeFpl, fakeHistory } from "./support";
import { LIBRARY, fakeTimes } from "./times-fixtures";
import { NOW, bootstrap as world, league, picksFor, schedule } from "./toolsWorld";

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

/** GW5 done, GW6 deadline 10 Oct, GW7 deadline 17 Oct; override GW6's state per test. */
const season = (gw6: Partial<FplEvent> = {}): FplEvent[] => [
  event({ id: 5, name: "Gameweek 5", is_current: false, finished: true, data_checked: true, deadline_time: "2026-10-03T10:00:00Z", average_entry_score: 49 }),
  event({ id: 6, name: "Gameweek 6", is_current: true, deadline_time: "2026-10-10T10:00:00Z", average_entry_score: 55, ...gw6 }),
  event({ id: 7, name: "Gameweek 7", is_current: false, is_next: true, deadline_time: "2026-10-17T10:00:00Z" }),
];

describe("gwPhase", () => {
  const now = at("2026-10-12T12:00:00Z");

  it("is upcoming before the first deadline, and names it", () => {
    const pre = [event({ id: 1, name: "Gameweek 1", is_current: false, deadline_time: "2026-08-15T10:00:00Z" })];
    expect(gwPhase(pre, at("2026-08-01T00:00:00Z"))).toMatchObject({ phase: "upcoming", gw: null, next: 1, average: null });
  });
  it("is live while the gameweek is played, with the next deadline ahead", () => {
    expect(gwPhase(season(), now)).toMatchObject({ phase: "live", gw: 6, next: 7, average: null });
  });
  it("is provisional once the matches are done but FPL hasn't checked the data", () => {
    expect(gwPhase(season({ finished: true }), now)).toMatchObject({ phase: "provisional", gw: 6, next: 7, average: 55 });
  });
  it("is final once FPL has checked it, and points at the next gameweek", () => {
    expect(gwPhase(season({ finished: true, data_checked: true }), now)).toMatchObject({ phase: "final", gw: 6, next: 7, average: 55 });
  });
  it("is over when the last gameweek is final and no deadline is left", () => {
    const last = [event({ id: 38, name: "Gameweek 38", finished: true, data_checked: true, deadline_time: "2027-05-23T10:00:00Z", average_entry_score: 60 })];
    expect(gwPhase(last, at("2027-05-30T00:00:00Z"))).toMatchObject({ phase: "over", gw: 38, next: null, average: 60 });
  });
  it("draws new wording each day and when the phase moves on, the same all day", () => {
    const live = gwPhase(season(), now).variety;
    expect(gwPhase(season(), new Date(now.getTime() + 3_600_000)).variety).toBe(live);
    expect(gwPhase(season(), new Date(now.getTime() + DAY)).variety).not.toBe(live);
    expect(gwPhase(season({ finished: true }), now).variety).not.toBe(live);
    expect(gwPhase(season({ finished: true, data_checked: true }), now).variety).not.toBe(gwPhase(season({ finished: true }), now).variety);
  });
});

describe("transferPulse", () => {
  const bs: Pick<Bootstrap, "elements" | "teams"> = {
    teams: [{ id: 1, code: 3, name: "Arsenal", short_name: "ARS" }, { id: 2, code: 43, name: "Man City", short_name: "MCI" }],
    elements: [
      { id: 1, web_name: "Saka", first_name: "", second_name: "", team: 1, element_type: 3, transfers_in_event: 900, transfers_out_event: 10 },
      { id: 2, web_name: "Haaland", first_name: "", second_name: "", team: 2, element_type: 4, transfers_in_event: 50, transfers_out_event: 700 },
      { id: 3, web_name: "Rice", first_name: "", second_name: "", team: 1, element_type: 3, transfers_in_event: 900, transfers_out_event: 0 },
    ],
  };
  const price = (id: number, name: string, net: number, status: PriceRow["status"]): PriceRow => ({ id, name, teamId: 1, club: "ARS", clubCode: 3, positionId: 3, price: 70, net, share: 0, owned: 10, status });

  it("names the most bought and sold (lowest id wins a tie) and the price pressure each way", () => {
    const prices = [price(1, "Saka", 900, "likelyRise"), price(3, "Rice", 1200, "likelyRise"), price(2, "Haaland", -700, "likelyFall"), price(4, "Other", 5, "steady")];
    expect(transferPulse(bs, prices)).toEqual({
      bought: { name: "Saka", club: "ARS", count: 900 },
      sold: { name: "Haaland", club: "MCI", count: 700 },
      rising: 2,
      falling: 1,
      topRiser: "Rice",
      topFaller: "Haaland",
    });
  });
  it("says nothing when nobody has moved", () => {
    expect(transferPulse({ teams: [], elements: [] }, [])).toEqual({ bought: null, sold: null, rising: 0, falling: 0, topRiser: null, topFaller: null });
  });
});

describe("snapshotFacts", () => {
  it("reads the leader, the gap, the best week and the biggest moves", () => {
    const rows = [
      standing({ entry: 1, entry_name: "Alpha", rank: 1, last_rank: 3, total: 120, event_total: 70 }),
      standing({ entry: 2, entry_name: "Beta", rank: 2, last_rank: 1, total: 112, event_total: 40 }),
      standing({ entry: 3, entry_name: "Gamma", rank: 3, last_rank: 2, total: 100, event_total: 30 }),
    ];
    expect(snapshotFacts(rows)).toEqual({
      leader: { name: "Alpha", total: 120 },
      gap: 8,
      best: { name: "Alpha", points: 70 },
      climber: { name: "Alpha", places: 2 },
      faller: { name: "Beta", places: 1 },
    });
  });
  it("makes no claims for an empty table, or about movement nobody made", () => {
    expect(snapshotFacts([])).toBeNull();
    expect(snapshotFacts([standing({ rank: 1, last_rank: 0 })])).toMatchObject({ gap: null, climber: null, faller: null });
  });
});

describe("shelfStatus", () => {
  const now = at("2026-10-12T12:00:00Z");
  it("is pending when the gameweek is finished but not filed yet", () => {
    expect(shelfStatus([4, 5], gwPhase(season({ finished: true, data_checked: true }), now))).toEqual({ latest: 5, gw: 6, phase: "final", pending: true });
  });
  it("is filed once the table is on the shelf, and never pending mid-gameweek", () => {
    expect(shelfStatus([5, 6], gwPhase(season({ finished: true, data_checked: true }), now)).pending).toBe(false);
    expect(shelfStatus([5], gwPhase(season(), now)).pending).toBe(false);
  });
  it("just lists without FPL", () => {
    expect(shelfStatus([], null)).toEqual({ latest: null, gw: null, phase: null, pending: false });
  });
});

describe("the Tools page's wording", () => {
  const tools = (now: Date, events = world.events) =>
    createToolsService(fakeFpl({ bootstrap: async () => ({ ...world, events }), standings: async () => league(12), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e) }), { now: () => now }).load(1, {});
  const ok = async (now: Date, events?: FplEvent[]) => {
    const m = await tools(now, events);
    if (m.kind !== "ok") throw new Error("expected ok");
    return m;
  };

  // The countdown ticks by itself; everything else on the page is what we compare.
  const words = async (now: Date) => renderToStaticMarkup(<ToolsView model={await ok(now)} />).replace(/<section class="timer"[\s\S]*?<\/section>/, "");

  it("is the same all day, and changes from one day to the next", async () => {
    const a = await words(NOW);
    expect(await words(new Date(NOW.getTime() + 3_600_000))).toBe(a);
    const days = await Promise.all([1, 2, 3, 4].map((d) => words(new Date(NOW.getTime() + d * DAY))));
    expect(days.some((html) => html !== a)).toBe(true);
  });

  it("keeps the lab's simulated numbers whatever the day", async () => {
    const [a, b] = await Promise.all([ok(NOW), ok(new Date(NOW.getTime() + 2 * DAY))]);
    expect(b.lab).toEqual(a.lab);
  });

  it("leads with this week: the live gameweek and the next deadline", async () => {
    render(<ToolsView model={await ok(NOW)} />);
    const lead = document.querySelector("#brief p")?.textContent ?? "";
    expect(lead).toMatch(/Gameweek 6/);
    expect(lead).toMatch(/Gameweek 7/);
  });

  it("points to the next gameweek once the current one is final", async () => {
    const final = world.events.map((e) => (e.id === 6 ? { ...e, finished: true, data_checked: true } : e));
    render(<ToolsView model={await ok(NOW, final)} />);
    const lead = document.querySelector("#brief p")?.textContent ?? "";
    const expected = MESSAGES.en.tools.brief.final.map((f) => f("Gameweek 6", "Gameweek 7"));
    expect(expected).toContain(lead);
  });
});

describe("the history shelf's wording", () => {
  const list = [{ gw: 5, taken_at: "2026-10-04T06:00:00Z", league_id: 1 }, { gw: 4, taken_at: "2026-09-27T06:00:00Z", league_id: 1 }];
  const shelf = (gw6: Partial<FplEvent>, now = at("2026-10-12T12:00:00Z")) =>
    createHistoryService(fakeHistory({ list: async () => list as never }), undefined, { fpl: fakeFpl({ bootstrap: async () => ({ ...world, events: season(gw6) }) }), now: () => now }).shelf(1);

  it("marks the newest saved table as the latest final one and says what's next", async () => {
    const m = await shelf({});
    render(<HistoryListView snapshots={m.snapshots} shelf={m} />);
    expect(screen.getByText(MESSAGES.en.history.latest)).toBeInTheDocument();
    const intro = document.querySelector('section[aria-labelledby="tables-heading"] p')?.textContent ?? "";
    expect(MESSAGES.en.history.live.map((f) => f(6)).some((line) => intro.includes(line))).toBe(true);
  });

  it("says a finished gameweek is on its way to the shelf", async () => {
    const m = await shelf({ finished: true, data_checked: true });
    expect(m.status).toMatchObject({ latest: 5, gw: 6, pending: true });
    render(<HistoryListView snapshots={m.snapshots} shelf={m} />);
    const intro = document.querySelector('section[aria-labelledby="tables-heading"] p')?.textContent ?? "";
    expect(MESSAGES.en.history.pending.map((f) => f(6)).some((line) => intro.includes(line))).toBe(true);
  });

  it("reads a saved table's story from its own rows", () => {
    const rows = [
      standing({ entry: 1, entry_name: "Alpha", rank: 1, last_rank: 2, total: 120, event_total: 70 }),
      standing({ entry: 2, entry_name: "Beta", rank: 2, last_rank: 1, total: 112, event_total: 40 }),
    ];
    render(<SnapshotView gw={5} snapshot={{ gw: 5, leagueName: "L", takenAt: "t", rows, rebuilt: null, facts: snapshotFacts(rows), variety: 0 }} />);
    expect(screen.getByText(/Alpha/, { selector: "p" }).textContent).toMatch(/120/);
  });
});

describe("The Times' wording", () => {
  const fpl = (gw6: Partial<FplEvent>) => fakeFpl({ bootstrap: async () => ({ ...world, events: season(gw6) }) });

  it("says the next edition is at the printer once its gameweek is done", async () => {
    const m = await createTimesService(fakeTimes(LIBRARY), { fpl: fpl({ finished: true, data_checked: true }), now: () => at("2026-10-12T12:00:00Z") }).library(undefined);
    expect(m.press).toMatchObject({ gw: 6, phase: "final", awaiting: 6 });
    render(<TimesLibraryView model={m} />);
    expect(MESSAGES.en.times.awaiting.map((f) => f(6))).toContain(screen.getByRole("note").textContent);
  });

  it("promises nothing when the presses have fallen behind by more than one edition", async () => {
    const older = LIBRARY.filter((i) => i.id !== "times-gw5");
    const m = await createTimesService(fakeTimes(older), { fpl: fpl({ finished: true, data_checked: true }), now: () => at("2026-10-12T12:00:00Z") }).library(undefined);
    expect(m.press.awaiting).toBeNull();
  });

  it("keeps its library order and facts whatever the day", async () => {
    const svc = (d: number) => createTimesService(fakeTimes(LIBRARY), { now: () => new Date(at("2026-10-12T12:00:00Z").getTime() + d * DAY) }).library(undefined);
    const [a, b] = await Promise.all([svc(0), svc(1)]);
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("expected ok");
    expect(b.issues).toEqual(a.issues);
    expect(b.hero).toEqual(a.hero);
  });
});
