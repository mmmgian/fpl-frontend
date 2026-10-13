/**
 * The Tools page's planning tools (captain shortlist, fixture swings, rotation pairs, set pieces) and the page's
 * resilience to odd FPL data: pre-season, season over, blanks and doubles, missing or malformed responses, junk queries.
 */
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { ToolsView } from "@/components/views/ToolsView";
import { CaptainShortlist } from "@/components/views/tools/CaptainShortlist";
import { FixtureSwings, RotationPairs } from "@/components/views/tools/FixtureSwings";
import { SetPieces } from "@/components/views/tools/SetPieces";
import type { Bootstrap, EntryPicks, ScheduledFixture } from "@/lib/domain/types";
import type { FplPort } from "@/lib/services/ports";
import { createToolsService, type ToolsQuery } from "@/lib/services/tools";
import { expectNoAxeViolations } from "./axe";
import { englishLeaks } from "./i18nLeaks";
import { NOW, bootstrap, events, league, schedule } from "./planningWorld";
import { fakeFpl } from "./support";

const picks = (entry: number, elements = [10, 11, 12]): EntryPicks => ({
  active_chip: null,
  entry_history: { event: 6, points: 0, total_points: 0, rank: null, overall_rank: null, bank: 0, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0 },
  picks: elements.map((element, i) => ({ element, position: i + 1, multiplier: i === 0 ? 2 : 1, is_captain: i === 0, is_vice_captain: i === 1 })),
});

async function load(query: ToolsQuery = {}, over: Partial<FplPort> = {}, bs: () => Bootstrap = bootstrap) {
  const fpl = fakeFpl({ bootstrap: async () => bs(), standings: async () => league(6) as never, allFixtures: async () => schedule, picks: async (e: number) => picks(e), ...over });
  const m = await createToolsService(fpl, { now: () => NOW }).load(1, query);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
}

/** The jump links this file is about (the planning tools and the page's own), ignoring the league tools' links. */
const OURS = ["#upside", "#captain", "#shortlist", "#xi", "#swings", "#pairs", "#prices", "#eo", "#setpieces", "#teams"];
const links = (name: string) => within(screen.getByRole("navigation", { name })).getAllByRole("link").map((a) => a.getAttribute("href")).filter((h) => OURS.includes(h ?? ""));
const nav = () => links("Tools");
const section = (c: HTMLElement, id: string) => c.querySelector(`#${id}`) as HTMLElement | null;

async function trip<T>(work: () => Promise<T>): Promise<T> {
  const { setRequestTrip } = await import("@/components/ui/tripSlot");
  setRequestTrip(true);
  try {
    return await work();
  } finally {
    setRequestTrip(false);
  }
}

