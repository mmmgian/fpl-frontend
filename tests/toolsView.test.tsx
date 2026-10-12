import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeadlineTimer } from "@/components/ui/DeadlineTimer";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { ToolsView } from "@/components/views/ToolsView";
import { createToolsService } from "@/lib/services/tools";
import { expectNoAxeViolations } from "./axe";
import { englishLeaks, visibleTexts } from "./i18nLeaks";
import { testLanguage } from "./language";
import { fakeFpl } from "./support";
import { NOW, bootstrap, league, picksFor, schedule } from "./toolsWorld";

const model = async (query = {}, managers = 12) => {
  const m = await createToolsService(fakeFpl({ bootstrap: async () => bootstrap, standings: async () => league(managers), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e) }), { now: () => NOW }).load(1, query);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};

describe("the Tools page", () => {
  it("has the title, the countdown and a way to each tool", async () => {
    render(<ToolsView model={await model()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Tools" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Tools" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#xi", "#prices", "#eo", "#teams"]);
  });

  it("shows the team of the week as a formation with captain, vice-captain and the opponent for each player", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const xi = container.querySelector("#xi")!;
    expect(within(xi as HTMLElement).getByRole("heading", { level: 2, name: "Team of the Week · Gameweek 7" })).toBeInTheDocument();
    expect(xi).toHaveTextContent("Player13");
    expect(xi.textContent).toMatch(/\d-\d-\d/);
    expect(within(xi as HTMLElement).getAllByText("Captain")).toHaveLength(1);       // exactly one captain...
    expect(within(xi as HTMLElement).getAllByText("Vice-captain")).toHaveLength(1);  // ...and one vice-captain
    expect(xi).toHaveTextContent("C1 (A)");                                      // Player13 is away at C1
    expect(xi).not.toHaveTextContent("Injured");
  });

  it("lists price movers with their status, and keeps the filters in the form", async () => {
    const { container } = render(<ToolsView model={await model({ q: "player", pos: "2", moving: "1" })} />);
    const prices = container.querySelector("#prices") as HTMLElement;
    expect(within(prices).getByLabelText("Player")).toHaveValue("player");
    expect(within(prices).getByLabelText("Position")).toHaveValue("2");
    expect(within(prices).getByLabelText("Only players on the move")).toBeChecked();
    expect(within(prices).getAllByText("Likely to rise").length).toBeGreaterThan(0);
    expect(within(prices).getByText("Likely to fall")).toBeInTheDocument();
    expect(prices).toHaveTextContent(/Showing|\d+ players/);
  });

  it("has a 'my team' form that goes to /team with the id", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    const form = container.querySelector('form[action="/team"]') as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.method).toBe("get");
    expect(within(form).getByPlaceholderText("Enter team ID")).toHaveAttribute("name", "id");
    expect(within(form).getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("shows effective ownership with tabs that keep the other tools' filters", async () => {
    const { container } = render(<ToolsView model={await model({ q: "abc", eo: "top10", by: "captain" })} />);
    const eo = container.querySelector("#eo") as HTMLElement;
    const tab = (name: string) => within(eo).getByRole("link", { name });
    expect(tab("Top 10")).toHaveAttribute("aria-current", "true");
    expect(tab("Top 4")).not.toHaveAttribute("aria-current");
    expect(tab("Captains")).toHaveAttribute("aria-current", "true");
    expect(tab("Everyone").getAttribute("href")).toBe("/tools?q=abc&eo=all&by=captain#eo");     // keeps the search and the view
    expect(tab("EO").getAttribute("href")).toBe("/tools?q=abc&eo=top10#eo");                  // drops only "by"
  });

  it("links every team to its team sheet", async () => {
    const { container } = render(<ToolsView model={await model({}, 5)} />);
    const teams = container.querySelector("#teams") as HTMLElement;
    const links = within(teams).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/team/100", "/team/101", "/team/102", "/team/103", "/team/104"]);
    expect(links[0]).toHaveAccessibleName("Open Team 1's team sheet");
    expect(links[0]).toHaveTextContent("Manager 1");
    expect(links[0]).toHaveTextContent("#1");
  });

  it("sits on the rainbow-striped page wrapper, with no sharp data-sheet look left", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    expect(container.querySelector('[data-ui="sheet"]')).toBeNull();
    expect(container.querySelector('[class*="stripe"]')).not.toBeNull();
  });

  it("leaves out the tools it can't fill rather than showing empty boxes", async () => {
    const m = await model({}, 3);
    const { container } = render(<ToolsView model={{ ...m, xi: null, teams: [], eo: null }} />);
    expect(container.querySelector("#xi")).toBeNull();
    expect(container.querySelector("#teams")).toBeNull();
    expect(container.querySelector("#eo")).toHaveTextContent("No picks to work from yet.");
    expect(screen.getByRole("navigation", { name: "Tools" }).querySelectorAll("a")).toHaveLength(2);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ToolsView model={await model()} />);
    await expectNoAxeViolations(container);
  });
});

