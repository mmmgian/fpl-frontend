import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Crest } from "@/components/ui";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { TripSwitch } from "@/components/ui/TripSwitch";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { MESSAGES } from "@/lib/domain/i18n";
import { LOCALES } from "@/lib/domain/i18n/locales";
import { pickTripConference } from "@/lib/domain/tripConference";
import { ALL_TOPICS, TRIP_TIPS, TRIP_VOICES, TRIP_GENERAL_LINES, TRIP_VOICE_LINES, candidatesOf, interviewContext, pickTrip, tripContext, tripTips, type InterviewInput, type InterviewPlayer } from "@/lib/domain/interview";
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
const richTrip = (): InterviewInput => ({
  ...input(),
  first: "Zed", manager: "Zed Qux", team: "Teamy FC",
  league: { rank: 13, size: 21, points: 380, leader: { team: "Leady FC", points: 443 }, up: { team: "Upton FC", points: 388 }, down: { team: "Downe FC", points: 374 }, moved: -3 },
  captain: { name: "Capt", base: 2, state: "played", bestName: "Besto", bestBase: 12, regret: 20 }, bench: { points: 14, top: { name: "Benchy", points: 6 }, counted: false },
  chip: { code: "3xc", label: "Triple Captain", points: 3 }, flagged: { name: "Hurt", label: "injured" }, autoSub: { out: "Outy", in: "Inny", inPoints: 7, outPoints: 0 },
  season: { average: 66, benchPoints: 52, hitPoints: 12 }, rotated: { name: "Rotato" }, rankMove: { from: 400_000, to: 800_000 }, value: { now: 1022, start: 1000 }, beat: { weeks: 1, of: 5 }, transfers: 3,
  players: [
    pl({ name: "Keepy", pos: 1, club: "Arsenal", points: 1, saves: 7, cleanSheet: true, conceded: 1 }),
    pl({ name: "Defa", pos: 2, club: "Chelsea", points: 8, goals: 1, cleanSheet: true, defconReached: true, form: 6 }),
    pl({ name: "Defb", pos: 2, club: "Chelsea", points: 0, yellow: 2, red: 1, ownGoals: 1, conceded: 4, defconNear: true }),
    pl({ name: "Defc", pos: 2, club: "Chelsea", points: 2, cleanSheet: true, defconReached: true }),
    pl({ name: "Mida", pos: 3, club: "Everton", points: 14, multiplier: 2, captain: true, goals: 3, assists: 2, xg: 1.4, flag: { kind: "doubt", label: "doubtful", chance: 50 }, ownership: 5 }),
    pl({ name: "Midb", pos: 3, club: "Everton", points: 1, price: 130, xg: 1.2, penMissed: 1, ownership: 45, form: 1.5 }),
    pl({ name: "Midc", pos: 3, club: "Brighton", points: 3, vice: true }),
    pl({ name: "Fwda", pos: 4, club: "Spurs", points: 6, ownership: 8, flag: { kind: "out", label: "injured", chance: 0 }, minutes: 0 }),
    pl({ name: "Gkb", pos: 1, started: false, counted: false, points: 0, minutes: 0 }),
    pl({ name: "Benchy", pos: 3, started: false, counted: false, points: 6, form: 8, flag: { kind: "out", label: "injured", chance: 0 } }),
  ],
});
const cand = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id, name, teamId: 1, club: "ARS", clubCode: 3, positionId: 3 as const, ownership: 9, price: 70, opponents: [], mean: 6.4, p10: 0.27, p15: 0.08, differential: true, ...over });
const lab = {
  gw: 7,
  captain: { byMean: [cand(11, "Meany")], byHaul: [cand(12, "Hauly")], byCeiling: [cand(13, "Ceily", { p15: 0.12 })], inSquad: [cand(14, "Mine", { mean: 7.1, ownership: 30 })] },
  rotation: [{ clubs: ["BRE", "WOL"] as [string, string], average: 2.2, perGw: [] }],
  penalties: [{ id: 21, name: "Penny", teamId: 1, club: "CRY", clubCode: 31, positionId: 3 as const, ownership: 12, price: 65, xp: 5.4 }],
  suspensions: [{ id: 22, name: "Cardy", teamId: 1, club: "BHA", clubCode: 36, positionId: 2 as const, ownership: 20, price: 50, xp: 4, yellows: 4, threshold: 5, toBan: 1 }],
  defcon: [{ id: 23, name: "Tacky", teamId: 1, club: "AVL", clubCode: 7, positionId: 2 as const, ownership: 6, price: 48, xp: 4.1, per90: 9, share: 0.9 }],
};
const input = (over: Partial<InterviewInput> = {}): InterviewInput => ({
  lab,
  team: "Teamy FC", first: "Zed", manager: "Zed Qux", gw: "Gameweek 6", gwNumber: 6, points: 50, total: 300, hit: 4, transfers: 1, bank: 20, bankText: "£2.0m", settled: true,
  league: null, captain: null, bench: null, chip: null, flagged: null, autoSub: null, season: null,
  players: [pl({ name: "Cold", form: 1 }), pl({ name: "Ben", started: false, counted: false, flag: { kind: "out", label: "injured", chance: 0 } }), ...Array.from({ length: 4 }, (_, i) => pl({ name: `T${i}`, ownership: 50 }))],
  rotated: null, planet: { rank: 1_200_000, of: 10_000_000 }, rankMove: null, value: null, beat: null, freeTransfers: 3,
  outlook: { average: 2.5, hardest: "Hardton", easiest: "Easyton" }, upside, ...over,
});

