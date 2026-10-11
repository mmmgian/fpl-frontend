import { describe, expect, it, vi } from "vitest";
import type { Bootstrap, ScheduledFixture } from "@/lib/domain/types";
import { createClubService } from "@/lib/services/club";
import type { EuropePort, NewsPort } from "@/lib/services/ports";
import { bootstrap } from "./fixtures";

const sched = (id: number, h: number, a: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event: id, team_h: h, team_a: a, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: `2026-10-${String(id + 10).padStart(2, "0")}T14:00:00Z`,
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});
const played = (id: number, h: number, a: number, hs: number, as: number) => sched(id, h, a, { started: true, finished: true, finished_provisional: true, team_h_score: hs, team_a_score: as });
const schedule = [played(1, 1, 2, 2, 0), sched(2, 2, 1), sched(3, 1, 2)];

const bs: Bootstrap = { ...bootstrap, elements: [
  { id: 1, web_name: "Raya", team: 1, element_type: 1, starts: 5, minutes: 450 },
  { id: 2, web_name: "Saka", team: 1, element_type: 3, status: "d", news: "Knock", chance_of_playing_next_round: 75, news_added: "2026-10-09T10:00:00Z", starts: 5, minutes: 430 },
  { id: 9, web_name: "Haaland", team: 2, element_type: 4, starts: 5, minutes: 450 },
] };

const europeItem = { id: 1, competition: "UEFA Champions League", utcDate: "2026-10-21T20:00:00.000Z", home: "Arsenal", away: "Bayern", clubIsHome: true, status: "SCHEDULED" };
const news = (items = [{ title: "Hello", url: "https://www.bbc.com/sport/1", summary: null, publishedAt: null }]): NewsPort => ({ headlines: async () => ({ items, creditUrl: "https://www.bbc.co.uk/sport/football/teams/arsenal" }) });
const europe = (): EuropePort => ({ fixtures: async () => [europeItem] });
const fpl = (over: { schedule?: () => Promise<ScheduledFixture[]> } = {}) => ({ bootstrap: async () => bs, allFixtures: over.schedule ?? (async () => schedule) });

describe("club service", () => {
  it("says not-found for a club FPL doesn't have", async () => {
    expect(await createClubService(fpl()).load(99)).toEqual({ kind: "not-found" });
  });

  it("builds the page from FPL alone, marking the outside sources as off", async () => {
    const m = await createClubService(fpl()).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.club).toMatchObject({ id: 1, name: "Arsenal", short: "ARS" });
    expect(m.europe).toEqual({ status: "off" });
    expect(m.headlines).toEqual({ status: "off" });
    expect(m.form).toEqual(["W"]);
    expect(m.next.map((x) => x.id)).toEqual([2, 3]);
    expect(m.recent.map((x) => x.id)).toEqual([1]);
    expect(m.news.map((n) => [n.player.name, n.severity])).toEqual([["Saka", "doubt"]]);
    expect(m.lineup).toBeNull();                                                // two players is not enough to name an XI
  });

  it("names each opponent, not just an id", async () => {
    const m = await createClubService(fpl()).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.next[0].opponent).toEqual({ id: 2, name: "Man City", short: "MCI", code: 43 });
  });

  it("includes what the outside sources return", async () => {
    const m = await createClubService(fpl(), { europe: europe(), news: news() }).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.europe).toEqual({ status: "ok", items: [europeItem] });
    expect(m.headlines).toMatchObject({ status: "ok", items: { creditUrl: expect.stringContaining("bbc.co.uk"), items: [expect.objectContaining({ title: "Hello" })] } });
  });

  it("shows the rest of the page when an outside source fails, marking only that card", async () => {
    const broken: EuropePort = { fixtures: async () => { throw new Error("429"); } };
    const m = await createClubService(fpl(), { europe: broken, news: news() }).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.europe).toEqual({ status: "unavailable" });
    expect(m.headlines.status).toBe("ok");
    expect(m.next.length).toBeGreaterThan(0);
  });

  it("treats 'the publisher has nothing for this club' as unavailable", async () => {
    const m = await createClubService(fpl(), { europe: null, news: { headlines: async () => null } }).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.headlines).toEqual({ status: "unavailable" });
  });

  it("starts the outside lookups alongside the schedule, not after it", async () => {
    const order: string[] = [];
    let release: (s: ScheduledFixture[]) => void = () => {};
    const slow = new Promise<ScheduledFixture[]>((r) => (release = r));
    const svc = createClubService(
      fpl({ schedule: () => { order.push("schedule"); return slow; } }),
      { europe: { fixtures: async () => { order.push("europe"); return []; } }, news: { headlines: async () => { order.push("news"); return null; } } },
    );
    const pending = svc.load(1);
    await vi.waitFor(() => expect(order).toContain("schedule"));
    expect(order).toEqual(expect.arrayContaining(["europe", "news"]));        // already running while the schedule is still outstanding
    release(schedule);
    await pending;
  });

  it("lets a failure of FPL's own schedule reach the caller (the page cannot be built without it)", async () => {
    await expect(createClubService(fpl({ schedule: async () => { throw new Error("FPL down"); } })).load(1)).rejects.toThrow("FPL down");
  });

  it("produces plain data that can be sent to the browser", async () => {
    const m = await createClubService(fpl(), { europe: europe(), news: news() }).load(1);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});
