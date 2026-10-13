import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureFeed } from "@/components/views/FixtureFeed";
import { FixtureFeedView } from "@/components/views/FixtureFeedView";
import { buildFixtureFeed } from "@/lib/domain";
import type { FplEvent, FplTeam, ScheduledFixture } from "@/lib/domain/types";
import type { FeedTeamRef, FixtureFeedModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";

const clubs: FplTeam[] = [1, 2, 3, 4].map((id) => ({ id, code: id * 10, name: `Club ${id}`, short_name: `C${id}` }));
const teams: Record<number, FeedTeamRef> = Object.fromEntries(clubs.map((c) => [c.id, { id: c.id, name: c.name, short: c.short_name, code: c.code }]));
const GWS = 10;
const events: FplEvent[] = Array.from({ length: GWS }, (_, i) => ({
  id: i + 1, name: `Gameweek ${i + 1}`, deadline_time: `2026-10-${String(i + 1).padStart(2, "0")}T17:30:00Z`,
  is_current: i === 4, is_next: i === 5, finished: i < 4, data_checked: i < 4,
}));
const fixture = (id: number, gw: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event: gw, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: `2026-10-${String(gw).padStart(2, "0")}T14:00:00Z`,
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});
const schedule = events.flatMap((e) => [fixture(e.id * 10, e.id), fixture(e.id * 10 + 1, e.id, { team_h: 3, team_a: 4 })]);
const feed = buildFixtureFeed(events, clubs, schedule);

const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

// jsdom has no IntersectionObserver; this one lets a test say "the end came into view".
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeObserver {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { observed.push(cb); }
  observe() {}
  disconnect() { observed = []; }
}
const scrollToEnd = () => act(() => observed.at(-1)?.([{ isIntersecting: true }]));