describe("pickTripConference", () => {
  const cands = candidatesOf(input({ league: { rank: 7, size: 21, points: 380, leader: { team: "L", points: 443 }, up: { team: "U", points: 385 }, down: { team: "D", points: 375 }, moved: 3 }, captain: { name: "C", base: 1, state: "played", bestName: "B", bestBase: 12, regret: 20 } }));
  const tips = tripTips(input(), 4);
  const run = (seed: number, slot = seed) => pickTripConference(seed, cands, tips, { slot, seed: 9 });

  it("is four questions about the week and one tip, in a mixed order, in distinct voices and openers", () => {
    for (let seed = 0; seed < 200; seed++) {
      const xs = run(seed);
      expect(xs).toHaveLength(5);
      expect(xs.filter((x) => x.kind === "topic")).toHaveLength(4);
      expect(xs.filter((x) => x.kind === "tip")).toHaveLength(1);
      const voices = xs.flatMap((x) => (x.kind === "topic" ? [x.voice] : []));
      expect(new Set(voices).size).toBe(4);
      expect(new Set(xs.map((x) => x.opener)).size).toBe(5);
      expect(xs.every((x) => x.opener >= 0 && x.opener < 10)).toBe(true);
    }
  });
  it("is deterministic, varies between managers, and moves the order around", () => {
    expect(run(5)).toEqual(run(5));
    expect(new Set(Array.from({ length: 100 }, (_, s) => JSON.stringify(run(s).map((x) => (x.kind === "tip" ? x.tip : x.topic))))).size).toBeGreaterThan(60);
    expect(new Set(Array.from({ length: 60 }, (_, s) => run(s).map((x) => x.kind).join())).size).toBe(5); // the one tip lands anywhere
  });
  it("uses every voice, and every line of it, across enough managers", () => {
    const used = new Map<string, Set<number>>();
    for (let slot = 0; slot < 400; slot++) for (const x of run(slot, slot)) if (x.kind === "topic") used.set(x.voice, (used.get(x.voice) ?? new Set()).add(x.line));
    expect([...used.keys()].sort()).toEqual([...TRIP_VOICES].sort());
    for (const lines of used.values()) expect(lines.size).toBe(TRIP_VOICE_LINES);
  });
  it("talks about what was asked most of the time", () => {
    let about = 0;
    let all = 0;
    for (let slot = 0; slot < 300; slot++) for (const x of run(slot, slot)) if (x.kind === "topic") { all++; if (x.line >= TRIP_GENERAL_LINES) about++; }
    expect(about / all).toBeGreaterThan(0.5);
    expect(about / all).toBeLessThan(0.7);
  });
  it("gives managers of one league different lines from the same voice", () => {
    const lineOf = (slot: number, voice: string) => run(slot * 3 + 1, slot).flatMap((x) => (x.kind === "topic" && x.voice === voice && x.line < TRIP_GENERAL_LINES ? [x.line] : []))[0];
    const seen = new Map<number, number>();
    for (let slot = 1; slot <= TRIP_GENERAL_LINES; slot++) {
      const l = lineOf(slot, "onion");
      if (l === undefined) continue;
      expect(seen.has(l), `slot ${slot}`).toBe(false);
      seen.set(l, slot);
    }
  });
  it("copes with nothing to ask about or to advise on", () => {
    const xs = pickTripConference(1, [], [{ id: "chaos", weight: 1, subject: null }], { slot: 3, seed: 1 });
    expect(xs.length).toBeGreaterThanOrEqual(1);
    expect(xs.length).toBeLessThanOrEqual(5);
  });
});

