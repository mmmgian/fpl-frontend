import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Crest } from "@/components/ui";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { TripSwitch } from "@/components/ui/TripSwitch";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { MESSAGES } from "@/lib/domain/i18n";
import { LOCALES } from "@/lib/domain/i18n/locales";
import { TRIP_TIPS, interviewContext, pickTrip, tripContext, tripTips, type InterviewInput, type InterviewPlayer } from "@/lib/domain/interview";
import { isTripCookie, tripAvatar } from "@/lib/domain/trip";
import { upsidePicks } from "@/lib/domain/upside";
import { createMascotGateway } from "@/lib/mascots";
import psychedelic from "@/lib/mascots/psychedelic.json";
import { createTeamService } from "@/lib/services/team";
import type { TeamModel } from "@/lib/services/models";
import { bootstrap } from "./fixtures";
import { clock, fakeFpl } from "./support";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TeamHeader } from "@/components/views/TeamHeader";
import { initLocale } from "@/app/locale";
import { testLanguage } from "./language";

// ----------------------------------------------------------------------------------------------- the switch and its cookie

describe("the altered view's address book", () => {
  it("reads only the value it sets", () => {
    expect(isTripCookie("1")).toBe(true);
    for (const v of [undefined, "", "0", "true", "on", "11"]) expect(isTripCookie(v)).toBe(false);
  });
  it("turns our avatars into the psychedelic ones, in the same size, and leaves every other address alone", () => {
    expect(tripAvatar("/avatars/2379133-s.webp?v=abc123")).toBe("/psychedelic/2379133-s.webp");
    expect(tripAvatar("/avatars/2379133.webp")).toBe("/psychedelic/2379133.webp");
    for (const src of ["https://example.com/b.png", "/avatars/../x.webp", "/avatars/abc.webp", "/mascots/1-press.webp"]) expect(tripAvatar(src)).toBe(src);
  });
  it("has all three sizes of all 21 psychedelic mascots on disk", () => {
    const gateway = createMascotGateway();
    for (const id of Object.keys(psychedelic.managers)) {
      for (const f of [`${id}.webp`, `${id}-s.webp`, `${id}-l.webp`]) expect(existsSync(join(process.cwd(), "public", "psychedelic", f)), f).toBe(true);
      expect(gateway.scenes(Number(id))?.trip?.src, id).toContain(`/psychedelic/${id}-l.webp`);
    }
  });
  it("is switched on by the cookie, on the request", async () => {
    testLanguage.trip = "1";
    await initLocale();
    const { isTrip } = await import("@/components/ui");
    expect(isTrip()).toBe(true);
    testLanguage.trip = undefined;
    await initLocale();
    expect(isTrip()).toBe(false);
  });
});

describe("Crest in the altered view", () => {
  it("shows the psychedelic avatar, small in tables and large in headers", () => {
    setRequestTrip(true);
    const { container } = render(<><Crest src="/avatars/7.webp?v=abc" name="A" size={28} /><Crest src="/avatars/7.webp?v=abc" name="B" size={64} /></>);
    expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["/psychedelic/7-s.webp", "/psychedelic/7.webp"]);
  });
  it("is unchanged otherwise", () => {
    const { container } = render(<Crest src="/avatars/7.webp?v=abc" name="A" size={28} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/avatars/7-s.webp?v=abc");
  });
});