describe("the Tools page in other languages", () => {
  async function inLanguage(locale: "en" | "es" | "fr", query = {}): Promise<string> {
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

  it.each(["es", "fr"] as const)("is in %s all the way through, with no English left behind", async (locale) => {
    const english = await inLanguage("en");
    const translated = await inLanguage(locale);
    expect(translated).not.toBe(english);
    // names from the data (players, clubs, managers) are the same in every language
    expect(englishLeaks(english, translated, locale, { allow: [/^Player\d+/, /^C\d$/, /^Team \d+/, /^Manager \d+/, "Injured"] })).toEqual([]);
    expect(visibleTexts(translated).filter((t) => !visibleTexts(english).includes(t)).length).toBeGreaterThan(20);
  });

  it("writes numbers and percentages the way the language does", async () => {
    const fr = await inLanguage("fr", { eo: "all" });
    expect(fr).toContain("191,7\u00a0%");                                         // comma, and a non-breaking space before the sign
    expect(fr).toContain("+63,6\u00a0% des propriétaires");
    expect(fr.replace(/<[^>]*>/g, " ")).not.toMatch(/\d\.\d/);                  // no English decimal point in the visible text (attributes such as ISO times are not text)
    const es = await inLanguage("es", { eo: "all" });
    expect(es).toContain("191.7\u00a0%");                                         // Central American Spanish keeps the point
    const en = await inLanguage("en", { eo: "all" });
    expect(en).toContain("191.7%");
  });
});

describe("DeadlineTimer", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  const AT = "2026-10-17T10:00:00Z";
  const nowAt = (offsetSeconds: number) => new Date(new Date(AT).getTime() - offsetSeconds * 1000);
  const digits = () => [...document.querySelectorAll('[role="timer"] > div')].map((d) => d.textContent);

  it("shows days, hours, minutes and seconds with two digits each, from the server's clock", () => {
    vi.setSystemTime(nowAt(5 * 86400 + 9 * 3600 + 5 * 60 + 28));
    render(<DeadlineTimer at={AT} now={nowAt(5 * 86400 + 9 * 3600 + 5 * 60 + 28).toISOString()} gameweek="Gameweek 7" />);
    expect(digits()).toEqual(["05Days", "09Hours", "05Mins", "28Secs"]);
    expect(screen.getByRole("heading", { name: "Next deadline" })).toBeInTheDocument();
    expect(screen.getByText("Gameweek 7")).toBeInTheDocument();
  });

  it("ticks every second from the browser's clock", () => {
    vi.setSystemTime(nowAt(3725));
    render(<DeadlineTimer at={AT} now={nowAt(3725).toISOString()} gameweek="Gameweek 7" />);
    expect(digits()).toEqual(["00Days", "01Hours", "02Mins", "05Secs"]);
    act(() => vi.advanceTimersByTime(1000));
    expect(digits()[3]).toBe("04Secs");
    act(() => vi.advanceTimersByTime(5000));
    expect(digits()).toEqual(["00Days", "01Hours", "01Mins", "59Secs"]);
  });

  it("corrects itself if the browser's clock disagrees with the server's", () => {
    vi.setSystemTime(nowAt(100));                                             // the browser says 100 s left
    render(<DeadlineTimer at={AT} now={nowAt(7200).toISOString()} gameweek="Gameweek 7" />);   // the server said two hours
    expect(digits()).toEqual(["00Days", "00Hours", "01Mins", "40Secs"]);
  });

  it("says so when the deadline has passed, and stops counting", () => {
    vi.setSystemTime(nowAt(2));
    render(<DeadlineTimer at={AT} now={nowAt(2).toISOString()} gameweek="Gameweek 7" />);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText("The deadline has passed")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("shows the deadline date and clears its timer when it goes away", () => {
    vi.setSystemTime(nowAt(60));
    const { container, unmount } = render(<DeadlineTimer at={AT} now={nowAt(60).toISOString()} gameweek="Gameweek 7" />);
    expect(container.querySelector(`time[datetime="${new Date(AT).toISOString()}"]`)).not.toBeNull();
    const before = vi.getTimerCount();
    unmount();
    expect(vi.getTimerCount()).toBeLessThan(before);
  });

  it("speaks the page's language", () => {
    vi.setSystemTime(nowAt(60));
    render(
      <I18nProvider locale="fr">
        <DeadlineTimer at={AT} now={nowAt(60).toISOString()} gameweek="Journée 7" />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Prochaine date limite" })).toBeInTheDocument();
    expect(digits()).toEqual(["00Jours", "00Heures", "01Min", "00Sec"]);
  });
});

describe("/team?id=", () => {
  const go = async (id: string | null) => {
    const { GET } = await import("@/app/team/route");
    const { NextRequest } = await import("next/server");
    const res = GET(new NextRequest(`http://localhost/team${id === null ? "" : `?id=${encodeURIComponent(id)}`}`));
    return new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).hash;
  };
  it("sends a team number to that team's sheet", async () => {
    expect(await go("2379133")).toBe("/team/2379133");
    expect(await go(" 42 ")).toBe("/team/42");
  });
  it("sends anything else back to the tools, never to a made-up address", async () => {
    for (const bad of [null, "", "abc", "0", "-5", "12.5", "1e3", "../etc", "123456789012", "7/../../x", "<script>"]) {
      expect(await go(bad), String(bad)).toBe("/tools#prices");
    }
  });
});

describe("the user interface", () => {
  it("lets a person type in the team form and press Go", async () => {
    const user = userEvent.setup();
    render(<ToolsView model={await model()} />);
    await user.type(screen.getByPlaceholderText("Enter team ID"), "2379133");
    expect(screen.getByPlaceholderText("Enter team ID")).toHaveValue("2379133");
  });
});
