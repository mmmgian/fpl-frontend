import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueCard } from "@/components/views/IssueCard";
import { TimesLibraryView } from "@/components/views/TimesLibraryView";
import { TimesReaderView } from "@/components/views/TimesReaderView";
import { createTimesService } from "@/lib/services/times";
import type { TimesIssueModel, TimesLibraryModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";
import { LIBRARY, fakeTimes, summary } from "./times-fixtures";

const svc = createTimesService(fakeTimes());
const library = async (kind?: string): Promise<Extract<TimesLibraryModel, { kind: "ok" }>> => {
  const m = await svc.library(kind);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};
const reader = async (id: string, p?: string): Promise<Extract<TimesIssueModel, { kind: "ok" }>> => {
  const m = await svc.issue(id, p);
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};

describe("IssueCard", () => {
  it("is one link, named by the title, with a decorative cover and the facts", () => {
    const { container } = render(<IssueCard issue={LIBRARY[0]} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "The Lobster Times" })).toHaveAttribute("href", "/times/times-gw5");
    expect(screen.getByRole("heading", { level: 3, name: "The Lobster Times" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", ""); // the title says it; the cover is decoration
    expect(container.querySelector("img")).toHaveAttribute("width", "1080");
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Newspaper")).toBeInTheDocument();
    expect(screen.getByText("GW5")).toBeInTheDocument();
    expect(screen.getByText(/6 pages · 3\.2 MB · 21 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByText("Vol. V · Issue 5")).toBeInTheDocument();
  });

  it("copes with no kicker, summary or gameweek, and a single page", () => {
    render(<IssueCard issue={summary({ id: "bare", title: "Bare", pageCount: 1, published: "2026-08-31" })} />);
    expect(screen.getByText(/1 page · 512 KB · 31 Aug 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^GW\d/)).toBeNull();
  });

  it("handles a very long title without losing it", () => {
    const title = "A".repeat(10) + " " + "Extraordinarily".repeat(12);
    render(<IssueCard issue={summary({ id: "long", title })} />);
    expect(screen.getByRole("link", { name: title })).toBeInTheDocument();
  });

  it("loads eagerly only when told the card is above the fold", () => {
    const { container } = render(<IssueCard issue={LIBRARY[0]} priority />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });
});

describe("TimesLibraryView", () => {
  it("shows the masthead, the latest edition, filters and the archive", async () => {
    const { container } = render(<TimesLibraryView model={await library()} />);
    expect(screen.getByRole("heading", { level: 1, name: "The Lobster Times" })).toBeInTheDocument();
    const hero = screen.getByRole("region", { name: /latest edition/i });
    expect(within(hero).getByRole("link", { name: "Read the issue" })).toHaveAttribute("href", "/times/times-gw5");
    expect(within(hero).getByText(/gameweek 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "The archive" })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(4); // the hero is not repeated
    await expectNoAxeViolations(container);
  });

  it("filter links carry counts and say which is current", async () => {
    render(<TimesLibraryView model={await library("plan")} />);
    const nav = screen.getByRole("navigation", { name: "Filter by type" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent?.replace(/\s+/g, " ").trim())).toEqual(["All 5", "Newspapers 2", "Plans 1", "Dossiers 1", "Reports 1"]);
    expect(within(nav).getByRole("link", { name: /Plans/ })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: /Plans/ })).toHaveAttribute("href", "/times?kind=plan");
    expect(within(nav).getByRole("link", { name: /^All/ })).toHaveAttribute("href", "/times");
    expect(within(nav).getByRole("link", { name: /Newspapers/ })).not.toHaveAttribute("aria-current");
  });

  it("a filtered view has no hero and is headed by the type", async () => {
    const { container } = render(<TimesLibraryView model={await library("times")} />);
    expect(screen.queryByRole("region", { name: /latest edition/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "The archive" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Newspapers" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await expectNoAxeViolations(container); // heading levels stay in order without the hero
  });

  it("explains an empty filter and offers a way out", async () => {
    render(<TimesLibraryView model={await library("recap")} />);
    expect(screen.getByText("No issues in this section yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show everything" })).toHaveAttribute("href", "/times");
  });

  it("explains an empty library", () => {
    render(<TimesLibraryView model={{ kind: "empty" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "The Lobster Times" })).toBeInTheDocument();
    expect(screen.getByText("Nothing has gone to print yet")).toBeInTheDocument();
  });

  it("works with no newspaper at all", async () => {
    const m = await createTimesService(fakeTimes(LIBRARY.filter((i) => i.kind !== "times"))).library(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    const { container } = render(<TimesLibraryView model={m} />);
    expect(screen.queryByRole("region", { name: /latest edition/i })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    await expectNoAxeViolations(container);
  });
});

describe("TimesReaderView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the issue's heading, facts, flipbook, download and neighbours", async () => {
    const { container } = render(<TimesReaderView model={await reader("times-gw5", "3")} />);
    expect(screen.getByRole("heading", { level: 1, name: "The Lobster Times" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← The Times" })).toHaveAttribute("href", "/times");
    expect(screen.getByText(/6 pages · 3\.2 MB · 21 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "The Lobster Times, Vol. V · Issue 5" })).toHaveAttribute("aria-roledescription", "flipbook");
    // opens at the requested page, with responsive sources and a real download
    const img = screen.getByRole("img", { name: "Page 3 of 6" });
    expect(img).toHaveAttribute("src", "/times/times-gw5/p-003-m.webp");
    expect(img).toHaveAttribute("srcset", expect.stringContaining("p-003-l.webp 1080w"));
    expect(screen.getByRole("link", { name: "Download PDF (3.2 MB)" })).toHaveAttribute("href", "/times/times-gw5/times-gw5.pdf");
    expect(screen.getByRole("link", { name: "Open page 3 full size" })).toHaveAttribute("href", "/times/times-gw5/p-003-l.webp");
    const more = screen.getByRole("navigation", { name: "More issues" });
    expect(within(more).getByRole("link", { name: /Previous issue[\s\S]*The Lobster League Times/ })).toHaveAttribute("href", "/times/times-gw4");
    await expectNoAxeViolations(container);
  });

  it("omits the neighbour a first or last issue doesn't have", async () => {
    render(<TimesReaderView model={await reader("one-pager")} />);
    const more = screen.getByRole("navigation", { name: "More issues" });
    expect(within(more).getAllByRole("link")).toHaveLength(1);
  });

  it("a one-page issue is shown without page turning", async () => {
    render(<TimesReaderView model={await reader("one-pager")} />);
    expect(screen.getByRole("img", { name: "Page 1 of 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next|previous/i })).toBeNull();
  });

  it("keeps ?p= in the address bar as the reader turns pages, without adding history entries", async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    render(<TimesReaderView model={await reader("times-gw5")} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(new URL(String(replace.mock.calls.at(-1)?.[2]), "http://x").searchParams.get("p")).toBe("2");
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(new URL(String(replace.mock.calls.at(-1)?.[2]), "http://x").searchParams.has("p")).toBe(false); // page 1 is the default
    expect(push).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it("fetches the page text once, only when asked for it, and shows it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pages: ["First page text", "Second page text", "Third"] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<TimesReaderView model={await reader("times-gw4")} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByText("First page text")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Second page text")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/times/times-gw4/text.json"); // one request serves every page
  });

  it("offers a way to read without JavaScript", async () => {
    const html = renderToStaticMarkup(<TimesReaderView model={await reader("times-gw5", "3")} />);
    expect(html).toContain("<noscript>");
    expect(html).toContain('href="/times/times-gw5?p=2"');
    expect(html).toContain('href="/times/times-gw5?p=4"');
    const inNoscript = (h: string) => h.slice(h.indexOf("<noscript>"), h.indexOf("</noscript>"));
    expect(inNoscript(html)).toContain("← Previous page");
    const first = renderToStaticMarkup(<TimesReaderView model={await reader("times-gw5", "1")} />);
    expect(inNoscript(first)).not.toContain("Previous page"); // nothing before the first page
    const last = renderToStaticMarkup(<TimesReaderView model={await reader("times-gw5", "6")} />);
    expect(inNoscript(last)).not.toContain("Next page"); // nothing after the last
  });
});
