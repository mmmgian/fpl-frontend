/** The shared world is only useful if the real pages render from it in every phase. */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHASES, install, requested, season, textOf, uninstall, type PhaseName } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

const page = async (el: Promise<React.ReactElement>) => textOf(renderToStaticMarkup(await el));

describe.each(PHASES)("the world at %s", (phase: PhaseName) => {
  it("serves a league page and a team page without errors, and nothing it asks for is missing", async () => {
    install(season(phase));
    const league = await page((await import("@/app/page")).default());
    expect(league).toContain("The Lobster League");
    const team = await page((await import("@/app/team/[entryId]/page")).default({ params: Promise.resolve({ entryId: "gaucho-f-c" }), searchParams: Promise.resolve({}) }));
    expect(team).toContain("Gaucho F.C.");
    expect(team + league).not.toMatch(/undefined|NaN|\[object/);
    expect(requested.length).toBeGreaterThan(0);
  });
});

describe("the world is coherent", () => {
  it("adds up: the manager's net points are the squad's points with multipliers, minus the hit", () => {
    const w = season("final");
    const gaucho = w.managers.find((m) => m.entry === 7)!;
    expect(gaucho.hit).toBe(4);
    expect(gaucho.net).toBe(gaucho.gross - 4);
    expect(w.standings.find((r) => r.entry === 7)!.event_total).toBe(gaucho.net);
    expect(w.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("is identical every time", () => {
    expect(JSON.stringify(season("provisional").standings)).toBe(JSON.stringify(season("provisional").standings));
  });
});
