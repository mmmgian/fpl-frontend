import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamHeader } from "@/components/views/TeamHeader";
import type { TeamIdentity } from "@/lib/services/models";
import { createTeamService } from "@/lib/services/team";
import { fakeFpl } from "./support";
import { expectNoAxeViolations } from "./axe";

const team = (over: Partial<TeamIdentity> = {}): TeamIdentity => ({ entryId: 7, teamName: "Gaucho F.C.", firstName: "gian", lastName: "jaen", manager: "gian jaen", avatar: "/avatars/7.webp", mascot: null, ...over });

describe("TeamHeader", () => {
  it("names the team as the page's one h1, with the manager beside a Manager tag", () => {
    render(<TeamHeader team={team()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Gaucho F.C." })).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("gian jaen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /League table/ })).toHaveAttribute("href", "/");
  });

  it("shows the manager's avatar", () => {
    const { container } = render(<TeamHeader team={team()} />);
    expect(container.querySelector('img[src="/avatars/7.webp"]')).not.toBeNull();
  });

  it("falls back to the team's initials when there is no avatar", () => {
    const { container } = render(<TeamHeader team={team({ avatar: null })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("GF")).toBeInTheDocument();
  });

  it("lays the facts out as label and value pairs, and omits the row when there are none", () => {
    const { unmount } = render(<TeamHeader team={team()} facts={[{ label: "Gameweek", value: "Gameweek 6" }, { label: "Experience", value: "Playing since 2019" }]} />);
    const facts = screen.getAllByRole("term").map((t) => t.textContent);
    expect(facts).toEqual(["Gameweek", "Experience"]);
    expect(within(screen.getByText("Experience").closest("div")!).getByText("Playing since 2019")).toBeInTheDocument();
    unmount();
    render(<TeamHeader team={team()} />);
    expect(screen.queryAllByRole("term")).toHaveLength(0);
  });

  it("puts the actions (pager, refresh) beside the name", () => {
    render(<TeamHeader team={team()} actions={<button>Next week</button>} />);
    expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<TeamHeader team={team()} facts={[{ label: "Gameweek", value: "Gameweek 6" }]} actions={<a href="/x">GW5</a>} />);
    await expectNoAxeViolations(container);
  });
});

describe("a team's identity", () => {
  const entry = { id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6 } as never;
  const withEntry = (avatars?: { src(entry: number): string | null }) => createTeamService(fakeFpl({ entry: async () => entry }), { avatars }).identify(7);

  it("carries the manager's drawn avatar when there is one", async () => {
    expect((await withEntry({ src: (e) => (e === 7 ? "/avatars/7.webp" : null) }))?.avatar).toBe("/avatars/7.webp");
  });
  it("has none when nobody drew one, or when there is no avatar source at all", async () => {
    expect((await withEntry({ src: () => null }))?.avatar).toBeNull();
    expect((await withEntry())?.avatar).toBeNull();
  });
});
