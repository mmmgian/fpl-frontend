/**
 * Fortify: the club page. An FPL outage must be an error (with a retry), not "this club doesn't exist"; addresses
 * typed with capitals or spaces reach the club; a slow outside source can't hold the page; an opponent FPL doesn't
 * list is named in the page's language and not linked to a page that can't exist.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClubView } from "@/components/views/ClubView";
import type { ScheduledFixture } from "@/lib/domain/types";
import { createClubService } from "@/lib/services/club";
import { bootstrap } from "./fixtures";
import { expectNoAxeViolations } from "./axe";

const NOW = new Date("2026-10-11T12:00:00Z");
const fx = (id: number, h: number, a: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event: 7, team_h: h, team_a: a, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2026-10-17T14:00:00Z",
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});
const fpl = (schedule: ScheduledFixture[] = [fx(1, 1, 2)]) => ({ bootstrap: async () => bootstrap, allFixtures: async () => schedule });

afterEach(() => vi.useRealTimers());

describe("finding the club from the address", () => {
  const svc = createClubService(fpl(), undefined, { now: () => NOW });

  it.each([
    ["arsenal", { id: 1, slug: "arsenal" }],
    ["Arsenal", { id: 1, slug: "arsenal" }],
    ["ARSENAL", { id: 1, slug: "arsenal" }],
    ["Man City", { id: 2, slug: "man-city" }],
    ["man%20city", { id: 2, slug: "man-city" }],
    ["MCI", { id: 2, slug: "man-city" }],
    ["2", { id: 2, slug: "man-city" }],
  ])("%s finds the club (the page then redirects to its one address)", async (param, expected) => {
    expect(await svc.resolve(param)).toEqual(expected);
  });

  it.each(["nobody", "%E0%A4%A", "", "-", "0", "01"])("%j is not a club", async (param) => {
    expect(await svc.resolve(param)).toBeNull();
  });

  it("an FPL outage is an error the page can retry, not a 404 for a club that exists", async () => {
    const down = createClubService({ bootstrap: () => Promise.reject(new Error("503")), allFixtures: async () => [] }, undefined, { now: () => NOW });
    await expect(down.resolve("arsenal")).rejects.toThrow();
  });
});

describe("outside sources", () => {
  it("a source that never answers can't hold the page: its card says unavailable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hang = new Promise<never>(() => {});
    const svc = createClubService(fpl(), { europe: { fixtures: () => hang }, news: { headlines: () => hang } }, { now: () => NOW });
    const loading = svc.load(1);
    await vi.advanceTimersByTimeAsync(10_000);
    const model = await loading;
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.europe).toEqual({ status: "unavailable" });
    expect(model.headlines).toEqual({ status: "unavailable" });
  });

  it("a source that answers in time is kept", async () => {
    const svc = createClubService(fpl(), { europe: null, news: { headlines: async () => ({ items: [], creditUrl: "https://www.bbc.co.uk/sport" }) } }, { now: () => NOW });
    const model = await svc.load(1);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.headlines.status).toBe("ok");
    expect(model.europe).toEqual({ status: "off" });
  });
});

describe("an opponent FPL doesn't list", () => {
  it("is marked unknown, named in the page's language, and not linked", async () => {
    const svc = createClubService(fpl([fx(1, 1, 77), fx(2, 2, 1, { event: 8, kickoff_time: "2026-10-24T14:00:00Z" })]), undefined, { now: () => NOW });
    const model = await svc.load(1);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.next[0].opponent).toMatchObject({ id: 77, unknown: true });
    const { container } = render(<ClubView model={model} />);
    expect(container.querySelector('a[href="/club/unknown-club"]')).toBeNull();
    expect(screen.getAllByRole("link", { name: /Man City/ }).length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });
});

describe("a club with nothing scheduled", () => {
  it("loads with no fixtures, no form and no 'next' sentence", async () => {
    const model = await createClubService(fpl([]), undefined, { now: () => NOW }).load(1);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.next).toEqual([]);
    expect(model.recent).toEqual([]);
    const { container } = render(<ClubView model={model} />);
    expect(container.textContent).not.toMatch(/NaN|undefined|null/);
  });
});

import { parseBbcFeed } from "@/lib/news/bbcSport";
import { mapMatches } from "@/lib/europe/footballData";

describe("BBC headlines as the feed really sends them", () => {
  const rss = (...items: string[]) => `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
  const item = (title: string, link: string, desc = "", date = "Sat, 10 Oct 2026 10:00:00 GMT") =>
    `<item><title>${title}</title><description>${desc}</description><link>${link}</link><pubDate>${date}</pubDate></item>`;

  it("decodes entities the BBC puts inside CDATA, and strips tags from summaries", () => {
    const [h] = parseBbcFeed(rss(item("<![CDATA[Arteta&#39;s &quot;plan&quot; &amp; Saka]]>", "https://www.bbc.co.uk/sport/a", "<![CDATA[<p>Arsenal&#x27;s <b>new</b> deal</p>]]>")));
    expect(h.title).toBe(`Arteta's "plan" & Saka`);
    expect(h.summary).toBe("Arsenal's new deal");
  });

  it("decodes text the feed escaped twice", () => {
    const [h] = parseBbcFeed(rss(item("Saka&amp;#39;s return &amp;amp; more", "https://www.bbc.co.uk/sport/b")));
    expect(h.title).toBe("Saka's return & more");
  });

  it("keeps a heart a heart and a summary that is only tags is no summary", () => {
    const [h] = parseBbcFeed(rss(item("We &lt;3 Saka", "https://www.bbc.co.uk/sport/c", "<![CDATA[<p></p>]]>")));
    expect(h.title).toBe("We <3 Saka");
    expect(h.summary).toBeNull();
  });

  it("lists a story the feed repeats once (its link is the list's key)", () => {
    const hs = parseBbcFeed(rss(item("One", "https://www.bbc.co.uk/sport/d"), item("One again", "https://www.bbc.co.uk/sport/d"), item("Two", "https://www.bbc.co.uk/sport/e")));
    expect(hs.map((h) => h.url)).toEqual(["https://www.bbc.co.uk/sport/d", "https://www.bbc.co.uk/sport/e"]);
  });
});

describe("European fixtures as the provider really sends them", () => {
  const m = (id: number, utcDate: string | null) => ({ id, utcDate, competition: { name: "UEFA Champions League" }, homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 1, shortName: "PSG" }, status: "SCHEDULED" });

  it("lists a match the provider repeats once (its id is the list's key)", () => {
    expect(mapMatches([m(1, "2026-10-21T19:00:00Z"), m(1, "2026-10-21T19:00:00Z"), m(2, "2026-11-04T20:00:00Z")], 57).map((x) => x.id)).toEqual([1, 2]);
  });

  it("orders undated matches last and the same way every time", () => {
    const xs = [m(3, null), m(1, "2026-10-21T19:00:00Z"), m(2, null)];
    expect(mapMatches(xs, 57).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(mapMatches([...xs].reverse(), 57).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
