/** The wording of the team page's insight cards. The numbers come from the domain; these pin what the page says about them. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchdayInsights, SeasonInsightsView } from "@/components/views/TeamInsightsView";
import { freeTransfers, seasonCharts, seasonForm, tenure } from "@/lib/domain";
import type { HistoryGameweek } from "@/lib/domain/types";
import type { GameweekInsights, SeasonInsights } from "@/lib/services/models";

const none: GameweekInsights = { captain: null, bench: null, chip: null, autoSubs: [], rotation: [], remaining: null, defcon: [], flags: [] };
const matchday = (over: Partial<GameweekInsights>) => render(<MatchdayInsights data={{ ...none, ...over }} gameweek="Gameweek 6" />);
const captain = (over: object = {}) => ({
  captain: { name: "B.Fernandes", base: 1, multiplier: 2, points: 2 },
  vice: { name: "Haaland", base: 6 },
  best: { name: "De Cuyper", base: 15 },
  state: "played" as const,
  regret: 28,
  provisional: true,
  ...over,
});

describe("captaincy wording", () => {
  it("says what the better armband would have added, with the numbers, and 'so far' while the week is live", () => {
    matchday({ captain: captain() as never });
    expect(screen.getByText(/De Cuyper: 15 pts\. Swapping the armband gains/)).toBeInTheDocument();
    expect(screen.getByText("28 pts")).toBeInTheDocument();
    expect(screen.getByText(/so far\./)).toBeInTheDocument();
  });
  it("uses the past tense and drops 'so far' once the week is over", () => {
    matchday({ captain: captain({ provisional: false }) as never });
    expect(screen.getByText(/De Cuyper: 15 pts\. Swapping the armband would have gained/)).toBeInTheDocument();
    expect(screen.queryByText(/so far/)).toBeNull();
  });
  it("praises the best armband, and says 'so far' only while live", () => {
    const { unmount } = matchday({ captain: captain({ regret: 0 }) as never });
    expect(screen.getByText("Best armband in the XI so far.")).toBeInTheDocument();
    unmount();
    matchday({ captain: captain({ regret: 0, provisional: false }) as never });
    expect(screen.getByText("Best armband in the XI.")).toBeInTheDocument();
  });
  it("covers a captain who hasn't played and one who sat out", () => {
    const { unmount } = matchday({ captain: captain({ state: "waiting", regret: null }) as never });
    expect(screen.getByText("Captain has not played yet.")).toBeInTheDocument();
    unmount();
    matchday({ captain: captain({ state: "unused", regret: null }) as never });
    expect(screen.getByText("Captain did not play: no armband verdict.")).toBeInTheDocument();
  });
  it("shows the vice-captain with a score, or just the name when there isn't one yet", () => {
    const { unmount } = matchday({ captain: captain() as never });
    expect(screen.getByText("Vice-captain: Haaland, 6 pts")).toBeInTheDocument();
    unmount();
    matchday({ captain: captain({ vice: { name: "Haaland", base: null } }) as never });
    expect(screen.getByText("Vice-captain: Haaland")).toBeInTheDocument();
  });
});

describe("chip, bench and matchday wording", () => {
  it("explains each chip in a sentence that is true of it", () => {
    const { unmount } = matchday({ chip: { chip: "bboost", points: 12 } });
    expect(screen.getByText("Bench Boost: bench points count.")).toBeInTheDocument();
    unmount();
    matchday({ chip: { chip: "3xc", points: 9 } });
    expect(screen.getByText("Triple Captain: the captain counts three times.")).toBeInTheDocument();
  });
  it("comments on a big bench and a perfect one, but not an ordinary one or a counted one", () => {
    const bench = (points: number, counted = false) => ({ bench: { points, players: [{ name: "Kinsky", points }], counted } });
    const { unmount } = matchday(bench(14));
    expect(screen.getByText("A lot of points left on the bench.")).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = matchday(bench(0));
    expect(screen.getByText("Nothing left on the bench.")).toBeInTheDocument();
    u2();
    const { unmount: u3 } = matchday(bench(5));
    expect(screen.queryByText(/A lot of points left|Nothing left on the bench/)).toBeNull();
    u3();
    matchday(bench(30, true));
    expect(screen.queryByText(/A lot of points left/)).toBeNull();                    // under Bench Boost those points are not wasted
  });
  it("says how many are still to play, with the armband allowed for", () => {
    matchday({ remaining: { count: 1, effective: 1, played: 10 } });
    expect(screen.getByText("10 of 11 have played. 1 player's points still to come, armband included.")).toBeInTheDocument();
  });
  it("uses the plural for several, and says plainly when everyone has played", () => {
    const { unmount } = matchday({ remaining: { count: 3, effective: 4, played: 8 } });
    expect(screen.getByText(/4 players' points still to come, armband included/)).toBeInTheDocument();
    unmount();
    matchday({ remaining: { count: 0, effective: 0, played: 11 } });
    expect(screen.getByText("All 11 counting players have played.")).toBeInTheDocument();
    expect(screen.queryByText(/No more match points/)).toBeNull();                 // a player can be mid-match, or have a second fixture to come
  });
  it("states the DefCon rule as thresholds, matching the numbers the bars use", () => {
    matchday({ defcon: [{ name: "Saliba", value: 7, threshold: 10, reached: false, matches: 1 }] });
    expect(screen.getByText(/10 defensive contributions in a match for a defender, 12 for a midfielder or forward/)).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------------------------------------ the season

const g = (event: number, points: number, over: Partial<HistoryGameweek> = {}): HistoryGameweek => ({
  event, points, total_points: 0, rank: null, overall_rank: 1000 / event, bank: 5, value: 995 + event, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0, ...over,
});
function season(current: HistoryGameweek[], over: Partial<SeasonInsights> = {}): SeasonInsights {
  return {
    form: seasonForm(current, 99), charts: seasonCharts(current, [], 99), seasonEnd: 38, tenure: tenure([{ season_name: "2024/25", total_points: 2400, rank: 227669 }]),
    freeTransfers: freeTransfers(current, []), chips: [], ...over,
  };
}
const view = (s: SeasonInsights, squad: { ownership: never; outlook: never } = { ownership: null as never, outlook: null as never }) =>
  render(<SeasonInsightsView season={s} squad={squad} nextGw={7} />);

describe("season wording", () => {
  const cur = [g(1, 60), g(2, 71, { event_transfers: 2, event_transfers_cost: 4 }), g(3, 48)];

  it("reads the season's high and low points off the numbers", () => {
    view(season(cur));
    expect(screen.getByText(/Averaging/)).toBeInTheDocument();
    expect(screen.getByText(/High point: GW2 with 67\. Low point: GW3 with 48\./)).toBeInTheDocument();     // 71 less the 4-point hit
  });
  it("says the average comparison is before hits, and notes the hits it left out", () => {
    const events = [{ id: 1, average_entry_score: 50 }, { id: 2, average_entry_score: 60 }, { id: 3, average_entry_score: 45 }];
    const withAverages = season(cur, { charts: seasonCharts(cur, events, 99) });
    view(withAverages);
    expect(screen.getByText(/Scored more than the average manager in/)).toBeInTheDocument();
    expect(screen.getByText(/, before hits\./)).toBeInTheDocument();
    expect(screen.getByText(/Hits not shown: GW2 cost 4\./)).toBeInTheDocument();
    expect(screen.getByText("Above the average")).toBeInTheDocument();
  });
  it("says what the hits cost, or that there were none", () => {
    view(season(cur));
    expect(screen.getByText(/2 made this season, and the hits cost you 4 pts/)).toBeInTheDocument();
  });
  it("celebrates a season without a hit", () => {
    view(season([g(1, 60), g(2, 70, { event_transfers: 1 })]));
    expect(screen.getByText(/1 made this season, and not a single hit taken/)).toBeInTheDocument();
  });
  it("keeps Bench Boost weeks out of 'wasted' bench points and says so", () => {
    const chips = [{ name: "bboost", event: 2 }];
    const withBoost = [g(1, 60, { points_on_bench: 4 }), g(2, 70, { points_on_bench: 22 }), g(3, 50, { points_on_bench: 6 })];
    view(season(withBoost, { charts: seasonCharts(withBoost, [], 99, chips) }));
    expect(screen.getByText("10")).toBeInTheDocument();                              // 4 + 6, not 32
    expect(screen.getByText(/Most wasted in GW3: 6 pts\./)).toBeInTheDocument();
    expect(screen.getByText(/Not counted: GW2 \(Bench Boost, when the bench's points count\)\./)).toBeInTheDocument();
  });
  it("hands the last word on free transfers to FPL", () => {
    view(season(cur));
    expect(screen.getByText(/up to 5 can be banked\), so FPL's own count has the final word/)).toBeInTheDocument();
  });
  it("describes squad value as 'since day one', and says it includes the bank", () => {
    view(season([g(1, 60, { value: 1000 }), g(2, 60, { value: 1004 })]));
    expect(screen.getByText(/Up £0\.4m since day one\./)).toBeInTheDocument();
    expect(screen.getByText(/That's the squad and the bank together\./)).toBeInTheDocument();
  });
  it("says a squad that hasn't moved is exactly where it started", () => {
    view(season([g(1, 60, { value: 1000, bank: 0 }), g(2, 60, { value: 1000, bank: 0 })]));
    expect(screen.getByText(/Exactly where it started\./)).toBeInTheDocument();
  });
  it("states plainly that no starter is lightly owned, and names differentials otherwise", () => {
    const { unmount } = view(season(cur), { ownership: { average: 45.2, differentials: [] } as never, outlook: null as never });
    expect(screen.getByText("Not one starter is owned by fewer than 10% of managers.")).toBeInTheDocument();
    expect(screen.queryByText(/Pure template/)).toBeNull();                         // the data says who is lightly owned, not what a squad "is"
    unmount();
    view(season(cur), { ownership: { average: 30.1, differentials: [{ name: "Ajer", ownership: 3.7 }] } as never, outlook: null as never });
    expect(screen.getByText("Your differentials, the starters owned by under 10%: Ajer (3.7%).")).toBeInTheDocument();
  });
  it("names the softest and toughest runs", () => {
    view(season(cur), { ownership: null as never, outlook: { fromGw: 7, toGw: 9, average: 3.1, easiest: { club: "COV", average: 2.7 }, hardest: { club: "BHA", average: 3.7 } } as never });
    expect(screen.getByText("Softest run: COV (2.7). Toughest test: BHA (3.7).")).toBeInTheDocument();
  });
  it("shows rank once: in its own card when there is a journey to draw, in the form card when there isn't", () => {
    const { unmount } = view(season(cur));
    expect(screen.getByRole("heading", { name: "Overall rank" })).toBeInTheDocument();
    expect(screen.queryAllByText(/Overall rank \d/)).toHaveLength(0);
    unmount();
    view(season([g(1, 60)]));
    expect(screen.queryByRole("heading", { name: "Overall rank" })).toBeNull();
    expect(screen.getByText(/Overall rank 1,000/)).toBeInTheDocument();
  });
});
