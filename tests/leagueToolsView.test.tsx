import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { ToolsView } from "@/components/views/ToolsView";
import type { Bootstrap, BootstrapChip, EntryHistory, EntryPicks } from "@/lib/domain/types";
import { createToolsService } from "@/lib/services/tools";
import { expectNoAxeViolations } from "./axe";
import { englishLeaks } from "./i18nLeaks";
import { testLanguage } from "./language";
import { fakeFpl } from "./support";
import { NOW, bootstrap as world, league, picksFor, schedule } from "./toolsWorld";

const WINDOWS: BootstrapChip[] = ["wildcard", "freehit", "bboost", "3xc"].flatMap((name) => [
  { name, start_event: 1, stop_event: 19 },
  { name, start_event: 20, stop_event: 38 },
]);

/** Manager 100 owns the injured 99 and played a Wildcard in GW2; 103's history fails; 101 owns a unique midfielder. */
const squadOf = (e: number): EntryPicks => {
  const base = picksFor(e);
  if (e === 100) return { ...base, picks: [...base.picks, { element: 99, position: 4, multiplier: 1, is_captain: false, is_vice_captain: false }] };
  if (e === 101) return { ...base, active_chip: "bboost", picks: [...base.picks, { element: 10, position: 5, multiplier: 1, is_captain: false, is_vice_captain: false }] };
  return base;
};
const historyOf = async (e: number): Promise<EntryHistory | null> => {
  if (e === 103) throw new Error("down");
  return { current: [], past: [], chips: e === 100 ? [{ name: "wildcard", event: 2 }] : [] };
};

async function model(query: Record<string, string> = {}, { windows = true, managers = 6 } = {}) {
  const bs: Bootstrap = windows ? { ...world, chips: WINDOWS } : world;
  const m = await createToolsService(fakeFpl({ bootstrap: async () => bs, standings: async () => league(managers), allFixtures: async () => schedule, picks: async (e: number) => squadOf(e), history: historyOf }), { now: () => NOW }).load(1, query);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
}
const section = (c: HTMLElement, id: string) => c.querySelector(`#${id}`) as HTMLElement;

afterEach(async () => {
  const { setRequestTrip } = await import("@/components/ui/tripSlot");
  setRequestTrip(false);
  testLanguage.cookie = undefined;
});

