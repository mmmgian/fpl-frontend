import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixtureBonusCard } from "@/components/views/FixtureBonusCard";
import { StandingsTable } from "@/components/views/StandingsTable";
import { TeamSheetView } from "@/components/views/TeamSheetView";
import { buildTeamSheet } from "@/lib/fpl/derive";
import { expectNoAxeViolations } from "./axe";
import { bootstrap, fixture, live, picks, standing } from "./fixtures";

const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
const players = new Map(bootstrap.elements.map((p) => [p.id, p]));

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
  it("live match: shows minute, projected bonus and BPS", async () => {
    const { container } = render(<FixtureBonusCard fixture={fixture()} teams={teams} players={players} />);
    expect(screen.getByText("Live 63′")).toBeInTheDocument();
    expect(screen.getByText("Arsenal 2, Man City 1")).toHaveClass("sr-only");
    const list = screen.getByRole("list", { name: "Bonus points, Arsenal v Man City" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "+33 bonus points:SakaARS35 BPS",
      "+33 bonus points:HaalandMCI35 BPS",
      "+11 bonus point:SalibaARS28 BPS",
    ]);
    expect(screen.getByText("Projected")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("upcoming match: shows kick-off, no bonus list", async () => {
    const f = fixture({ started: false, minutes: 0, team_h_score: null, team_a_score: null, stats: [] });
    const { container } = render(<FixtureBonusCard fixture={f} teams={teams} players={players} />);
    expect(screen.getByText(/Kick-off/)).toBeInTheDocument();
    expect(screen.getByText("Arsenal versus Man City")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("postponed match without kick-off time shows TBC", () => {
    const f = fixture({ started: false, kickoff_time: null, team_h_score: null, team_a_score: null, stats: [] });
    render(<FixtureBonusCard fixture={f} teams={teams} players={players} />);
    expect(screen.getByText("TBC")).toBeInTheDocument();
  });

  it("finished match: confirmed bonus", () => {
    const f = fixture({
      finished: true,
      finished_provisional: true,
      stats: [{ identifier: "bonus", h: [{ element: 3, value: 3 }], a: [] }],
    });
    render(<FixtureBonusCard fixture={f} teams={teams} players={players} />);
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("unknown teams/players degrade gracefully", () => {
    render(<FixtureBonusCard fixture={fixture({ team_h: 99, team_a: 98 })} teams={new Map()} players={new Map()} />);
    expect(screen.getByText("HOM")).toBeInTheDocument();
    expect(screen.getAllByText(/^Player \d+$/).length).toBeGreaterThan(0);
  });
});