describe("TripSwitch", () => {
  it("is on the league table only, until the view is on", () => {
    // the test router says we are on "/", where the sun shows
    render(<TripSwitch on={false} />);
    expect(screen.getByRole("button", { name: "Try something strange" })).toHaveAttribute("aria-pressed", "false");
  });
  it("sets the cookie and reloads to turn it on, and clears it to turn it off", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload, protocol: "http:" }, configurable: true });
    const { unmount } = render(<TripSwitch on={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.cookie).toContain("lobster-trip=1");
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
    render(<TripSwitch on />);
    expect(screen.getByRole("button", { name: "Come back to normal" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button"));
    expect(document.cookie).not.toContain("lobster-trip=1");
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it.each(["es", "fr"] as const)("speaks %s", async (locale) => {
    const { clientEs } = await import("@/lib/domain/i18n/client/es");
    const { clientFr } = await import("@/lib/domain/i18n/client/fr");
    const c = locale === "es" ? clientEs : clientFr;
    expect(c.trip.enter).not.toBe("Try something strange");
    expect(c.trip.leave).not.toBe("Come back to normal");
  });
});

// ----------------------------------------------------------------------------------------------- the upside

describe("upsidePicks", () => {
  const el = (id: number, over: Record<string, unknown> = {}) => ({ id, web_name: `P${id}`, team: 1, element_type: 3, selected_by_percent: "5.0", ep_next: "6.0", form: "5.0", minutes: 900, now_cost: 60, status: "a", ...over });
  const world = (elements: unknown[]) => upsidePicks({ elements: elements as never, teams: bootstrap.teams });

  it("lists little-owned players by expected points, and not the crowd's, the injured or the unproven", () => {
    const u = world([el(1, { ep_next: "7.0" }), el(2, { ep_next: "8.0", selected_by_percent: "40.0" }), el(3, { ep_next: "9.0", status: "i" }), el(4, { ep_next: "9.5", minutes: 50 }), el(5, { ep_next: "6.5" }), el(6, { ep_next: "0.0" })]);
    expect(u.differentials.map((p) => p.id)).toEqual([1, 5]);
  });
  it("keeps armband gambles to strong expectations and fewer owners", () => {
    const u = world([el(1, { ep_next: "7.0", selected_by_percent: "20.0" }), el(2, { ep_next: "4.0", selected_by_percent: "3.0" }), el(3, { ep_next: "8.0", selected_by_percent: "30.0" })]);
    expect(u.captainGambles.map((p) => p.id)).toEqual([1]);
  });
  it("finds who the crowd is buying whose price has not moved", () => {
    const u = world([el(1, { transfers_in_event: 90_000 }), el(2, { transfers_in_event: 120_000, cost_change_event: 1 }), el(3, { transfers_in_event: 20_000 }), el(4, { transfers_in_event: 100, selected_by_percent: "50.0" })]);
    expect(u.risers.map((p) => p.id)).toEqual([1, 3]);
  });
  it("copes with an empty world and with junk numbers", () => {
    expect(world([])).toEqual({ differentials: [], captainGambles: [], risers: [] });
    expect(() => world([el(1, { ep_next: "x", selected_by_percent: undefined, form: "??" })])).not.toThrow();
  });
  it("never lists more than asked", () => {
    expect(upsidePicks({ elements: Array.from({ length: 40 }, (_, i) => el(i + 1, { ep_next: `${5 + i / 10}` })) as never, teams: bootstrap.teams }, 4).differentials).toHaveLength(4);
  });
});

// ----------------------------------------------------------------------------------------------- the altered conference

const pl = (over: Partial<InterviewPlayer> = {}): InterviewPlayer => ({
  name: "Player", pos: 3, club: "Chelsea", started: true, counted: true, captain: false, vice: false, minutes: 90, points: 4, multiplier: 1,
  goals: 0, assists: 0, xg: 0, xa: 0, bonus: 0, yellow: 0, red: 0, ownGoals: 0, penMissed: 0, saves: 0, cleanSheet: false, conceded: 0,
  price: 60, form: 4, ownership: 15, flag: null, defconReached: false, defconNear: false, ...over,
});
const upside = {
  differentials: [{ id: 1, name: "Diffy", teamId: 1, club: "BRE", clubCode: 94, positionId: 3 as const, ownership: 3.4, xp: 6.8, form: 6, price: 60, transfersIn: 100 }],
  captainGambles: [{ id: 2, name: "Gamble", teamId: 1, club: "ARS", clubCode: 3, positionId: 4 as const, ownership: 12, xp: 7.5, form: 7, price: 90, transfersIn: 100 }],
  risers: [{ id: 3, name: "Risey", teamId: 1, club: "CHE", clubCode: 8, positionId: 3 as const, ownership: 8, xp: 5.5, form: 6, price: 55, transfersIn: 150_000 }],
};
const input = (over: Partial<InterviewInput> = {}): InterviewInput => ({
  team: "Teamy FC", first: "Zed", manager: "Zed Qux", gw: "Gameweek 6", gwNumber: 6, points: 50, total: 300, hit: 4, transfers: 1, bank: 20, bankText: "£2.0m", settled: true,
  league: null, captain: null, bench: null, chip: null, flagged: null, autoSub: null, season: null,
  players: [pl({ name: "Cold", form: 1 }), pl({ name: "Ben", started: false, counted: false, flag: { kind: "out", label: "injured", chance: 0 } }), ...Array.from({ length: 4 }, (_, i) => pl({ name: `T${i}`, ownership: 50 }))],
  rotated: null, planet: { rank: 1_200_000, of: 10_000_000 }, rankMove: null, value: null, beat: null, freeTransfers: 3,
  outlook: { average: 2.5, hardest: "Hardton", easiest: "Easyton" }, upside, ...over,
});

describe("the tips", () => {
  const ids = (i: InterviewInput) => tripTips(i, interviewContext(i).templateCount).map((t) => t.id);

  it("always has a world-rank tip and a fallback, and the rest only when they apply", () => {
    expect(ids(input({ planet: null, upside: null, hit: 0, bank: 0, freeTransfers: 0, players: [], outlook: null }))).toEqual(["chaos"]);
    const all = ids(input());
    for (const t of ["diffBuy", "captainRoulette", "riser", "sellCold", "breakTemplate", "benchBuy", "bankIdle", "ftRoll", "easyRun", "worldClimb", "hitMath", "chaos"]) expect(all, t).toContain(t);
    expect([...TRIP_TIPS].sort()).toEqual([...new Set(all)].sort());
  });
  it("never recommends a player the team already owns", () => {
    const owns = input({ players: [pl({ name: "Diffy" }), pl({ name: "Gamble" }), pl({ name: "Risey" })] });
    const all = ids(owns);
    for (const t of ["diffBuy", "captainRoulette", "riser"]) expect(all, t).not.toContain(t);
  });
  it("names the player the tip is about in its words", () => {
    const tip = tripTips(input(), 4).find((t) => t.id === "diffBuy")!;
    const c = tripContext(interviewContext(input()), tip.pick);
    expect(c).toMatchObject({ upName: "Diffy", upClub: "BRE", upOwn: "3.4", upXp: "6.8" });
  });
});

describe("pickTrip", () => {
  const tips = tripTips(input(), 4);
  it("gives five different tips, the world-rank one among them, deterministically", () => {
    for (let seed = 0; seed < 100; seed++) {
      const xs = pickTrip(seed, tips, 10);
      expect(xs).toHaveLength(5);
      expect(new Set(xs.map((x) => x.tip)).size).toBe(5);
      expect(xs.map((x) => x.tip)).toContain("worldClimb");
      expect(new Set(xs.map((x) => x.opener)).size).toBe(5);
    }
    expect(pickTrip(9, tips, 10)).toEqual(pickTrip(9, tips, 10));
  });
  it("varies between managers and days", () => {
    expect(new Set(Array.from({ length: 60 }, (_, s) => pickTrip(s, tips, 10).map((x) => x.tip).join())).size).toBeGreaterThan(20);
  });
  it("gives fewer than five when there is less to advise on", () => {
    expect(pickTrip(1, [{ id: "chaos", weight: 20, pick: null }], 10)).toHaveLength(1);
  });
});

describe.each(LOCALES)("the altered conference's words in %s", (locale) => {
  const t = MESSAGES[locale].interview;
  const i = input();
  const c = (pick: (typeof upside.differentials)[number] | (typeof upside.captainGambles)[number] = upside.differentials[0]) => tripContext(interviewContext({ ...i, first: "Zed", manager: "Zed Qux", team: "Teamy FC" }), pick);
  const BAD = /undefined|NaN|\[object|\$\{|\{|\}|null/;

  it("has every tip in two wordings of question and answer, and three journalists", () => {
    expect(t.trip.askers).toHaveLength(3);
    for (const id of TRIP_TIPS) {
      expect(t.trip.tips[id].q, id).toHaveLength(2);
      expect(t.trip.tips[id].a, id).toHaveLength(2);
    }
  });
  it("reads well: no leftover placeholders, double spaces, stray punctuation or doubled names", () => {
    const problems: string[] = [];
    for (const id of TRIP_TIPS) {
      const lines: [string, (x: ReturnType<typeof c>) => string][] = [
        ...t.trip.tips[id].q.map((f, n) => [`q${n}`, f] as [string, (x: ReturnType<typeof c>) => string]),
        ...t.trip.tips[id].a.map((f, n) => [`a${n}`, f] as [string, (x: ReturnType<typeof c>) => string]),
      ];
      for (const [k, f] of lines) {
        const text = f(c());
        if (BAD.test(text)) problems.push(`${id}/${k}: ${text}`);
        if (/ {2}| ,| \.|,,|\?\?/.test(text)) problems.push(`${id}/${k} punctuation: ${text}`);
        if (k.startsWith("q") && !text.endsWith("?")) problems.push(`${id}/${k} not a question: ${text}`);
        if (k.startsWith("q") && locale === "es" && (text.match(/¿/g) ?? []).length !== (text.match(/\?/g) ?? []).length) problems.push(`${id}/${k} ¿?: ${text}`);
        if (k.startsWith("q")) for (const opener of t.openers) {
          const whole = opener(c(), text);
          if ((whole.match(/Zed/g) ?? []).length > 1 || (whole.match(/Teamy FC/g) ?? []).length > 1) problems.push(`${id}/${k} doubled name: ${whole}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
  it("speaks of the player it was given", () => {
    expect(t.trip.tips.diffBuy.a.map((f) => f(c())).every((s) => s.includes("Diffy"))).toBe(true);
    expect(t.trip.tips.captainRoulette.a.map((f) => f(c(upside.captainGambles[0]))).every((s) => s.includes("Gamble"))).toBe(true);
    expect(t.trip.tips.riser.a.map((f) => f(c(upside.risers[0]))).every((s) => s.includes("Risey"))).toBe(true);
  });
});

// ----------------------------------------------------------------------------------------------- the panel and tools

const svc = () =>
  createTeamService(fakeFpl({ entry: async () => ({ id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6, summary_overall_points: null, summary_overall_rank: null, summary_event_points: null }) }), { now: clock });
async function okModel(): Promise<Extract<TeamModel, { kind: "ok" }>> {
  const m = await svc().load(7, undefined);
  if (m.kind !== "ok") throw new Error("expected an ok model");
  return { ...m, team: { ...m.team, mascot: { action: { src: "/mascots/7-action.webp", width: 768, height: 768 }, press: { src: "/mascots/7-press.webp", width: 1200, height: 800 }, trip: { src: "/psychedelic/7-l.webp", width: 512, height: 512 } } } };
}

describe("InterviewPanel in the altered view", () => {
  it("becomes the Upside Oracle: psychedelic picture, tips instead of blunders, still named and accessible", async () => {
    setRequestTrip(true);
    const model = await okModel();
    model.insights.squad.upside = upside;
    const { container } = render(<InterviewPanel model={model} />);
    expect(screen.getByRole("heading", { level: 2, name: "The Upside Oracle" })).toBeInTheDocument();
    expect(container.querySelector("img[src='/psychedelic/7-l.webp']")).not.toBeNull();
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    for (const li of items) expect(li.textContent).toMatch(/Gian|Gaucho F\.C\.|[a-z]/);
    expect(container.textContent).toContain("Sneaky upside");
    expect(container.textContent).not.toMatch(/IQ 150|Snarky|Egotist/);
    expect(container.querySelectorAll("[data-answer='trip']").length).toBe(items.length);
    expect(container.textContent).toMatch(/Diffy|Gamble|Risey/);
  });
  it("is the ordinary conference when the view is off", async () => {
    const model = await okModel();
    render(<InterviewPanel model={model} />);
    expect(screen.getByRole("heading", { level: 2, name: "Press conference" })).toBeInTheDocument();
    expect(screen.queryByText("The Upside Oracle")).toBeNull();
  });
  it.each(["es", "fr"] as const)("speaks %s", async (locale) => {
    const { setRequestLocale } = await import("@/components/ui/i18n");
    setRequestLocale(locale);
    setRequestTrip(true);
    const model = await okModel();
    model.insights.squad.upside = upside;
    render(<InterviewPanel model={model} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(MESSAGES[locale].interview.trip.heading);
  });
});

describe("the header in the altered view", () => {
  it("shows the psychedelic avatar", () => {
    setRequestTrip(true);
    const { container } = render(<TeamHeader team={{ entryId: 7, teamName: "Gaucho F.C.", firstName: "gian", lastName: "jaen", manager: "gian jaen", avatar: "/avatars/7.webp", mascot: null }} />);
    expect(container.querySelector("img[src='/psychedelic/7.webp']")).not.toBeNull();
  });
});
