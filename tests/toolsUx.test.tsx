import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { ToolsView } from "@/components/views/ToolsView";
import { MESSAGES } from "@/lib/domain/i18n";
import { createToolsService } from "@/lib/services/tools";
import type { ToolsModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";
import { fakeFpl } from "./support";
import * as planningWorld from "./planningWorld";
import { NOW, bootstrap, league, picksFor, schedule } from "./toolsWorld";

type Ok = Extract<ToolsModel, { kind: "ok" }>;
const en = MESSAGES.en.tools;

const model = async (query = {}): Promise<Ok> => {
  const m = await createToolsService(fakeFpl({ bootstrap: async () => bootstrap, standings: async () => league(12), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e) }), { now: () => NOW }).load(1, query);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};
/** A world with the planning tools filled in (captain shortlist, swings, pairs, set pieces). */
const planned = async (): Promise<Ok> => {
  const w = planningWorld;
  const picks = (e: number) => ({
    active_chip: null,
    entry_history: { event: 6, points: 0, total_points: 0, rank: null, overall_rank: null, bank: 0, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0 },
    picks: [10, 11, 12].map((element, i) => ({ element, position: i + 1, multiplier: i === 0 ? 2 : 1, is_captain: i === 0, is_vice_captain: i === 1 })),
    entry: e,
  });
  const m = await createToolsService(fakeFpl({ bootstrap: async () => w.bootstrap(), standings: async () => w.league(6) as never, allFixtures: async () => w.schedule, picks: async (e: number) => picks(e) as never }), { now: () => w.NOW }).load(1, {});
  if (m.kind !== "ok" || !m.planning?.captain || !m.xi) throw new Error("expected the planning tools");
  return m;
};
const section = (c: HTMLElement, id: string) => c.querySelector(`#${id}`) as HTMLElement;
/** True when one of a catalog's sentence variants, filled with `args`, is what `el` says. */
const saysOneOf = <A extends unknown[]>(el: Element | null, variants: readonly ((...a: A) => string)[], ...args: A) => variants.some((v) => el?.textContent?.includes(v(...args)));

afterEach(() => setRequestTrip(false));

describe("the Tools page, grouped the way a manager works", () => {
  it("has three labelled groups, in order, on the page and in the jump bar", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const labels = [en.groups.deadline, en.groups.transfers, en.groups.league];
    const dividers = [...container.querySelectorAll("p")].filter((p) => labels.includes(p.textContent ?? "")).map((p) => p.textContent);
    expect(dividers).toEqual(labels);
    const nav = screen.getByRole("navigation", { name: "Tools" });
    const lists = within(nav).getAllByRole("list");
    expect(lists.map((l) => l.getAttribute("aria-labelledby")).map((id) => nav.querySelector(`#${id}`)?.textContent)).toEqual(labels);
    // each group's links point inside that group's part of the page
    expect(within(lists[0]).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#injury-watch", "#xi"]);
    expect(within(lists[1]).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#prices"]);
    expect(within(lists[2]).getAllByRole("link").map((a) => a.getAttribute("href"))[0]).toBe("#eo");
  });

  it("puts the trip lab's trackers under their own anchors in the transfers group", async () => {
    setRequestTrip(true);
    const { container } = render(<ToolsView model={await model()} />);
    for (const id of ["penalties", "suspensions", "defcon"]) expect(section(container, "trackers").querySelector(`#${id}`), id).not.toBeNull();
    const ids = [...container.querySelectorAll("section[id]")].map((s) => s.id);
    expect(ids.indexOf("captain")).toBeLessThan(ids.indexOf("xi"));
    expect(ids.indexOf("upside")).toBeGreaterThan(ids.indexOf("xi"));
    expect(ids.indexOf("trackers")).toBeLessThan(ids.indexOf("eo"));
  });

  it("is accessible", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    await expectNoAxeViolations(container);
  });
});