describe("the tips", () => {
  const ids = (i: InterviewInput) => tripTips(i, interviewContext(i).templateCount).map((t) => t.id);

  it("always has a fallback, and the rest only when they apply", () => {
    expect(ids(input({ planet: null, upside: null, lab: null, hit: 0, bank: 0, freeTransfers: 0, players: [], outlook: null }))).toEqual(["chaos"]);
  });
  it("has a tip for everything the lab and the season can say", () => {
    const withCard = input({ players: [...input().players, pl({ name: "Cardy" })] });
    const all = ids(withCard);
    expect([...TRIP_TIPS].sort()).toEqual([...new Set(all)].sort());
  });
  it("only warns about a suspension for a player the team owns, and never recommends back an owned player", () => {
    expect(ids(input())).not.toContain("suspensionDanger");
    expect(ids(input({ players: [pl({ name: "Cardy" })] }))).toContain("suspensionDanger");
    const owns = ids(input({ players: ["Penny", "Tacky", "Ceily"].map((name) => pl({ name })) }));
    for (const t of ["penaltyTaker", "defconBanker", "haulHunter"]) expect(owns, t).not.toContain(t);
  });
  it("offers a rank target only while there is a door above", () => {
    expect(ids(input({ planet: { rank: 40_000, of: 10_000_000 } }))).not.toContain("rankTarget");
    expect(ids(input({ planet: { rank: 6_000_000, of: 10_000_000 } }))).toContain("rankTarget");
  });
  it("quotes the simulation for the squad's best armband and the mega-haul pick", () => {
    const tips = tripTips(input(), 4);
    const sim = tips.find((t) => t.id === "captainSim")!.subject!;
    expect(sim).toMatchObject({ name: "Mine", xp: 7.1, p10: 0.27 });
    expect(tips.find((t) => t.id === "haulHunter")!.subject).toMatchObject({ name: "Ceily", p15: 0.12 });
    expect(tripContext(interviewContext(input()), sim)).toMatchObject({ upName: "Mine", upXp: "7.1", upP10: "27", upP15: "8" });
    expect(tips.find((t) => t.id === "rotationPair")!.subject).toMatchObject({ name: "BRE", club: "WOL", xp: 2.2 });
    expect(tripContext(interviewContext(input()), tips.find((t) => t.id === "defconBanker")!.subject)).toMatchObject({ upNote: "90" });
  });
  it("knows the next percentile door", () => {
    expect(interviewContext(input({ planet: { rank: 6_000_000, of: 10_000_000 } }))).toMatchObject({ goalTop: 50, goalRank: "5000000" });
    expect(interviewContext(input({ planet: { rank: 1_200_000, of: 10_000_000 } }))).toMatchObject({ goalTop: 10, goalRank: "1000000" });
    expect(interviewContext(input({ planet: { rank: 20_000, of: 10_000_000 } })).goalTop).toBe(0);
  });
  it("never recommends a player the team already owns", () => {
    const owns = input({ players: [pl({ name: "Diffy" }), pl({ name: "Gamble" }), pl({ name: "Risey" })] });
    const all = ids(owns);
    for (const t of ["diffBuy", "captainRoulette", "riser"]) expect(all, t).not.toContain(t);
  });
  it("names the player the tip is about in its words", () => {
    const tip = tripTips(input(), 4).find((t) => t.id === "diffBuy")!;
    const c = tripContext(interviewContext(input()), tip.subject);
    expect(c).toMatchObject({ upName: "Diffy", upClub: "BRE", upOwn: "3.4", upXp: "6.8" });
  });
});

describe("pickTrip", () => {
  const tips = tripTips(input(), 4);
  it("gives up to the number of different tips asked for, deterministically", () => {
    for (let seed = 0; seed < 100; seed++) {
      const xs = pickTrip(seed, tips, 10);
      expect(xs).toHaveLength(5);
      expect(new Set(xs.map((x) => x.tip)).size).toBe(5);
      expect(pickTrip(seed, tips, 10, 1)).toHaveLength(1);
      expect(new Set(xs.map((x) => x.opener)).size).toBe(5);
    }
    expect(pickTrip(9, tips, 10)).toEqual(pickTrip(9, tips, 10));
  });
  it("varies between managers and days", () => {
    expect(new Set(Array.from({ length: 60 }, (_, s) => pickTrip(s, tips, 10).map((x) => x.tip).join())).size).toBeGreaterThan(20);
  });
  it("gives fewer than five when there is less to advise on", () => {
    expect(pickTrip(1, [{ id: "chaos", weight: 20, subject: null }], 10)).toHaveLength(1);
  });
});

