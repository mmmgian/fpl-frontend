import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixtureBonusCard } from "@/components/views/FixtureBonusCard";
import { StandingsTable } from "@/components/views/StandingsTable";
import { TeamSheetView } from "@/components/views/TeamSheetView";
import { buildTeamSheet } from "@/lib/domain";
import { SnapshotView } from "@/components/views/SnapshotView";
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
    expect(within(table).getByRole("link", { name: "Gaucho F.C." })).toHaveAttribute("href", "/team/gaucho-f-c");
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

describe("SnapshotView", () => {
  const rows = [
    standing({ entry: 1, entry_name: "Alpha", rank: 1, last_rank: 0, total: 60, rank_approximate: true }),
    standing({ entry: 2, entry_name: "Beta", rank: 2, last_rank: 0, total: 60, rank_approximate: true }),
    standing({ entry: 3, entry_name: "Gamma", rank: 3, last_rank: 0, total: 50 }),
  ];
  const base = { gw: 1, leagueName: "Test League", takenAt: "2026-10-11T12:00:00Z", rows };

  it("an ordinary snapshot says Saved and carries no rebuild note or approximation marks", async () => {
    const { container } = render(<SnapshotView gw={1} snapshot={{ ...base, rows: rows.map((r) => ({ ...r, rank_approximate: undefined })), rebuilt: null }} />);
    expect(screen.getByText("Saved", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Rebuilt after the gameweek")).toBeNull();
    expect(screen.queryByText("≈")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("a rebuilt table says so plainly, names who is level, and marks exactly those ranks", async () => {
    const { container } = render(<SnapshotView gw={1} snapshot={{ ...base, rebuilt: { builtAt: "2026-10-12T09:00:00Z", level: [{ total: 60, names: ["Alpha", "Beta"] }], movementApproximate: false } }} />);
    expect(screen.getByText("Rebuilt", { selector: "span" })).toBeInTheDocument();            // the header label, not "Saved"
    expect(screen.queryByText("Saved", { selector: "span" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Rebuilt after the gameweek" })).toBeInTheDocument();
    expect(screen.getByText(/wasn.t saved at the time/)).toBeInTheDocument();
    expect(screen.getByText(/Alpha and Beta \(60 pts\)/)).toBeInTheDocument();
    expect(screen.getAllByText("≈")).toHaveLength(2);                              // Alpha and Beta, not Gamma
    expect(screen.getAllByText("(approximate)")).toHaveLength(2);                  // and announced to screen readers
    await expectNoAxeViolations(container);
  });

  it("a rebuilt table with no unresolved ties makes no claim about approximation", () => {
    render(<SnapshotView gw={1} snapshot={{ ...base, rows: rows.map((r) => ({ ...r, rank_approximate: false })), rebuilt: { builtAt: "2026-10-12T09:00:00Z", level: [], movementApproximate: false } }} />);
    expect(screen.getByText("Rebuilt after the gameweek")).toBeInTheDocument();
    expect(screen.queryByText(/approximate/)).toBeNull();
  });

  it("marks a movement arrow whose earlier rank was a guess, separately from a tied rank, and explains it", async () => {
    const moved = [
      standing({ entry: 1, entry_name: "Alpha", rank: 1, last_rank: 2, total: 110, last_rank_approximate: true }),
      standing({ entry: 2, entry_name: "Beta", rank: 2, last_rank: 1, total: 100, last_rank_approximate: true }),
      standing({ entry: 3, entry_name: "Gamma", rank: 3, last_rank: 3, total: 90, last_rank_approximate: true }),      // "no change", but resting on a guess
    ];
    const { container } = render(<SnapshotView gw={2} snapshot={{ ...base, gw: 2, rows: moved, rebuilt: { builtAt: "2026-10-12T09:00:00Z", level: [], movementApproximate: true } }} />);
    expect(screen.queryByText("≈", { selector: "span" })).toBeNull();                       // no rank is approximate in this table...
    expect(screen.getAllByText(/^≈[▲▼]/)).toHaveLength(2);                                  // ...only the two arrows are
    expect(screen.getByText("about up 1 place")).toBeInTheDocument();
    expect(screen.getByText("≈–")).toBeInTheDocument();                                     // a dash that rests on a guess is marked too
    expect(screen.getByText("no change (approximate)")).toBeInTheDocument();
    expect(screen.getByText(/one of the two ranks it compares is approximate/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("still handles a missing snapshot", () => {
    render(<SnapshotView gw={9} snapshot={null} />);
    expect(screen.getByText("No snapshot for Gameweek 9")).toBeInTheDocument();
  });
});