beforeEach(() => {
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("FixtureFeed", () => {
  it("opens on the chosen gameweek and shows three, not the whole season", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    expect(titles()).toEqual(["Gameweek 5", "Gameweek 6", "Gameweek 7"]);
  });

  it("brings in three more gameweeks when the end of the list scrolls into view, and keeps going", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    scrollToEnd();
    expect(titles()).toHaveLength(6);
    scrollToEnd();
    expect(titles().at(-1)).toBe("Gameweek 10");                                  // 10 is the last: it stops there
    expect(titles()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
    expect(screen.getByText(/that.s the lot/i)).toBeInTheDocument();
  });

  it("does the same from a button, for anyone who isn't scrolling", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    fireEvent.click(screen.getByRole("button", { name: /show more gameweeks/i }));
    expect(titles()).toHaveLength(6);
  });

  it("works without IntersectionObserver (the button is enough)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={0} />);
    expect(titles()).toHaveLength(3);
  });

  it("brings in earlier gameweeks above, and then stops offering them", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    fireEvent.click(screen.getByRole("button", { name: /earlier gameweeks/i }));
    expect(titles()[0]).toBe("Gameweek 2");
    fireEvent.click(screen.getByRole("button", { name: /earlier gameweeks/i }));
    expect(titles()[0]).toBe("Gameweek 1");
    expect(screen.queryByRole("button", { name: /earlier gameweeks/i })).toBeNull();
  });

  it("keeps the reader's place when earlier gameweeks are added above them", () => {
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    // Each gameweek on the page is 300px tall: adding three above the reader adds 900px.
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(() => 1100 + 300 * document.querySelectorAll("section").length);
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /earlier gameweeks/i }));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 400 + 900);               // moved down by exactly the height that was added
  });

  it("keeps keyboard focus in the feed when the Earlier button goes away", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    const earlier = () => screen.getByRole("button", { name: /earlier gameweeks/i });
    earlier().focus();
    fireEvent.click(earlier());                                                   // GW2, GW3, GW4 added: still more above
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /earlier gameweeks/i }));
    earlier().focus();
    fireEvent.click(earlier());                                                   // reaches GW1: the button is gone
    expect(screen.queryByRole("button", { name: /earlier gameweeks/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: /jump to/i }));   // focus moved on, not lost to the page
  });

  it("jumps to any gameweek from the list", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    fireEvent.change(screen.getByRole("combobox", { name: /jump to/i }), { target: { value: "8" } });
    expect(titles()).toEqual(["Gameweek 9", "Gameweek 10"]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("flags this week, played weeks, doubles and blanks", () => {
    const double = buildFixtureFeed(events, clubs, [...schedule, fixture(999, 5, { team_h: 1, team_a: 3 })]);
    render(<FixtureFeed gameweeks={double} teams={teams} startIndex={3} />);
    expect(screen.getByText("Played")).toBeInTheDocument();                      // GW4 is over
    expect(screen.getByText("This week")).toBeInTheDocument();                   // GW5 is current
    const gw5 = within(document.getElementById("gw-5")!);
    expect(gw5.getByText("Double gameweek")).toBeInTheDocument();
    expect(gw5.getByText("C1, C3")).toBeInTheDocument();
  });

  it("prints scores for matches that have started and a clock time for those that haven't", () => {
    const played = buildFixtureFeed(events, clubs, [fixture(1, 1, { started: true, finished: true, finished_provisional: true, team_h_score: 3, team_a_score: 1 }), fixture(2, 1, { started: true, team_h_score: 0, team_a_score: 0, team_h: 3, team_a: 4 }), fixture(3, 1, { team_h: 1, team_a: 4 })]);
    render(<FixtureFeed gameweeks={played} teams={teams} startIndex={0} />);
    expect(screen.getByText("3–1")).toBeInTheDocument();
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getByText("0–0")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("Bonus pending")).toBeNull();
    expect(document.querySelectorAll("li time")).toHaveLength(1);                // only the one that hasn't kicked off has a time
  });

  it("marks today, but only in the browser (the server can't know the viewer's today)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders the opening gameweeks on the server, without any 'Today' (that would not match what the browser shows)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));                           // GW5's match day, so a browser render does say Today
    const html = renderToString(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    vi.useRealTimers();
    expect(html).toContain("Gameweek 5");
    expect(html).toContain("Gameweek 7");
    expect(html).not.toContain("Gameweek 8");
    expect(html).not.toContain("Today");
  });

  it("names clubs in full for screen readers and gives every side its difficulty", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={0} />);
    const row = document.querySelector("li")!;
    expect(within(row).getByText("Club 1")).toBeInTheDocument();
    expect(within(row).getAllByText(/difficulty \d of 5/)).toHaveLength(2);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={4} />);
    await expectNoAxeViolations(container);
  });
});

