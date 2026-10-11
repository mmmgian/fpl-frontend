import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixtureBonusCard } from "@/components/views/FixtureBonusCard";
import { StandingsTable } from "@/components/views/StandingsTable";
import { TeamSheetView } from "@/components/views/TeamSheetView";
import { buildTeamSheet } from "@/lib/domain";
import { expectNoAxeViolations } from "./axe";
import { bootstrap, fixture, live, picks, standing } from "./fixtures";
import { cardFor } from "./support";

describe("StandingsTable", () => {
  const rows = [
    standing(),
    standing({ entry: 2, entry_name: "Gaucho F.C.", player_name: "gian jaen", rank: 2, last_rank: 1, total: 427 }),
    standing({ entry: 3, entry_name: "A very long team name that should wrap nicely on phones", rank: 3, last_rank: 0, total: 1200 }),
  ];

  it("links teams, shows manager and movement, and passes axe", async () => {
    const { container } = render(<StandingsTable rows={rows} caption="Lobster standings" highlightEntry={2} />);
    const table = screen.getByRole("table", { name: "Lobster standings" });
    expect(within(table).getByRole("link", { name: "Gaucho F.C." })).toHaveAttribute("href", "/team/2");
    expect(within(table).getByText("gian jaen")).toBeInTheDocument();
    expect(within(table).getByText("up 2 places")).toBeInTheDocument();
    expect(within(table).getByText("down 1 place")).toBeInTheDocument();
    expect(within(table).getByText("new entry")).toBeInTheDocument();
    expect(within(table).getByText("1,200")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Gaucho F.C." }).closest("tr")).toHaveAttribute("aria-current", "true");
    await expectNoAxeViolations(container);
  });

  it("can render frozen snapshots without links", () => {
    render(<StandingsTable rows={rows} caption="Old" linkTeams={false} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("handles an empty league", () => {
    render(<StandingsTable rows={[]} caption="Empty" />);
    expect(screen.getByText("No managers in this league yet.")).toBeInTheDocument();
  });
});

describe("TeamSheetView", () => {
  const sheet = buildTeamSheet(picks, bootstrap, live);

  it("renders XI by position plus bench, with captain multiplier explained", async () => {
    const { container } = render(<TeamSheetView sheet={sheet} showPoints />);
    expect(screen.getByRole("heading", { level: 2, name: "Starting XI" })).toBeInTheDocument();
    for (const name of ["Goalkeepers", "Defenders", "Midfielders", "Forwards"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    const forwards = screen.getByRole("table", { name: "Forwards" });
    const haaland = within(forwards).getByRole("rowheader", { name: /Haaland/ }).closest("tr")!;
    expect(within(haaland).getByText("Captain")).toBeInTheDocument();
    expect(haaland).toHaveTextContent("18");
    expect(within(haaland).getByText("(9 × 2)")).toBeInTheDocument();

    const bench = screen.getByRole("table", { name: "Bench, in substitution order" });
    expect(within(bench).getByText("Bench 1, goalkeeper")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("hides the points column without live data", () => {
    render(<TeamSheetView sheet={buildTeamSheet(picks, bootstrap, null)} showPoints={false} />);
    expect(screen.queryAllByRole("columnheader", { name: "Pts" })).toHaveLength(0);
  });
});

describe("FixtureBonusCard", () => {
  it("live match: shows minute, projected bonus and BPS for each side", async () => {
    const { container } = render(<FixtureBonusCard card={await cardFor(fixture())} />);
    expect(screen.getByText("Live 63′")).toBeInTheDocument();
    expect(screen.getByText("Projected")).toBeInTheDocument();
    expect(screen.getByText("Arsenal 2, Man City 1")).toHaveClass("sr-only");
    const items = (club: string) => within(screen.getByRole("list", { name: `Bonus points, ${club}` })).getAllByRole("listitem").map((li) => li.textContent);
    expect(items("Arsenal")).toEqual(["+33 bonus points:Saka3535 BPS", "+11 bonus point:Saliba2828 BPS"]);
    // a player just outside the bonus still shows, with a dash instead of points
    expect(items("Man City")).toEqual(["+33 bonus points:Haaland3535 BPS", "–No bonus:Gvardiol2020 BPS"]);
    await expectNoAxeViolations(container);
  });

  it("lists goals, assists and red cards when there are any", async () => {
    const f = fixture({
      stats: [
        { identifier: "goals_scored", h: [{ element: 3, value: 2 }], a: [{ element: 4, value: 1 }] },
        { identifier: "assists", h: [{ element: 2, value: 1 }], a: [] },
        { identifier: "red_cards", h: [], a: [{ element: 6, value: 1 }] },
        { identifier: "bps", h: [{ element: 3, value: 35 }], a: [{ element: 4, value: 30 }] },
      ],
    });
    render(<FixtureBonusCard card={await cardFor(f)} />);
    expect(screen.getByText("Goals").nextElementSibling).toHaveTextContent("Saka ×2, Haaland");
    expect(screen.getByText("Assists").nextElementSibling).toHaveTextContent("Saliba");
    expect(screen.getByText("Red cards").nextElementSibling).toHaveTextContent("Gvardiol");
  });

  it("upcoming match: shows kick-off, no bonus list", async () => {
    const f = fixture({ started: false, minutes: 0, team_h_score: null, team_a_score: null, stats: [] });
    const { container } = render(<FixtureBonusCard card={await cardFor(f)} />);
    expect(screen.getByText(/Kick-off/)).toBeInTheDocument();
    expect(screen.getByText("Arsenal versus Man City")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("postponed match without kick-off time shows TBC", async () => {
    const f = fixture({ started: false, kickoff_time: null, team_h_score: null, team_a_score: null, stats: [] });
    render(<FixtureBonusCard card={await cardFor(f)} />);
    expect(screen.getByText("TBC")).toBeInTheDocument();
  });

  it("finished match: confirmed bonus", async () => {
    const f = fixture({
      finished: true,
      finished_provisional: true,
      stats: [{ identifier: "bonus", h: [{ element: 3, value: 3 }], a: [] }],
    });
    render(<FixtureBonusCard card={await cardFor(f)} />);
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("unknown teams/players degrade gracefully", async () => {
    const card = await cardFor(fixture({ team_h: 99, team_a: 98 }), { ...bootstrap, teams: [], elements: [] });
    render(<FixtureBonusCard card={card} />);
    expect(screen.getAllByText("HOM").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Player \d+$/).length).toBeGreaterThan(0);
  });
});
