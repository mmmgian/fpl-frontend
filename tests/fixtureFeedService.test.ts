import { describe, expect, it, vi } from "vitest";
import { createFixturesService } from "@/lib/services/fixtures";
import type { FplEvent, FplTeam, ScheduledFixture } from "@/lib/domain/types";

const teams: FplTeam[] = [1, 2].map((id) => ({ id, code: 100 + id, name: `Club ${id}`, short_name: id === 2 ? "" : `C${id}` }));
const events: FplEvent[] = [1, 2, 3].map((id) => ({
  id, name: `Gameweek ${id}`, deadline_time: `2026-10-0${id}T10:00:00Z`, is_current: id === 2, is_next: id === 3, finished: id === 1, data_checked: id === 1,
}));
const schedule: ScheduledFixture[] = [1, 2, 3].map((gw) => ({
  id: gw, event: gw, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 3, kickoff_time: `2026-10-0${gw}T14:00:00Z`, started: false, finished: false, finished_provisional: false,
}));

const svc = (over: Partial<{ events: FplEvent[]; schedule: ScheduledFixture[] }> = {}) =>
  createFixturesService({
    bootstrap: async () => ({ events: over.events ?? events, teams, elements: [] }),
    allFixtures: async () => over.schedule ?? schedule,
  });

describe("fixtures service: the season feed", () => {
  it("opens on the current gameweek and lists the whole season", async () => {
    const m = await svc().feed(undefined);
    expect(m.kind).toBe("ok");
    if (m.kind !== "ok") return;
    expect(m.gameweeks.map((g) => g.gw)).toEqual([1, 2, 3]);
    expect(m.startIndex).toBe(1);
    expect(m.windows).toEqual([3, 5, 10]);
  });

  it("opens on the gameweek asked for, and ignores one that makes no sense", async () => {
    const at = async (gw: string | string[] | undefined) => {
      const m = await svc().feed(gw);
      return m.kind === "ok" ? m.startIndex : -1;
    };
    expect(await at("3")).toBe(2);
    expect(await at(["3", "1"])).toBe(2);
    for (const junk of ["abc", "0", "-1", "99", "", "2.5", "1e1"]) expect(await at(junk), junk).toBe(1);
  });

  it("describes each club once, by id, with a fallback when FPL gives no short name", async () => {
    const m = await svc().feed(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.teams[1]).toEqual({ id: 1, name: "Club 1", short: "C1", code: 101 });
    expect(m.teams[2].short).toBe("Club 2");
  });

  it("produces plain data that can be sent to the browser as JSON", async () => {
    const m = await svc().feed(undefined);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it("says there is no season when FPL lists no gameweeks", async () => {
    expect(await svc({ events: [] }).feed(undefined)).toEqual({ kind: "no-season" });
  });

  it("returns an empty feed when the schedule is empty", async () => {
    const m = await svc({ schedule: [] }).feed(undefined);
    expect(m).toMatchObject({ kind: "ok", gameweeks: [], startIndex: 0 });
  });

  it("lets a failure from FPL reach the caller (so the error page shows)", async () => {
    const failing = createFixturesService({ bootstrap: async () => { throw new Error("down"); }, allFixtures: vi.fn() });
    await expect(failing.feed(undefined)).rejects.toThrow("down");
  });
});
