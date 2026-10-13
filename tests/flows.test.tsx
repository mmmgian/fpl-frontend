/**
 * Moving around the site: where a link leads when something is missing or down, what the header says about where
 * you are, what "back" does, how pages look when shared, and the reader's keys and gestures.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { openGraph, DEFAULT_SHARE_IMAGE } from "@/app/meta";
import { BackLink, NavTracker } from "@/components/ui/BackLink";
import { Flipbook, type FlipbookPage } from "@/components/ui/Flipbook";
import { pagerSteps } from "@/components/ui/GameweekPager";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { RetryButton } from "@/components/ui/RetryButton";
import { SiteHeader, isActive } from "@/components/ui/SiteHeader";
import { applyTheme } from "@/components/ui/applyTheme";
import { setRequestLocale } from "@/components/ui/i18n";
import { initialNavState, navStore, nextNavState, pathOf } from "@/components/ui/navState";
import { TeamNotFound, TimesNotFound } from "@/components/views/NotFoundView";
import { MESSAGES, THEME_COLOR, THEME_SCRIPT, TRIP_THEME_COLOR } from "@/lib/domain";
import { createTeamService } from "@/lib/services/team";
import { expectNoAxeViolations } from "./axe";
import { standing } from "./fixtures";
import { clock, fakeFpl } from "./support";

beforeEach(() => {
  nav.pathname = "/";
  navStore.reset();
  Object.values(router).forEach((fn) => fn.mockClear());
});

describe("a shared team link", () => {
  const table = { league: { id: 1, name: "L" }, standings: { has_next: false, results: [standing({ entry: 7, entry_name: "Gaucho F.C.", player_name: "gian jaen" }), standing({ entry: 8, entry_name: "Bart's Team", player_name: "Bart" })] } };
  const svc = (standings: () => Promise<unknown>) => createTeamService(fakeFpl({ standings: standings as never }), { now: clock, leagueId: () => 1 });

  const down = () => Promise.reject(new Error("FPL is updating"));

  it("is an outage to retry, not a missing page, when the league table can't be read", async () => {
    await expect(svc(down).resolve("gaucho-f-c")).rejects.toThrow(/unavailable/);
  });

  it("still opens by team number while the table is down", async () => {
    expect(await svc(down).resolve("7")).toEqual({ entryId: 7, slug: null });
  });

  it("is a missing page only when the table was read and has no such name", async () => {
    expect(await svc(async () => table).resolve("old-team-name")).toBeNull();
  });

  it("offers the league's teams, in table order, when it leads nowhere", async () => {
    expect(await svc(async () => table).directory()).toEqual([
      { slug: "gaucho-f-c", teamName: "Gaucho F.C.", manager: "gian jaen" },
      { slug: "barts-team", teamName: "Bart's Team", manager: "Bart" },
    ]);
    expect(await svc(down).directory()).toBeNull();
  });

  it("explains renamed teams and links to each team, without a stranger's team number", async () => {
    const { container } = render(<TeamNotFound teams={[{ slug: "gaucho-f-c", teamName: "Gaucho F.C.", manager: "gian jaen" }]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We couldn't find that team");
    expect(container.textContent).toMatch(/renames the team/);
    expect(container.textContent).not.toMatch(/2379133/);
    expect(screen.getByRole("link", { name: /Gaucho F\.C\./ })).toHaveAttribute("href", "/team/gaucho-f-c");
    expect(screen.getByRole("link", { name: "Go to the table" })).toHaveAttribute("href", "/");
    await expectNoAxeViolations(container);
  });

  it("without the table, just points to it", () => {
    render(<TeamNotFound teams={null} />);
    expect(screen.queryByRole("heading", { name: "Pick a team" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to the table" })).toBeInTheDocument();
  });

  it.each(["es", "fr"] as const)("is in %s too", (locale) => {
    setRequestLocale(locale);
    const out = renderToStaticMarkup(<><TeamNotFound teams={[]} /><TimesNotFound /></>);
    expect(out).toContain(MESSAGES[locale].notFound.team.title.replace(/'/g, "&#x27;"));
    expect(out).toContain(MESSAGES[locale].notFound.times.title.replace(/'/g, "&#x27;"));
  });
});

describe("no page claims the FPL API is to blame for everything", () => {
  it.each(["en", "es", "fr"] as const)("the generic error and 404 copy is neutral in %s", (locale) => {
    expect(MESSAGES[locale].client.errors.body).not.toMatch(/API/);
    expect(MESSAGES[locale].notFound.body).not.toMatch(/\/team\/\d/);
  });
});

describe("shared links", () => {
  it("keep the site's name, description and picture when a page sets its own preview", () => {
    expect(openGraph("About this page", { title: "A page" })).toEqual({
      siteName: "The Lobster League",
      type: "website",
      description: "About this page",
      images: [DEFAULT_SHARE_IMAGE],
      title: "A page",
    });
  });

  it("a page's own picture replaces the default, not adds to it", () => {
    expect(openGraph("d", { images: [{ url: "/x.webp" }] }).images).toEqual([{ url: "/x.webp" }]);
  });
});

describe("the header says where you are", () => {
  it.each([
    ["/", "/"],
    ["/team/gaucho-f-c", "/"],
    ["/times", "/times"],
    ["/times/lobster-times-gw5", "/times"],
    ["/history/5", "/times"],
    ["/fixtures", "/fixtures"],
    ["/club/arsenal", "/fixtures"],
    ["/bonus", "/bonus"],
    ["/tools", "/tools"],
  ])("%s is under %s", (pathname, section) => {
    for (const href of ["/", "/tools", "/bonus", "/fixtures", "/times"]) expect(isActive(pathname, href), `${pathname} vs ${href}`).toBe(href === section);
  });

  it("marks the section in the rendered nav", () => {
    nav.pathname = "/history/5";
    render(<SiteHeader siteName="The Lobster League" />);
    expect(screen.getByRole("link", { name: "The Times" })).toHaveAttribute("aria-current", "page");
  });

  it("in the altered view, swaps the (powerless) theme picker for a labelled way back to normal", async () => {
    const { container } = render(
      <I18nProvider locale="en" trip>
        <SiteHeader siteName="The Lobster League" />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Normal view" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("in the regular view, has the theme picker and no such button", () => {
    render(
      <I18nProvider locale="en">
        <SiteHeader siteName="The Lobster League" />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Normal view" })).toBeNull();
  });
});

describe("the browser chrome in the altered view", () => {
  afterEach(() => {
    delete document.documentElement.dataset.trip;
    delete document.documentElement.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    vi.unstubAllGlobals();
  });
  const chrome = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]')?.content;

  it("is the altered view's purple before first paint, whatever the theme", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));
    document.documentElement.dataset.trip = "on";
    new Function(THEME_SCRIPT)();
    expect(chrome()).toBe(TRIP_THEME_COLOR);
  });

  it("stays purple when a theme is picked, and is the theme's own colour otherwise", () => {
    document.documentElement.dataset.trip = "on";
    applyTheme("night", false);
    expect(chrome()).toBe(TRIP_THEME_COLOR);
    delete document.documentElement.dataset.trip;
    applyTheme("night", false);
    expect(chrome()).toBe(THEME_COLOR.night);
  });
});

describe("knowing what's one Back away", () => {
  it("records a push, keeps it through a replace, and forgets after Back/Forward", () => {
    let s = nextNavState(initialNavState, "/times", 3);
    expect(s.previous).toBeNull(); // a cold landing: nothing of ours behind it
    s = nextNavState(s, "/history/5", 4); // push
    expect(s).toMatchObject({ current: "/history/5", previous: "/times" });
    s = nextNavState(s, "/history/6", 4); // the pager replaces
    expect(s).toMatchObject({ current: "/history/6", previous: "/times" });
    s = nextNavState({ ...s, popped: true }, "/times", 4); // Back
    expect(s.previous).toBeNull();
  });

  it("doesn't guess once the browser stops counting", () => {
    let s = nextNavState(initialNavState, "/a", 49);
    s = nextNavState(s, "/b", 50);
    expect(s.previous).toBe("/a");
    s = nextNavState(s, "/c", 50); // a push or a replace? can't tell at the cap
    expect(s.previous).toBeNull();
  });

  it("compares paths, not fragments or filters", () => {
    expect(pathOf("/times#tables")).toBe("/times");
    expect(pathOf("/times?kind=plan")).toBe("/times");
    expect(pathOf("")).toBe("/");
  });

  it("the tracker records each page it sees", () => {
    nav.pathname = "/times";
    const { rerender } = render(<NavTracker />);
    vi.spyOn(window.history, "length", "get").mockReturnValue(window.history.length + 1);
    nav.pathname = "/times/lobster-times-gw5";
    rerender(<NavTracker />);
    expect(navStore.get()).toMatchObject({ current: "/times/lobster-times-gw5", previous: "/times" });
    vi.restoreAllMocks();
  });
});

describe("back links", () => {
  const arriveFrom = (from: string, to: string) => {
    navStore.arrive(from, 2);
    navStore.arrive(to, 3);
  };

  it("are a real Back when the target is the page just before (keeping its scroll and filters)", async () => {
    arriveFrom("/times", "/history/5");
    render(<BackLink href="/times#tables">← Past tables</BackLink>);
    await userEvent.click(screen.getByRole("link", { name: "← Past tables" }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("are an ordinary link after a cold landing", async () => {
    navStore.arrive("/history/5", 1);
    render(<BackLink href="/times#tables">← Past tables</BackLink>);
    const link = screen.getByRole("link", { name: "← Past tables" });
    expect(link).toHaveAttribute("href", "/times#tables");
    fireEvent.click(link);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("leave a modified click (new tab) to the browser", () => {
    arriveFrom("/times", "/times/lobster-times-gw5");
    render(<BackLink href="/times">← The Times</BackLink>);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("the past tables' pager", () => {
  it("steps to the nearest saved gameweek either side", () => {
    expect(pagerSteps(5, 1, 9, [2, 5, 7])).toEqual({ prev: 2, next: 7 });
    expect(pagerSteps(2, 2, 7, [2, 5, 7])).toEqual({ prev: null, next: 5 });
    expect(pagerSteps(6, 2, 7, [2, 5, 7])).toEqual({ prev: 5, next: 7 }); // an unsaved gameweek still has neighbours
  });

  it("without stops, is every gameweek between min and max", () => {
    expect(pagerSteps(1, 1, 38)).toEqual({ prev: null, next: 2 });
    expect(pagerSteps(38, 1, 38)).toEqual({ prev: 37, next: null });
  });
});

describe("a section that failed to load", () => {
  it("offers Try again, which re-fetches the page in place", async () => {
    render(<RetryButton />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("reading an issue", () => {
  const pages: FlipbookPage[] = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, src: `/p-${i + 1}.webp`, width: 640, height: 905 }));
  afterEach(() => vi.unstubAllGlobals());

  it("turns with ← and → from anywhere on the page, without first focusing the pages", async () => {
    render(
      <>
        <a href="/elsewhere">elsewhere</a>
        <Flipbook pages={pages} label="x" layout="single" />
      </>,
    );
    screen.getByRole("link", { name: "elsewhere" }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("img", { name: "Page 3 of 4" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("img", { name: "Page 2 of 4" })).toBeInTheDocument();
  });

  it("leaves arrows alone in controls that use them, and with modifiers", async () => {
    render(
      <>
        <div role="radiogroup" aria-label="theme">
          <button type="button" role="radio" aria-checked="true">a</button>
        </div>
        <Flipbook pages={pages} label="x" layout="single" />
      </>,
    );
    screen.getByRole("radio").focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(screen.getByRole("img", { name: "Page 1 of 4" })).toBeInTheDocument();
  });

  it("a sideways drag while pinch-zoomed pans instead of turning the page", () => {
    render(<Flipbook pages={pages} label="x" layout="single" />);
    const viewport = screen.getByRole("group", { name: "Pages" });
    const drag = () => {
      fireEvent.pointerDown(viewport, { clientX: 200, clientY: 200, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerUp(viewport, { clientX: 60, clientY: 200, pointerId: 1, pointerType: "touch" });
    };
    vi.stubGlobal("visualViewport", { scale: 2.5 });
    act(drag);
    expect(screen.getByRole("img", { name: "Page 1 of 4" })).toBeInTheDocument();
    vi.stubGlobal("visualViewport", { scale: 1 });
    act(drag);
    expect(screen.getByRole("img", { name: "Page 2 of 4" })).toBeInTheDocument();
  });

  it.each([
    ["es", "No hay páginas que mostrar."],
    ["fr", "Il n'y a aucune page à afficher."],
  ] as const)("says there are no pages in %s", (locale, text) => {
    render(
      <I18nProvider locale={locale}>
        <Flipbook pages={[]} label="x" />
      </I18nProvider>,
    );
    expect(within(document.body).getByRole("status")).toHaveTextContent(text);
  });
});