describe("the planning tools", () => {
  it("each has a place on the page and in the jump links, in planning order", async () => {
    render(<ToolsView model={await load()} />);
    expect(nav()).toEqual(["#shortlist", "#xi", "#swings", "#pairs", "#prices", "#eo", "#setpieces", "#teams"]);
    for (const name of ["Captain shortlist · Gameweek 7", "Fixture swings", "Rotation pairs", "Set pieces"]) expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  });

  it("captain shortlist: three questions, simulated figures labelled as a simulation, FPL ownership apart", async () => {
    const { container } = render(<ToolsView model={await load()} />);
    const s = section(container, "shortlist")!;
    expect(within(s).getByText("Simulation")).toBeInTheDocument();
    for (const name of ["Safest: highest expected points", "Haul chance: 10+ points", "Triple Captain punt: 15+ points"]) expect(within(s).getByRole("heading", { level: 3, name })).toBeInTheDocument();
    expect(s).toHaveTextContent(/A simulation, not a prediction: 1,500 runs per player/);
    expect(within(s).getAllByRole("columnheader", { name: "FPL owned" }).length).toBe(3);
    expect(s.textContent).not.toMatch(/NaN|undefined/);
  });

  it("captain shortlist names blank and double clubs for the gameweek, and leaves blank clubs' players out", async () => {
    const sched: ScheduledFixture[] = [...schedule.filter((f) => !(f.event === 7 && f.team_h === 5)), { ...schedule[0], id: 900, team_h: 3, team_a: 1 }];
    const m = await load({}, { allFixtures: async () => sched });
    const { container } = render(<ToolsView model={m} />);
    const s = section(container, "shortlist")!;
    expect(s).toHaveTextContent("2 clubs have no fixture in Gameweek 7 (C5, C6), so their players are left out.");
    expect(s).toHaveTextContent("2 clubs play twice in Gameweek 7 (C1, C3)");
    expect(s.textContent).not.toMatch(/\bP5\d\b|\bP6\d\b/);
  });

  it("fixture swings: green and red turns, a blank shown as a blank, a double as two matches", async () => {
    const m = await load();
    const { container } = render(<ToolsView model={m} />);
    const s = section(container, "swings")!;
    expect(within(s).getByRole("heading", { level: 3, name: "Turning green: fixtures ease" })).toBeInTheDocument();
    expect(within(s).getByRole("heading", { level: 3, name: "Turning red: fixtures get harder" })).toBeInTheDocument();
    expect(s).toHaveTextContent("GW7–GW8 against GW9–GW11");
    const c1 = within(s).getByRole("rowheader", { name: /C1/ }).closest("tr")!;
    expect(c1).toHaveTextContent("+3.0");             // C1: 2.0 soon, 5.0 later
    const c2 = within(s).getByRole("rowheader", { name: /C2/ }).closest("tr")!;
    expect(c2).toHaveTextContent("\u22122.0");        // C2: easier, with a proper minus sign
    expect(m.planning!.swings!.easing.concat(m.planning!.swings!.hardening).every((r) => r.blanks.every((gw) => r.cells.find((c) => c.gw === gw)!.matches.length === 0))).toBe(true);
  });

  it("rotation pairs: never starts a club that doesn't play, and says when neither does", () => {
    const rotation = { gws: [10, 11], pairs: [{ clubs: ["C3", "C4"] as [string, string], average: 4, blanks: 1, weeks: [{ gw: 10, club: null, difficulty: null, matches: 0 }, { gw: 11, club: "C3", difficulty: 3, matches: 2 }] }] };
    const { container } = render(<RotationPairs rotation={rotation} variety={1} />);
    expect(container).toHaveTextContent("Neither plays");
    expect(container).toHaveTextContent("GW11 C3");
    expect(container).toHaveTextContent("Double");
  });

  it("set pieces: FPL's order, first choice first, with doubts and absences flagged", async () => {
    const { container } = render(<ToolsView model={await load()} />);
    const s = section(container, "setpieces")!;
    const c1 = within(s).getByRole("rowheader", { name: /C1/ }).closest("tr")!;
    expect(c1.textContent).toMatch(/1\.P12.*2\.P11Doubt \(50%\)/);
    const c2 = within(s).getByRole("rowheader", { name: /C2/ }).closest("tr")!;
    expect(c2).toHaveTextContent("1.P22Out");
    expect(c2).toHaveTextContent("None listed");     // nobody on direct free kicks at C2
    expect(s).toHaveTextContent(/FPL keeps these notes by hand/);
  });

  it("wording comes in three variants, picked by the visit's salt; the figures stay put", () => {
    const shortlist = { gw: 7, trials: 1500, safest: [], haul: [], punt: [], blanks: [], doubles: [] };
    const swings = { gws: [7, 8, 9], soonGws: [7, 8], laterGws: [9], easing: [], hardening: [] };
    const notes = new Set<string>();
    const nones = new Set<string>();
    for (let v = 0; v < 60; v++) {
      notes.add(render(<FixtureSwings swings={swings} variety={v} />).container.querySelector("p")!.textContent!);
      nones.add(render(<CaptainShortlist captain={shortlist} variety={v} />).container.querySelector("td")?.textContent ?? "");
    }
    expect(notes.size).toBe(3);
    expect(nones.size).toBe(3);
  });

  it("set pieces with no taker data simply don't appear", async () => {
    const bs = () => {
      const b = bootstrap();
      for (const e of b.elements) for (const k of ["penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order"] as const) delete e[k];
      return b;
    };
    const m = await load({}, {}, bs);
    expect(m.planning?.setPieces).toBeNull();
    render(<ToolsView model={m} />);
    expect(nav()).not.toContain("#setpieces");
  });

  it("set-piece names wrap rather than overflow, however long", () => {
    const long = "Wolfeschlegelsteinhausenbergerdorff-Alexander-Arnold";
    const rows = [{ teamId: 1, club: "C1", clubName: "Club 1", clubCode: 10, penalties: [{ id: 1, name: long, order: 1, fitness: "fit" as const, chance: null }], freeKicks: [], corners: [] }];
    const { container } = render(<SetPieces rows={rows} variety={0} />);
    expect(container).toHaveTextContent(long);
  });

  it("is accessible", async () => {
    const { container } = render(<ToolsView model={await load()} />);
    await expectNoAxeViolations(container);
  });
});

