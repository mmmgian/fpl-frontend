import { describe, expect, it } from "vitest";
import { buildFixtureFeed, feedStartIndex, matchState, scoreLine } from "@/lib/domain";
import type { FplEvent, FplTeam, ScheduledFixture } from "@/lib/domain/types";

const team = (id: number): FplTeam => ({ id, code: id * 10, name: `Club ${id}`, short_name: `C${id}` });
const teams = [1, 2, 3, 4].map(team);
const event = (id: number, over: Partial<FplEvent> = {}): FplEvent => ({
  id, name: `Gameweek ${id}`, deadline_time: `2026-10-${10 + id}T17:30:00Z`, is_current: false, is_next: false, finished: false, data_checked: false, ...over,
});
const fx = (id: number, over: Partial<ScheduledFixture> = {}): ScheduledFixture => ({
  id, event: 1, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: "2026-10-17T14:00:00Z",
  started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null, ...over,
});

describe("matchState", () => {
  it("reads the four flags in order of how final they are", () => {
    expect(matchState(fx(1, { finished: true, finished_provisional: true, started: true }))).toBe("finished");
    expect(matchState(fx(1, { finished_provisional: true, started: true }))).toBe("provisional");
    expect(matchState(fx(1, { started: true }))).toBe("live");
    expect(matchState(fx(1))).toBe("upcoming");
    expect(matchState(fx(1, { kickoff_time: null }))).toBe("tbc");
    expect(matchState(fx(1, { started: null }))).toBe("upcoming");
  });
});

describe("buildFixtureFeed", () => {
  it("orders gameweeks, then matches by kick-off, whatever order FPL listed them in", () => {
    const feed = buildFixtureFeed([event(1), event(2)], teams, [
      fx(3, { event: 2 }),
      fx(2, { kickoff_time: "2026-10-17T16:30:00Z" }),
      fx(1, { kickoff_time: "2026-10-17T12:30:00Z" }),
    ]);
    expect(feed.map((g) => g.gw)).toEqual([1, 2]);
    expect(feed[0].days[0].matches.map((m) => m.id)).toEqual([1, 2]);
  });

  it("groups matches under UK calendar days, not UTC ones", () => {
    // 23:30 UTC on 17 Oct is 00:30 on the 18th in the UK (summer time), so it belongs to Sunday.
    const feed = buildFixtureFeed([event(1)], teams, [
      fx(1, { kickoff_time: "2026-10-17T14:00:00Z" }),
      fx(2, { kickoff_time: "2026-10-17T22:59:00Z" }),
      fx(3, { kickoff_time: "2026-10-17T23:30:00Z" }),
    ]);
    expect(feed[0].days.map((d) => [d.date, d.matches.map((m) => m.id)])).toEqual([["2026-10-17", [1, 2]], ["2026-10-18", [3]]]);
    expect(feed[0].days[0].label).toBe("Saturday 17 October");
  });

  it("uses winter time too (no offset in December)", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1, { kickoff_time: "2026-12-12T23:30:00Z" })]);
    expect(feed[0].days[0].date).toBe("2026-12-12");
  });

  it("puts a match with no kick-off time at the end, under its own heading", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1, { kickoff_time: null }), fx(2)]);
    expect(feed[0].days.map((d) => d.date)).toEqual(["2026-10-17", "tbc"]);
    expect(feed[0].days[1].label).toMatch(/to be confirmed/i);
    expect(feed[0].days[1].matches[0].state).toBe("tbc");
  });

  it("survives a kick-off time that isn't a date", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1, { kickoff_time: "soon" })]);
    expect(feed[0].days[0].date).toBe("tbc");
  });

  it("shows scores only once a match has started", () => {
    const [upcoming, live, over] = buildFixtureFeed([event(1)], teams, [
      fx(1, { team_h_score: 3, team_a_score: 1 }),                                    // stale scores on a match that hasn't started
      fx(2, { started: true, team_h_score: 1, team_a_score: 0 }),
      fx(3, { started: true, finished: true, finished_provisional: true, team_h_score: 2, team_a_score: 2 }),
    ])[0].days[0].matches;
    expect([upcoming.homeScore, upcoming.awayScore]).toEqual([null, null]);
    expect([live.homeScore, live.awayScore, live.state]).toEqual([1, 0, "live"]);
    expect(scoreLine(over)).toBe("2–2");
    expect(scoreLine(upcoming)).toBeNull();
  });

  it("keeps each side's own difficulty, clamped to 1-5", () => {
    const [m] = buildFixtureFeed([event(1)], teams, [fx(1, { team_h_difficulty: 2, team_a_difficulty: 9 })])[0].days[0].matches;
    expect([m.homeBand, m.awayBand]).toEqual([2, 3]);                              // an impossible 9 is treated as neutral
  });

  it("flags double gameweeks and blanks", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1, { team_h: 1, team_a: 2 }), fx(2, { team_h: 3, team_a: 1 })]);
    expect(feed[0].doubles).toEqual([1]);                                           // club 1 plays twice
    expect(feed[0].blanks).toEqual([4]);                                            // club 4 does not play
    expect(feed[0].matchCount).toBe(2);
  });

  it("collects postponed matches (no gameweek) at the end instead of dropping them", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1), fx(2, { event: null, kickoff_time: null })]);
    expect(feed.map((g) => g.gw)).toEqual([1, null]);
    expect(feed[1].name).toMatch(/postponed/i);
    expect(feed[1].blanks).toEqual([]);
  });

  it("marks a gameweek finished, live or upcoming from the event", () => {
    const feed = buildFixtureFeed([event(1, { finished: true }), event(2, { is_current: true }), event(3)], teams, [fx(1), fx(2, { event: 2 }), fx(3, { event: 3 })]);
    expect(feed.map((g) => g.status)).toEqual(["finished", "live", "upcoming"]);
  });

  it("copes with a fixture for an event the bootstrap doesn't list", () => {
    const feed = buildFixtureFeed([event(1)], teams, [fx(1, { event: 9 })]);
    expect(feed[0]).toMatchObject({ gw: 9, name: "Gameweek 9", deadline: null, status: "upcoming" });
  });

  it("is empty for an empty schedule, and never mutates its input", () => {
    expect(buildFixtureFeed([event(1)], teams, [])).toEqual([]);
    const input = [fx(2), fx(1)];
    buildFixtureFeed([event(1)], teams, input);
    expect(input.map((f) => f.id)).toEqual([2, 1]);
  });
});

describe("feedStartIndex", () => {
  const feed = buildFixtureFeed(
    [event(1, { finished: true }), event(2, { finished: true }), event(3, { is_current: true }), event(4)],
    teams,
    [1, 2, 3, 4].map((gw) => fx(gw, { event: gw })),
  );
  it("opens on the first gameweek that isn't over", () => expect(feedStartIndex(feed, null)).toBe(2));
  it("opens on the one asked for", () => expect(feedStartIndex(feed, 1)).toBe(0));
  it("ignores a gameweek that doesn't exist", () => expect(feedStartIndex(feed, 30)).toBe(2));
  it("opens on the last gameweek when the season is over", () => {
    const over = feed.map((g) => ({ ...g, status: "finished" as const }));
    expect(feedStartIndex(over, null)).toBe(3);
  });
  it("copes with an empty feed", () => expect(feedStartIndex([], 3)).toBe(0));
});
