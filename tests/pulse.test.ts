import { describe, expect, it } from "vitest";
import { MATCH_MS, matchPulse, refreshPlan, type PulseFixture } from "@/lib/domain";

const at = (iso: string) => new Date(iso);
const fx = (event: number | null, kickoff_time: string | null, finished = false): PulseFixture => ({ event, kickoff_time, finished });
const SAT = [fx(8, "2026-10-17T11:30:00Z"), fx(8, "2026-10-17T14:00:00Z"), fx(8, "2026-10-19T19:00:00Z"), fx(9, "2026-10-24T14:00:00Z")];

describe("matchPulse", () => {
  it("is between before the first kick-off, pointing at it", () => {
    const p = matchPulse(SAT, 8, at("2026-10-16T12:00:00Z"));
    expect(p).toEqual({ state: "between", nextKickoff: "2026-10-17T11:30:00.000Z", playing: 0 });
  });
  it("is playing from kick-off until the match window ends", () => {
    expect(matchPulse(SAT, 8, at("2026-10-17T11:30:00Z")).state).toBe("playing");
    expect(matchPulse(SAT, 8, at("2026-10-17T11:30:00Z")).playing).toBe(1);
    expect(matchPulse(SAT, 8, at("2026-10-17T14:30:00Z")).playing).toBe(1); // the 11:30 match is long over
    expect(matchPulse([fx(8, "2026-10-17T14:00:00Z"), fx(8, "2026-10-17T14:00:00Z")], 8, at("2026-10-17T14:30:00Z")).playing).toBe(2);
    expect(matchPulse(SAT, 8, new Date(Date.parse("2026-10-17T11:30:00Z") + MATCH_MS - 1)).state).toBe("playing");
  });
  it("is between again in the gap, with the next kick-off ahead", () => {
    const p = matchPulse(SAT, 8, at("2026-10-18T10:00:00Z"));
    expect(p.state).toBe("between");
    expect(p.nextKickoff).toBe("2026-10-19T19:00:00.000Z");
  });
  it("is over once the last window has passed, and ignores other gameweeks", () => {
    expect(matchPulse(SAT, 8, at("2026-10-19T23:00:00Z")).state).toBe("over");
    expect(matchPulse(SAT, 8, at("2026-10-19T23:00:00Z")).nextKickoff).toBeNull();
  });
  it("does not count a match FPL already marked finished", () => {
    expect(matchPulse([fx(8, "2026-10-17T11:30:00Z", true)], 8, at("2026-10-17T12:30:00Z")).state).toBe("over");
  });
  it("has no opinion without dated matches (postponed, null, junk) or an empty schedule", () => {
    expect(matchPulse([], 8, at("2026-10-17T12:00:00Z")).state).toBe("none");
    expect(matchPulse([fx(8, null), fx(8, "not a date"), fx(null, "2026-10-17T11:30:00Z")], 8, at("2026-10-17T12:00:00Z")).state).toBe("none");
  });
});

describe("refreshPlan", () => {
  const now = at("2026-10-16T12:00:00Z");
  const minute = 60_000;
  it("never refreshes when nothing can change by itself", () => {
    expect(refreshPlan("final", null, now)).toBeNull();
    expect(refreshPlan("upcoming", null, now)).toBeNull();
  });
  it("refreshes every minute while a match is on, or when the schedule is unknown", () => {
    expect(refreshPlan("live", { state: "playing", nextKickoff: null, playing: 1 }, now)).toBe(minute);
    expect(refreshPlan("live", null, now)).toBe(minute);
    expect(refreshPlan("live", { state: "none", nextKickoff: null, playing: 0 }, now)).toBe(minute);
  });
  it("sleeps through a quiet gap, waking two minutes before the next kick-off, within one and fifteen minutes", () => {
    const next = (mins: number) => ({ state: "between" as const, nextKickoff: new Date(now.getTime() + mins * minute).toISOString(), playing: 0 });
    expect(refreshPlan("live", next(600), now)).toBe(15 * minute);
    expect(refreshPlan("live", next(10), now)).toBe(8 * minute);
    expect(refreshPlan("live", next(2), now)).toBe(minute);
    expect(refreshPlan("live", next(-5), now)).toBe(minute);
  });
  it("slows to five minutes while waiting for FPL's sign-off", () => {
    expect(refreshPlan("live", { state: "over", nextKickoff: null, playing: 0 }, now)).toBe(5 * minute);
    expect(refreshPlan("provisional", null, now)).toBe(5 * minute);
  });
});
