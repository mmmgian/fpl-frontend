import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClubLink } from "@/components/ui";
import { ClubView } from "@/components/views/ClubView";
import type { ClubNewsItem, PredictedPlayer } from "@/lib/domain";
import type { ClubMatchView, ClubModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";

type Ok = Extract<ClubModel, { kind: "ok" }>;

const opp = { id: 2, name: "Man City", short: "MCI", code: 43 };
const match = (id: number, over: Partial<ClubMatchView> = {}): ClubMatchView => ({
  id, gw: id, kickoff: `2026-10-${10 + id}T14:00:00Z`, state: "upcoming", opponent: opp, home: true, band: 3, scored: null, conceded: null, result: null, ...over,
});
const player = (id: number, name: string, over: Partial<PredictedPlayer["player"]> = {}): PredictedPlayer["player"] => ({
  id, name, position: 3, status: "a", news: "", newsAdded: null, chance: null, cost: 100, form: 4, points: 30, minutes: 450, starts: 5, ownership: 10, ...over,
});
const predicted = (name: string, over: Partial<PredictedPlayer> = {}): PredictedPlayer => ({ player: player(Math.abs(name.length * 31), name), startRate: 1, doubt: false, ...over });

const base = (over: Partial<Ok> = {}): Ok => ({
  kind: "ok",
  club: { id: 1, name: "Arsenal", short: "ARS", code: 3 },
  form: ["W", "D", "L"],
  next: [match(2), match(3, { home: false })],
  recent: [match(1, { state: "finished", scored: 2, conceded: 1, result: "W" })],
  news: [],
  lineup: null,
  europe: { status: "off" },
  headlines: { status: "off" },
  ...over,
});

describe("ClubLink", () => {
  it("goes to the club's page and says where in its tooltip", () => {
    render(<ClubLink id={7} name="Spurs">Tottenham</ClubLink>);
    const a = screen.getByRole("link", { name: "Tottenham" });
    expect(a).toHaveAttribute("href", "/club/spurs");
    expect(a).toHaveAttribute("title", expect.stringContaining("Spurs"));
  });
});

describe("ClubView", () => {
  it("names the club, shows its form oldest-to-newest in words, and the next match", () => {
    render(<ClubView model={base()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Arsenal" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Last 3, oldest first: Won, Drew, Lost" })).toBeInTheDocument();
    expect(screen.getByText(/Next: Man City,/)).toBeInTheDocument();
  });

  it("lists upcoming matches with the opponent linked, venue and difficulty", () => {
    render(<ClubView model={base()} />);
    const card = screen.getByRole("heading", { name: "Up next" }).closest("section")!;
    const links = within(card).getAllByRole("link", { name: /Man City/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/club/man-city");
    expect(within(card).getByText("Home")).toBeInTheDocument();
    expect(within(card).getByText("Away")).toBeInTheDocument();
    expect(within(card).getAllByText(/difficulty 3 of 5/)).toHaveLength(2);
  });

  it("prints results with the score from the club's side, and a screen-reader word for the result", () => {
    render(<ClubView model={base({ recent: [match(1, { state: "finished", scored: 0, conceded: 3, result: "L" })] })} />);
    const card = screen.getByRole("heading", { name: "Recent results" }).closest("section")!;
    expect(within(card).getByText("0–3")).toBeInTheDocument();
    expect(within(card).getByText(/Lost,/)).toBeInTheDocument();
  });

  it("shows a match in progress as live with its score", () => {
    render(<ClubView model={base({ next: [match(2, { state: "live", scored: 1, conceded: 0 })] })} />);
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getByText("1–0")).toBeInTheDocument();
  });

  it("copes with no fixtures and no results at all", () => {
    render(<ClubView model={base({ next: [], recent: [], form: [] })} />);
    expect(screen.getByText(/Nothing scheduled/)).toBeInTheDocument();
    expect(screen.getByText(/No results yet/)).toBeInTheDocument();
    expect(screen.getByText("No fixture scheduled")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /oldest first/ })).toBeNull();
  });

  describe("team news", () => {
    const item = (name: string, severity: ClubNewsItem["severity"], over: Partial<PredictedPlayer["player"]> = {}): ClubNewsItem => ({ severity, player: player(name.length, name, over) });
    it("says what is wrong with whom, how serious it is, and the chance of playing", () => {
      render(<ClubView model={base({ news: [item("Saka", "doubt", { news: "Knock - 75% chance", chance: 75, newsAdded: "2026-10-09T10:00:00Z" }), item("Rice", "out", { news: "Hamstring", chance: 0 })] })} />);
      const card = screen.getByRole("heading", { name: "Team news" }).closest("section")!;
      expect(within(card).getByText("Doubt")).toBeInTheDocument();
      expect(within(card).getByText("Out")).toBeInTheDocument();
      expect(within(card).getByText("Knock - 75% chance")).toBeInTheDocument();
      expect(within(card).getByText("75% to play")).toBeInTheDocument();
      expect(within(card).getByText("0% to play")).toBeInTheDocument();
    });
    it("celebrates an empty injury list", () => {
      render(<ClubView model={base()} />);
      expect(screen.getByText(/clean bill of health/i)).toBeInTheDocument();
    });
    it("does not go blank when FPL flags a player but gives no words", () => {
      render(<ClubView model={base({ news: [item("Odegaard", "out", { news: "" })] })} />);
      expect(screen.getByText(/Flagged by FPL, no details given/)).toBeInTheDocument();
    });
  });

  describe("predicted XI", () => {
    const xi = {
      formation: "4-3-3", matches: 6, missing: 0, fit: 14, open: { defenders: 0, midfielders: 0, forwards: 0 },
      goalkeeper: predicted("Raya"), defenders: [predicted("Saliba"), predicted("Gabriel", { doubt: true }), predicted("White"), predicted("Timber")],
      midfielders: [predicted("Rice"), predicted("Odegaard"), predicted("Merino")], forwards: [predicted("Saka"), predicted("Havertz"), predicted("Martinelli", { startRate: 0.5 })],
    };
    it("lays the eleven out by line, with the shape, each start rate, and doubts flagged", () => {
      render(<ClubView model={base({ lineup: xi })} />);
      const card = screen.getByRole("heading", { name: "Predicted XI" }).closest("section")!;
      expect(within(card).getByText("4-3-3")).toBeInTheDocument();
      for (const n of ["Raya", "Saliba", "Rice", "Saka", "Martinelli"]) expect(within(card).getByText(n)).toBeInTheDocument();
      expect(within(card).getByText("50% of starts")).toBeInTheDocument();
      expect(within(within(card).getByText("Gabriel").closest("li")!).getByText("Doubt")).toBeInTheDocument();
    });
    it("is plain that it is a prediction, not an official line-up", () => {
      render(<ClubView model={base({ lineup: xi })} />);
      expect(screen.getByText(/a prediction, not an official line-up/i)).toBeInTheDocument();
    });
    it("tells the reader to be cautious early in the season", () => {
      render(<ClubView model={base({ lineup: { ...xi, matches: 2 } })} />);
      expect(screen.getByText(/so it is early days: treat it loosely/)).toBeInTheDocument();
      expect(screen.getByText(/the most-used player has started 2 matches/)).toBeInTheDocument();
    });
    it("says plainly when too few fit players have started, and marks a line with nobody", () => {
      render(<ClubView model={base({ lineup: { ...xi, forwards: [], missing: 2, fit: 9, open: { defenders: 0, midfielders: 0, forwards: 1 } } })} />);
      expect(screen.getByText("Only 9 fit players have started this season, so 2 places are left open rather than filled with a guess.")).toBeInTheDocument();
      expect(screen.getByText("Open place")).toBeInTheDocument();
    });
    it("does not blame a shortage when there were enough players but not in the right positions", () => {
      render(<ClubView model={base({ lineup: { ...xi, missing: 1, fit: 13 } })} />);
      expect(screen.getByText(/The fit players who have started don't cover every position, so 1 place is left open rather than guessed\./)).toBeInTheDocument();
      expect(screen.queryByText(/Only 13/)).toBeNull();
    });
    it("uses the singular for a single fit player, and says nothing when the XI is full", () => {
      const { unmount } = render(<ClubView model={base({ lineup: { ...xi, missing: 10, fit: 1 } })} />);
      expect(screen.getByText(/Only 1 fit player has started this season, so 10 places are left open/)).toBeInTheDocument();
      unmount();
      render(<ClubView model={base({ lineup: xi })} />);
      expect(screen.queryByText(/left open/)).toBeNull();
    });
    it("does not state a shape it can't stand behind", () => {
      render(<ClubView model={base({ lineup: { ...xi, formation: null, missing: 4, fit: 7 } })} />);
      expect(screen.getByText("Shape unclear")).toBeInTheDocument();
      expect(screen.queryByText("likely shape")).toBeNull();
    });
    it("describes where the rates come from without calling them the club's matches", () => {
      render(<ClubView model={base({ lineup: xi })} />);
      expect(screen.getByText(/the most-used player has started 6 matches/)).toBeInTheDocument();
      expect(screen.queryByText(/club's 6 matches/)).toBeNull();
    });
    it("explains an absent prediction instead of leaving a hole", () => {
      render(<ClubView model={base({ lineup: null })} />);
      expect(screen.getByText(/No prediction yet/)).toBeInTheDocument();
    });
  });

  describe("outside sources", () => {
    const euro = { id: 1, competition: "UEFA Champions League", utcDate: "2026-10-21T20:00:00.000Z", home: "Arsenal", away: "Bayern", clubIsHome: true, status: "SCHEDULED" };
    const headline = { title: "Arteta on injuries", url: "https://www.bbc.com/sport/football/articles/abc", summary: "He speaks.", publishedAt: "2026-10-10T10:00:00.000Z" };
    const credit = "https://www.bbc.co.uk/sport/football/teams/arsenal";

    it("shows no card at all for a source that isn't set up", () => {
      render(<ClubView model={base()} />);
      expect(screen.queryByRole("heading", { name: "In Europe" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Headlines" })).toBeNull();
    });
    it("lists European fixtures with the competition", () => {
      render(<ClubView model={base({ europe: { status: "ok", items: [euro] } })} />);
      const card = screen.getByRole("heading", { name: "In Europe" }).closest("section")!;
      expect(within(card).getByText("Champions League")).toBeInTheDocument();
      expect(within(card).getByText("Arsenal v Bayern")).toBeInTheDocument();
    });
    it("is straight about what an empty European list does and doesn't mean", () => {
      render(<ClubView model={base({ europe: { status: "ok", items: [] } })} />);
      expect(screen.getByText(/Europa League and Conference League games are not included/)).toBeInTheDocument();
    });
    it("says a source is unavailable without breaking the page", () => {
      render(<ClubView model={base({ europe: { status: "unavailable" }, headlines: { status: "unavailable" } })} />);
      expect(screen.getAllByText(/unavailable right now/)).toHaveLength(2);
      expect(screen.getByRole("heading", { name: "Up next" })).toBeInTheDocument();
    });
    it("shows BBC headlines as published, opening in a new tab, with the credit the BBC asks for", () => {
      render(<ClubView model={base({ headlines: { status: "ok", items: { items: [headline], creditUrl: credit } } })} />);
      const link = screen.getByRole("link", { name: /Arteta on injuries/ });
      expect(link).toHaveAttribute("href", headline.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(screen.getByText("He speaks.")).toBeInTheDocument();
      const attribution = screen.getByRole("link", { name: "BBC Sport" });
      expect(attribution).toHaveAttribute("href", credit);
    });
    it("handles an empty headline list kindly", () => {
      render(<ClubView model={base({ headlines: { status: "ok", items: { items: [], creditUrl: credit } } })} />);
      expect(screen.getByText(/Nothing new from BBC Sport/)).toBeInTheDocument();
    });
  });

  it("has no accessibility violations with everything on", async () => {
    const full = base({
      news: [{ severity: "out", player: player(1, "Rice", { news: "Hamstring", chance: 0, newsAdded: "2026-10-01T10:00:00Z" }) }],
      lineup: { formation: "4-3-3", matches: 6, missing: 0, fit: 14, open: { defenders: 0, midfielders: 0, forwards: 0 }, goalkeeper: predicted("Raya"), defenders: [predicted("Saliba")], midfielders: [predicted("Rice")], forwards: [predicted("Saka")] },
      europe: { status: "ok", items: [{ id: 1, competition: "UEFA Champions League", utcDate: null, home: "A", away: "B", clubIsHome: true, status: "SCHEDULED" }] },
      headlines: { status: "ok", items: { items: [{ title: "T", url: "https://www.bbc.com/x", summary: null, publishedAt: null }], creditUrl: "https://www.bbc.co.uk/sport" } },
    });
    const { container } = render(<ClubView model={full} />);
    await expectNoAxeViolations(container);
  });
});