describe("the league tools on the Tools page", () => {
  it("adds a jump link to each: injuries first (they matter before the deadline), the rest with the league before the teams", async () => {
    render(<ToolsView model={await model()} />);
    const hrefs = within(screen.getByRole("navigation", { name: "Tools" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs[0]).toBe("#injury-watch");
    expect(hrefs.slice(-6)).toEqual(["#eo", "#chip-tracker", "#template", "#differentials", "#head-to-head", "#teams"]);
  });

  it("tracks chips against FPL's windows, names every chip for screen readers, and marks a failed history unavailable", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const chips = section(container, "chip-tracker");
    expect(within(chips).getByRole("heading", { level: 2, name: "Chip tracker" })).toBeInTheDocument();
    const table = within(chips).getByRole("table");
    for (const name of ["Wildcard", "Free Hit", "Bench Boost", "Triple Captain"]) expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    const row = (team: string) => within(table).getByRole("rowheader", { name: new RegExp(team) }).closest("tr") as HTMLElement;
    expect(row("Team 1")).toHaveTextContent(/GW2/);           // the Wildcard played in GW2
    expect(row("Team 1")).toHaveTextContent("7");             // 7 chip plays left
    expect(row("Team 4")).toHaveTextContent(/Unavailable/);   // history failed: unknown, not chipless
    expect(within(chips).getByRole("link", { name: "Team 1" })).toHaveAttribute("href", "/team/team-1");
    expect(chips).toHaveTextContent("4 of 5");                // 4 of the 5 known managers hold a Wildcard
    // the column heads are codes; a visible legend spells each one out
    const legend = within(chips).getByRole("list", { name: "Chip codes" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["WCWildcard", "FHFree Hit", "BBBench Boost", "TCTriple Captain"]);
  });

  it("without FPL's chip windows shows only chips played and says why", async () => {
    const { container } = render(<ToolsView model={await model({}, { windows: false })} />);
    const chips = section(container, "chip-tracker");
    expect(within(chips).queryByRole("columnheader", { name: "Wildcard" })).toBeNull();
    expect(within(chips).queryByRole("columnheader", { name: "Still to play" })).toBeNull();
    expect(chips.textContent).toMatch(/chip windows/i);
  });

  it("lists flagged players the league owns with FPL's status, and who starts them", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const inj = section(container, "injury-watch");
    const row = within(inj).getByRole("rowheader", { name: /Injured/ }).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("Injured");
    expect(within(inj).getAllByRole("row")).toHaveLength(2); // header + the one flagged player
  });

  it("shows the template eleven and each team's differentials", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const tpl = section(container, "template");
    expect(tpl).toHaveTextContent("Player13");
    expect(within(tpl).getByRole("table")).toBeInTheDocument();
    const diffs = section(container, "differentials");
    const row = within(diffs).getByRole("rowheader", { name: /Team 2/ }).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("Player10");
  });

  it("has a head-to-head form that keeps the other tools' filters, and compares the two teams asked for", async () => {
    const { container } = render(<ToolsView model={await model({ q: "abc", eo: "all", vs: "100,101" })} />);
    const h2h = section(container, "head-to-head");
    const form = h2h.querySelector("form") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/tools#head-to-head");
    expect(form.method).toBe("get");
    expect(within(form).getByLabelText("Team")).toHaveValue("100");
    expect(within(form).getByLabelText("Rival")).toHaveValue("101");
    const hidden = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((i) => [i.name, i.value]));
    expect(hidden).toEqual({ q: "abc", eo: "all" });
    expect(within(h2h).getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/tools?q=abc&eo=all#head-to-head");
    expect(within(h2h).getByRole("region", { name: "Only Team 1" })).toHaveTextContent("Injured");
    expect(within(h2h).getByRole("region", { name: "Only Team 2" })).toHaveTextContent("Player10");
    expect(within(h2h).getByRole("region", { name: "Both own" })).toHaveTextContent("Player13");
    // the other tools' links keep the comparison
    expect(within(section(container, "eo")).getByRole("link", { name: "Top 4" }).getAttribute("href")).toContain("vs=100%2C101");
  });

  it("says so when ?vs isn't two teams it can compare", async () => {
    const { container } = render(<ToolsView model={await model({ vs: "100,999" })} />);
    expect(within(section(container, "head-to-head")).getByRole("status")).toBeInTheDocument();
  });

  it("says how much of the league it covers when only part of it was read", async () => {
    const m = await model();
    const partial = { ...m, leagueTools: { ...m.leagueTools!, total: 80 } };
    const { container } = render(<ToolsView model={partial} />);
    expect(section(container, "chip-tracker")).toHaveTextContent("top 6 of 80");
  });

  it("leaves out each tool its data can't fill", async () => {
    const m = await model();
    const { container } = render(<ToolsView model={{ ...m, leagueTools: { ...m.leagueTools!, chips: null, template: null, differentials: null, rivals: null } }} />);
    for (const id of ["chip-tracker", "template", "differentials", "head-to-head"]) expect(container.querySelector(`#${id}`)).toBeNull();
    expect(container.querySelector("#injury-watch")).not.toBeNull();
  });

  it("has no accessibility violations, with a comparison and an unavailable manager on show", async () => {
    const { container } = render(<ToolsView model={await model({ vs: "100,101" })} />);
    await expectNoAxeViolations(container);
  });
});

describe("the league tools in other languages and the altered view", () => {
  async function html(locale: "en" | "es" | "fr", query: Record<string, string> = {}): Promise<string> {
    testLanguage.cookie = locale;
    const { initLocale } = await import("@/app/locale");
    await initLocale();
    const el: ReactElement = (
      <I18nProvider locale={locale}>
        <ToolsView model={await model(query)} />
      </I18nProvider>
    );
    return renderToStaticMarkup(el);
  }

  it.each(["es", "fr"] as const)("is in %s all the way through", async (locale) => {
    const en = await html("en", { vs: "100,101" });
    const out = await html(locale, { vs: "100,101" });
    expect(englishLeaks(en, out, locale, { allow: [/^Player\d+/, /^C\d$/, /^Team \d+/, /^Manager \d+/, "Injured"] })).toEqual([]);
    expect(out).not.toContain("Chip tracker");
  });

  it("uses the altered wording and stays accessible there", async () => {
    const { setRequestTrip } = await import("@/components/ui/tripSlot");
    setRequestTrip(true);
    const { container } = render(<ToolsView model={await model({ vs: "100,101" })} />);
    const chips = section(container, "chip-tracker");
    expect(within(chips).getByRole("heading", { level: 2 }).textContent).not.toBe("Chip tracker");
    await expectNoAxeViolations(container);
  });
});