describe("the projected XI", () => {
  it("is badged as a projection and explains when the simulation's safest captain is someone else", async () => {
    const m = await planned();
    const xiCaptain = m.xi!.best.lines.flatMap((l) => l.players).find((p) => p.captain)!;
    const safest = m.planning!.captain!.safest;
    const other = { ...safest[0], id: -1, name: "Someone Else" };
    const { container } = render(<ToolsView model={{ ...m, planning: { ...m.planning!, captain: { ...m.planning!.captain!, safest: [other, ...safest.slice(1)] } } }} />);
    const xi = section(container, "xi");
    expect(within(xi).getByText(en.xi.badge)).toBeInTheDocument();
    expect(xi).toHaveTextContent(en.xi.captainDiffers(xiCaptain.name, "Someone Else"));
  });

  it("says nothing extra when both agree", async () => {
    const m = await planned();
    const xiCaptain = m.xi!.best.lines.flatMap((l) => l.players).find((p) => p.captain)!;
    const safest = m.planning!.captain!.safest;
    const same = { ...safest[0], id: xiCaptain.id, name: xiCaptain.name };
    const { container } = render(<ToolsView model={{ ...m, planning: { ...m.planning!, captain: { ...m.planning!.captain!, safest: [same, ...safest.slice(1)] } } }} />);
    expect(section(container, "xi").textContent).not.toContain("Why not");
  });
});

describe("the league's picks are labelled with their gameweek", () => {
  it("says the effective ownership comes from an earlier gameweek's picks when the next deadline hasn't passed", async () => {
    const m = await model();
    const next = m.eo!.gw + 1;
    const { container } = render(<ToolsView model={{ ...m, phase: { ...m.phase, next } }} />);
    expect(section(container, "eo")).toHaveTextContent(en.leagueTools.picksFrom(`Gameweek ${m.eo!.gw}`, `Gameweek ${next}`));
  });

  it("says nothing when the picks are for the next deadline already", async () => {
    const m = await model();
    const { container } = render(<ToolsView model={{ ...m, phase: { ...m.phase, next: m.eo!.gw } }} />);
    expect(section(container, "eo").textContent).not.toContain("appear after its deadline");
  });
});

describe("price filters", () => {
  it("submit back to the prices section, and reset clears only the price filters", async () => {
    const { container } = render(<ToolsView model={await model({ q: "player", pos: "2", eo: "top10", by: "captain" })} />);
    const prices = section(container, "prices");
    expect(prices.querySelector("form")).toHaveAttribute("action", "/tools#prices");
    expect(within(prices).getByRole("link", { name: en.prices.reset })).toHaveAttribute("href", "/tools?eo=top10&by=captain#prices");
  });

  it("the 'my team' form lives with the team sheets", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    expect(section(container, "prices").querySelector('form[action="/team"]')).toBeNull();
    expect(section(container, "teams").querySelector('form[action="/team"]')).not.toBeNull();
  });
});

describe("the week brief follows the match clock", () => {
  const live = async (matches: Ok["matches"]) => {
    const m = await model();
    return { ...m, phase: { ...m.phase, phase: "live" as const, gw: 7, next: 8, average: null }, matches };
  };

  it("between matches, says the gameweek is paused and when play resumes, in the reader's time", async () => {
    const at = "2026-10-18T14:00:00.000Z";
    const { container } = render(<ToolsView model={await live({ state: "between", nextKickoff: at })} />);
    const brief = section(container, "brief");
    expect(brief.querySelector(`time[datetime="${at}"]`)).not.toBeNull();
    const lead = brief.querySelector("p")!;
    const time = lead.querySelector("time")!.textContent!;
    expect(saysOneOf(lead, en.brief.paused, "Gameweek 7", time, "Gameweek 8")).toBe(true);
  });

  it("once the day's last match is over, says the points await FPL's sign-off", async () => {
    const { container } = render(<ToolsView model={await live({ state: "over", nextKickoff: null })} />);
    expect(saysOneOf(section(container, "brief").querySelector("p"), en.brief.provisional, "Gameweek 7", "Gameweek 8")).toBe(true);
  });

  it("while a match is on, says it is live", async () => {
    const { container } = render(<ToolsView model={await live({ state: "playing", nextKickoff: null })} />);
    expect(saysOneOf(section(container, "brief").querySelector("p"), en.brief.live, "Gameweek 7", "Gameweek 8")).toBe(true);
  });
});

describe("phone second lines", () => {
  it("the captain shortlist names each opponent under the player, for when the fixture column hides", async () => {
    const { container } = render(<ToolsView model={await planned()} />);
    const shortlist = section(container, "shortlist");
    const header = within(shortlist).getAllByRole("rowheader")[0];
    expect(header.textContent).toMatch(/\((H|A)\)/);
  });
});