describe("FixtureFeedView", () => {
  const ok = (over: Partial<Extract<FixtureFeedModel, { kind: "ok" }>> = {}): FixtureFeedModel => ({ kind: "ok", startIndex: 4, gameweeks: feed, teams, windows: [3, 5, 10], highlights: null, next: null, variety: 0, ...over });

  it("offers the feed and the 3/5/10 grids, with the feed marked as the current view", () => {
    render(<FixtureFeedView model={ok()} />);
    const nav = screen.getByRole("navigation", { name: "Fixtures view" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["All fixtures", "Next 3", "Next 5", "Next 10"]);
    expect(within(nav).getByRole("link", { name: "All fixtures" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Next 5" })).toHaveAttribute("href", "/fixtures?n=5");
  });

  it("says so when there is nothing to show", () => {
    render(<FixtureFeedView model={ok({ gameweeks: [] })} />);
    expect(screen.getByText("No fixtures yet")).toBeInTheDocument();
    render(<FixtureFeedView model={{ kind: "no-season" }} />);
    expect(screen.getAllByText("No fixtures yet")).toHaveLength(2);
  });
});

describe("FixtureFeed: full time before bonus is confirmed", () => {
  it("says in visible words that the bonus is still pending, with no hover-only tooltip", () => {
    const g = buildFixtureFeed(events, clubs, [fixture(1, 1, { started: true, finished_provisional: true, team_h_score: 2, team_a_score: 1 })]);
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(screen.getByText("2–1")).toBeInTheDocument();
    const pending = screen.getByText("Bonus pending");
    expect(pending).toBeVisible();
    expect(pending).not.toHaveAttribute("title");
    expect(screen.getByText("FT")).toHaveClass("sr-only");                        // full time is still said to screen readers
  });
});

describe("FixtureFeed: played matches lead to the bonus page", () => {
  const g = buildFixtureFeed(events, clubs, [
    fixture(1, 1, { started: true, finished: true, finished_provisional: true, team_h_score: 3, team_a_score: 1 }),
    fixture(2, 1, { started: true, team_h_score: 0, team_a_score: 0, team_h: 3, team_a: 4 }),
    fixture(3, 1, { team_h: 1, team_a: 4 }),
  ]);

  it("links each started match's score to that gameweek's bonus page, named for the match", () => {
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    const done = screen.getByRole("link", { name: /3–1.*bonus points for club 1 v club 2/i });
    expect(done).toHaveAttribute("href", "/bonus?gw=1");
    expect(screen.getByRole("link", { name: /0–0.*live.*bonus points for club 3 v club 4/i })).toHaveAttribute("href", "/bonus?gw=1");
    expect(screen.queryByRole("link", { name: /club 1 v club 4/i })).toBeNull();     // not kicked off: no score, no link
  });

  it("never nests a link inside another", () => {
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(document.querySelectorAll("a a")).toHaveLength(0);
  });

  it("puts a bonus link by started gameweeks' headings only", () => {
    render(<FixtureFeed gameweeks={feed} teams={teams} startIndex={3} />);         // GW4 played, GW5 live, GW6 upcoming
    const bonus = (gw: number) => within(document.getElementById(`gw-${gw}`)!).queryByRole("link", { name: "Bonus points" });
    expect(bonus(4)).toHaveAttribute("href", "/bonus?gw=4");
    expect(bonus(5)).toHaveAttribute("href", "/bonus?gw=5");
    expect(bonus(6)).toBeNull();
  });

  it("drops the difficulty chips once a match has kicked off, and keeps them for the rest", () => {
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    const rows = [...document.querySelectorAll("li")];
    expect(within(rows[0]).queryAllByText(/difficulty \d of 5/)).toHaveLength(0);
    expect(within(rows[1]).queryAllByText(/difficulty \d of 5/)).toHaveLength(0);
    expect(within(rows[2]).getAllByText(/difficulty \d of 5/)).toHaveLength(2);
  });

  it("has no accessibility violations with linked scores", async () => {
    const { container } = render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    await expectNoAxeViolations(container);
  });
});

describe("FixtureFeed: times in the reader's time zone", () => {
  const zone = (timeZone: string) => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone };
    });
  };
  afterEach(() => vi.restoreAllMocks());
  // GW1: 12:00 UK is 22:00 the same day in Sydney (AEDT, UTC+11); 20:00 UK is 06:00 the next morning there.
  const g = buildFixtureFeed(events, clubs, [fixture(1, 1, { kickoff_time: "2026-10-01T11:00:00Z" }), fixture(2, 1, { kickoff_time: "2026-10-01T19:00:00Z", team_h: 3, team_a: 4 })]);
  const dayHeadings = () => [...document.querySelectorAll("#gw-1 h3")].map((h) => h.textContent);

  it("says the times are the reader's own", () => {
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(screen.getByText("Times in your time zone")).toBeInTheDocument();
  });

  it("files a late UK kick-off under the reader's next day in Sydney", () => {
    zone("Australia/Sydney");
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(dayHeadings()).toHaveLength(2);
  });

  it("keeps UK days for a UK reader, and on the server", () => {
    zone("Europe/London");
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(dayHeadings()).toHaveLength(1);
    zone("Australia/Sydney");
    const html = renderToString(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    expect(html.match(/<h3/g)).toHaveLength(1);                                    // the server can't know the reader's zone
  });

  it("marks today by the reader's date, not the UK's", () => {
    zone("Australia/Sydney");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T22:00:00Z"));                             // 2 October in Sydney, still 1 October in the UK
    render(<FixtureFeed gameweeks={g} teams={teams} startIndex={0} />);
    vi.useRealTimers();
    const today = screen.getByText("Today").closest("h3")!;
    expect(today).toBe(document.querySelectorAll("#gw-1 h3")[1]);
  });
});