describe("the planning tools in the altered view", () => {
  it("keeps the lab's own captain and rotation tools, and adds the swings and set pieces in its own voice", async () => {
    await trip(async () => {
      render(<ToolsView model={await load()} />);
      expect(links("The Lab")).toEqual(["#upside", "#captain", "#xi", "#swings", "#prices", "#eo", "#setpieces", "#teams"]);
      expect(screen.getByRole("heading", { level: 2, name: "Tides turning" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Keepers of the dead ball" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /Captain shortlist/ })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Rotation pairs" })).toBeNull();
    });
  });

  it("is accessible", async () => {
    await trip(async () => {
      const { container } = render(<ToolsView model={await load()} />);
      await expectNoAxeViolations(container);
    });
  });
});

describe("the planning tools in other languages", () => {
  const html = async (locale: "en" | "es" | "fr") => {
    const { setRequestLocale } = await import("@/components/ui/i18n");
    setRequestLocale(locale);
    const m = await load();
    return renderToStaticMarkup(<I18nProvider locale={locale}><ToolsView model={m} /></I18nProvider>);
  };
  const allow = [/^P\d+$/, /^C\d$/, /^Team \d+/, /^Manager \d+/, /^Club \d$/, "DefCon", "xP", "FDR", "Triple", "Club"];

  it.each(["es", "fr"] as const)("is in %s all the way through", async (locale) => {
    const english = await html("en");
    const translated = await html(locale);
    expect(englishLeaks(english, translated, locale, { allow })).toEqual([]);
    expect(translated).toContain(locale === "es" ? "Giros de calendario" : "Bascules du calendrier");
    expect(translated).toContain(locale === "es" ? "Balón parado" : "Coups de pied arrêtés");
    expect(translated).toContain(locale === "es" ? "Duda (50\u00a0%)" : "Incertain (50\u00a0%)");
  });

  it.each(["es", "fr"] as const)("is in %s in the altered view too", async (locale) => {
    await trip(async () => {
      const english = await html("en");
      const translated = await html(locale);
      expect(englishLeaks(english, translated, locale, { allow: [...allow, "Tools", "Injured"] })).toEqual([]);
    });
  });
});