describe.each(LOCALES)("the altered conference's words in %s", (locale) => {
  const t = MESSAGES[locale].interview;
  const i = input();
  const subjectOf = (p: { name: string; club: string; ownership: number; xp: number }) => ({ name: p.name, club: p.club, ownership: p.ownership, xp: p.xp });
  const c = (pick: (typeof upside.differentials)[number] | (typeof upside.captainGambles)[number] = upside.differentials[0]) =>
    tripContext(interviewContext({ ...i, first: "Zed", manager: "Zed Qux", team: "Teamy FC" }), { ...subjectOf(pick), p10: 0.27, p15: 0.08, note: "2" });
  const BAD = /undefined|NaN|\[object|\$\{|\{|\}|null/;

  it("has every tip in two wordings of question and answer, and three journalists", () => {
    expect(t.trip.askers).toHaveLength(5);
    expect(t.trip.flourishes).toHaveLength(8);
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
        if (/ {2}| ,| \.|,,|\?\?|(^|[^\d])\s%|\(\)/.test(text)) problems.push(`${id}/${k} punctuation: ${text}`);
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
  it("has a gist of every topic for the voices to talk about, written from the facts and reading well", () => {
    const rich = interviewContext(richTrip());
    const problems: string[] = [];
    for (const id of ALL_TOPICS) {
      const g = t.trip.gist[id]?.(rich);
      if (!g) { problems.push(`${id}: no gist`); continue; }
      if (BAD.test(g) || / {2}| ,|\(\)|(^|[^\d])\s%/.test(g) || g.trim() !== g) problems.push(`${id}: ${g}`);
    }
    expect(problems).toEqual([]);
  });
  it("reads well when a voice talks about each topic's gist", () => {
    const rich = interviewContext(richTrip());
    const problems: string[] = [];
    for (const id of ALL_TOPICS) {
      const g = t.trip.gist[id](rich);
      for (const v of TRIP_VOICES) for (const f of t.trip.voices[v]) {
        const line = f(rich, g);
        if (/ {2}| ,|,,|\?\?|\(\)|(^|[^\d])\s%/.test(line)) problems.push(`${id}/${v}: ${line}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });
  it("has four voices of twenty-eight different lines, and ten different ways to introduce a question", () => {
    expect(Object.keys(t.trip.voiceNames).sort()).toEqual([...TRIP_VOICES].sort());
    expect(t.trip.openers).toHaveLength(10);
    for (const v of TRIP_VOICES) {
      const lines = t.trip.voices[v].map((f) => f(c(), "a made-up gist"));
      expect(lines, v).toHaveLength(TRIP_VOICE_LINES);
      expect(new Set(lines).size, v).toBe(TRIP_VOICE_LINES);
      for (const line of lines) {
        expect(line, `${v}: ${line}`).not.toMatch(BAD);
        expect(line, `${v}: ${line}`).not.toMatch(/ {2}| ,| \.|,,|\?\?|\(\)/);
        expect(line.trim()).toBe(line);
      }
    }
    expect(new Set(t.trip.openers.map((o) => o(c(), "Q?"))).size).toBe(10);
    for (const o of t.trip.openers) expect(/Zed|Teamy FC/.test(o(c(), "Q?"))).toBe(true);
  });
  it("is not a list of tips: the voices answer with the mood, using only the numbers every team has", () => {
    const names = ["upName", "upClub", "upOwn", "upXp", "upP10", "upP15", "upNote", "goalTop", "goalRank", "captain", "hit", "flagged"];
    const bare = { ...interviewContext(i), ...Object.fromEntries(names.map((n) => [n, "\u2205"])) };
    for (const v of TRIP_VOICES) for (const f of t.trip.voices[v]) expect(f(bare, "a made-up gist"), v).not.toContain("\u2205");
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
  it("becomes the Acid Test: psychedelic picture, four questions about the week in strange voices, one sneaky tip", async () => {
    setRequestTrip(true);
    const model = await okModel();
    model.insights.squad.upside = upside;
    const { container } = render(<InterviewPanel model={model} />);
    expect(screen.getByRole("heading", { level: 2, name: "The Acid Test" })).toBeInTheDocument();
    expect(container.querySelector("img[src='/psychedelic/7-l.webp']")).not.toBeNull();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    const kinds = [...container.querySelectorAll("[data-answer]")].map((e) => e.getAttribute("data-answer"));
    expect(kinds.filter((k) => k === "trip")).toHaveLength(1); // only one of five is a tip
    const voices = kinds.filter((k) => k !== "trip");
    expect(voices).toHaveLength(4);
    expect(new Set(voices).size).toBe(4);
    for (const v of voices) expect(["onion", "hofmann", "atomic", "lifesci"]).toContain(v);
    expect(container.textContent).toContain("Sneaky upside");
    expect(container.textContent).not.toMatch(/IQ 150|Snarky|Egotist/);
    expect(container.textContent).toMatch(/Satirical wire|The Chemist|The Physicist|The Life Scientist/);
  });
  it("is the ordinary conference when the view is off", async () => {
    const model = await okModel();
    render(<InterviewPanel model={model} />);
    expect(screen.getByRole("heading", { level: 2, name: "Press conference" })).toBeInTheDocument();
    expect(screen.queryByText("The Acid Test")).toBeNull();
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