describe("the Tools page when the season or FPL is odd", () => {
  it("pre-season: nobody has minutes, nothing has been played, and the page still stands", async () => {
    const pre = () => {
      const b = bootstrap();
      for (const e of b.elements) Object.assign(e, { minutes: 0, starts: 0 });
      return { ...b, events: events.map((e) => ({ ...e, is_current: false, finished: false, data_checked: false })) };
    };
    const m = await load({}, {}, pre);
    expect(m.planning?.captain ?? null).toBeNull();
    expect(m.planning?.swings).not.toBeNull();
    const { container } = render(<ToolsView model={m} />);
    expect(section(container, "shortlist")).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it("season over: nothing ahead, the forward-looking tools step aside", async () => {
    const over = () => ({ ...bootstrap(), events: events.map((e) => ({ ...e, is_current: e.id === 11, is_next: false, finished: true, data_checked: true, deadline_time: "2026-05-01T10:00:00Z" })) });
    const m = await load({}, {}, over);
    expect(m.xi).toBeNull();
    expect(m.planning).toMatchObject({ captain: null, swings: null, rotation: null });
    expect(m.planning!.setPieces).not.toBeNull();
    render(<ToolsView model={m} />);
    expect(nav()).toEqual(["#prices", "#eo", "#setpieces", "#teams"]);
  });

  it("schedule unavailable: no fixture-based tools, the rest stay", async () => {
    const m = await load({}, { allFixtures: async () => Promise.reject(new Error("down")) });
    expect(m.planning).toMatchObject({ captain: null, swings: null, rotation: null });
    expect(m.prices.rows.length).toBeGreaterThan(0);
    render(<ToolsView model={m} />);
    expect(nav()).toEqual(["#xi", "#prices", "#eo", "#setpieces", "#teams"]);
  });

  it("schedule malformed (not a list, or fixtures without clubs): treated as missing, never as a crash", async () => {
    for (const bad of [{ oops: true }, null, [{ id: 1 }, null, "x"]]) {
      const m = await load({}, { allFixtures: async () => bad as never });
      expect(m.kind).toBe("ok");
      expect(m.planning?.swings ?? null).toBeNull();
    }
  });

  it("standings unavailable or malformed: no teams, no effective ownership, no crash", async () => {
    for (const standings of [async () => null, async () => Promise.reject(new Error("down")), async () => ({ league: { id: 1, name: "L" } }) as never, async () => ({ standings: { results: "nope" } }) as never]) {
      const m = await load({}, { standings });
      expect(m.teams).toEqual([]);
      expect(m.eo).toBeNull();
      render(<ToolsView model={m} />);
    }
  });

  it("an empty league: no teams and no effective ownership, and the page says nothing odd", async () => {
    const m = await load({}, { standings: async () => league(0) as never });
    expect(m.teams).toEqual([]);
    const { container } = render(<ToolsView model={m} />);
    expect(container.textContent).not.toMatch(/NaN|undefined|null/);
  });

  it("picks failing or malformed for some managers: effective ownership from the rest", async () => {
    const m = await load({ eo: "all" }, {
      picks: async (e: number) => {
        if (e === 100) throw new Error("down");
        if (e === 101) return null;
        if (e === 102) return { active_chip: null } as never;           // no picks list at all
        if (e === 103) return { picks: [{ element: "x" }, null] } as never; // nothing usable in it
        return picks(e, [10, 11, 12, 4242]);                               // 4242 is no player FPL knows
      },
    });
    expect(m.eo).not.toBeNull();
    expect(m.eo!.rows.map((r) => r.id)).not.toContain(4242);
    expect(m.eo!.rows.every((r) => Number.isFinite(r.eo))).toBe(true);
  });

  it("null and NaN fields in the game data don't leak onto the page", async () => {
    const odd = () => {
      const b = bootstrap();
      const raw = b.elements as unknown as Record<string, unknown>[];
      raw[0].web_name = null;                     // dropped: no name to show
      raw[1].now_cost = Number.NaN;
      raw[2].selected_by_percent = null;
      raw[3].minutes = "lots";
      raw[4].penalties_order = Number.NaN;
      raw.push({ id: 777, team: 99, element_type: 3, web_name: "Nowhere", now_cost: 50 }); // a club FPL doesn't list
      (b.events as unknown as Record<string, unknown>[])[1].name = null;
      (b.teams as unknown as Record<string, unknown>[])[5].short_name = null;
      return b;
    };
    const m = await load({ q: "p" }, {}, odd);
    const { container } = render(<ToolsView model={m} />);
    expect(container.textContent).not.toMatch(/NaN|undefined|null|£NaN/);
    expect(container).toHaveTextContent("Gameweek 7");
  });

  it("junk in the query falls back to the defaults", async () => {
    const m = await load({ q: ["a", "b"], pos: "abc", team: "999", moving: ["0", "1"], eo: "<script>", by: "everything" });
    expect(m.prices.filter).toEqual({ q: "a", position: null, team: null, movingOnly: false });
    expect(m.eo?.by ?? "eo").toBe("eo");
    render(<ToolsView model={m} />);
  });

  it("a long or unicode search is cut cleanly", async () => {
    const m = await load({ q: "😀".repeat(100) });
    expect(Array.from(m.prices.filter.q)).toHaveLength(40);
    expect(m.prices.filter.q).toBe("😀".repeat(40));
    expect((await load({ q: "Ødegaard" })).prices.filter.q).toBe("Ødegaard");
  });
});

describe("slim bootstrap keeps what the set-piece tool reads", () => {
  it("retains the free-kick and corner orders, and omits them when not set", async () => {
    const { slimBootstrap } = await import("@/lib/fpl");
    const b = bootstrap();
    const slim = slimBootstrap({ ...b, elements: [{ ...b.elements[2], direct_freekicks_order: 2, corners_and_indirect_freekicks_order: 1 }, { ...b.elements[0], direct_freekicks_order: null }] } as never);
    expect(slim.elements[0]).toMatchObject({ direct_freekicks_order: 2, corners_and_indirect_freekicks_order: 1 });
    expect(slim.elements[1]).not.toHaveProperty("direct_freekicks_order");
  });
});
