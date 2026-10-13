import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { interviewInputOf } from "@/components/views/interviewInput";
import { setRequestLocale } from "@/components/ui/i18n";
import {
  ALL_TOPICS, ANSWER_KINDS, ASK_KINDS, EXCHANGES, FILLER_TOPICS, FULL_TOPICS, GENERIC_ANSWERS, GROUP_TOPICS, INTERVIEW_MOODS, OPENERS, OPENERS_AFTER_ANOTHER, OPENER_LAST, PHASE_OPENERS, SAME_FACT, SPECIFIC_ANSWERS, VOICE_LINES, VOICE_TOPICAL_LINES,
  candidatesOf, interviewContext, interviewMood, interviewSeed, neatName, pickInterview, type Candidate, type InterviewInput, type InterviewPlayer, type TopicId,
} from "@/lib/domain/interview";
import { varietyKey } from "@/lib/domain";
import { MESSAGES } from "@/lib/domain/i18n";
import { LOCALES } from "@/lib/domain/i18n/locales";
import { createMascotGateway } from "@/lib/mascots";
import manifest from "@/lib/mascots/manifest.json";
import { createTeamService } from "@/lib/services/team";
import type { TeamModel } from "@/lib/services/models";
import { expectNoAxeViolations } from "./axe";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { clock, fakeFpl } from "./support";

// ----------------------------------------------------------------------------------------------- what to ask about

/** A player who did nothing: tests change only what they care about. */
const pl = (over: Partial<InterviewPlayer> = {}): InterviewPlayer => ({
  name: "Player", pos: 3, club: "Chelsea", started: true, counted: true, captain: false, vice: false, minutes: 90, points: 4, multiplier: 1,
  goals: 0, assists: 0, xg: 0, xa: 0, bonus: 0, yellow: 0, red: 0, ownGoals: 0, penMissed: 0, saves: 0, cleanSheet: false, conceded: 0,
  price: 60, form: 4, ownership: 15, flag: null, defconReached: false, defconNear: false, ...over,
});
const base = (over: Partial<InterviewInput> = {}): InterviewInput => ({
  team: "Gaucho F.C.", first: "Gian", manager: "Gian Jaen", gw: "Gameweek 6", gwNumber: 6, points: 60, total: 433, hit: 0, transfers: 1, bank: 5, bankText: "£0.5m", settled: true,
  players: [], rotated: null, planet: null, rankMove: null, value: null, beat: null, freeTransfers: null, outlook: null, upside: null, lab: null,
  league: { rank: 8, size: 21, points: 380, leader: { team: "Bart's Team", points: 443 }, up: { team: "Up FC", points: 385 }, down: { team: "Down FC", points: 375 }, moved: 0 },
  captain: null, bench: null, chip: null, flagged: null, autoSub: null, season: null, ...over,
});
const topics = (i: InterviewInput) => candidatesOf(i).map((c) => c.topic).sort();
const has = (i: InterviewInput, t: string) => topics(i).includes(t as never);
const league = (over: Partial<NonNullable<InterviewInput["league"]>>) => base().league && { ...base().league!, ...over };

describe("what there is to ask about", () => {
  it("always has something to say about the league position, and nothing else for a team with no blunders", () => {
    expect(candidatesOf(base()).every((c) => c.group === "position")).toBe(true);
    expect(candidatesOf(base({ league: null }))).toEqual([]);
  });

  it("asks about a captain who blanked (3 or fewer, with a much better player in the XI), not about a small difference", () => {
    const cap = (base_: number, regret: number | null, state: "played" | "waiting" | "unused" = "played") => ({ name: "Haaland", base: base_, state, bestName: "Salah", bestBase: base_ + 5, regret });
    expect(has(base({ captain: cap(2, 10) }), "captainBlank")).toBe(true);
    expect(has(base({ captain: cap(2, 4) }), "captainBlank")).toBe(false);
    expect(has(base({ captain: cap(9, 12) }), "captainBlank")).toBe(false);
    expect(has(base({ captain: cap(9, 12) }), "captainRegret")).toBe(true);
    expect(has(base({ captain: cap(9, 6) }), "captainRegret")).toBe(false);
    expect(has(base({ captain: cap(0, null, "unused") }), "captainUnused")).toBe(true);
    expect(has(base({ captain: cap(0, null, "waiting") }), "captainUnused")).toBe(false);
  });

  it("waits for the gameweek to be settled before judging scores, but not for what is already certain", () => {
    const live = base({
      settled: false, points: 40, hit: 4, flagged: { name: "Isak", label: "injured" },
      captain: { name: "Haaland", base: 1, state: "played", bestName: "Salah", bestBase: 12, regret: 22 },
      bench: { points: 14, top: { name: "Kinsky", points: 6 }, counted: false },
      chip: { code: "3xc", label: "Triple Captain", points: 2 }, autoSub: { out: "A", in: "B", inPoints: 6, outPoints: 0 },
      season: { average: 70, benchPoints: 50, hitPoints: 12 },
    });
    expect(topics(live).filter((t) => !(GROUP_TOPICS.position as readonly string[]).includes(t))).toEqual(["hitTaken", "injuredStarter", "seasonBench", "seasonHits"].sort());
    const done = { ...live, settled: true };
    for (const t of ["captainBlank", "benchHaul", "chipFlop", "autoSubbed", "badWeek"]) expect(has(done, t), t).toBe(true);
  });

  it("asks about the bench only when the points were left there, and a chip only when it flopped", () => {
    expect(has(base({ bench: { points: 14, top: { name: "K", points: 6 }, counted: false } }), "benchHaul")).toBe(true);
    expect(has(base({ bench: { points: 14, top: { name: "K", points: 6 }, counted: true } }), "benchHaul")).toBe(false);
    expect(has(base({ bench: { points: 3, top: { name: "K", points: 3 }, counted: false } }), "benchHaul")).toBe(false);
    expect(has(base({ chip: { code: "3xc", label: "Triple Captain", points: 6 } }), "chipFlop")).toBe(true);
    expect(has(base({ chip: { code: "3xc", label: "Triple Captain", points: 14 } }), "chipFlop")).toBe(false);
    expect(has(base({ chip: { code: "bboost", label: "Bench Boost", points: 8 } }), "chipFlop")).toBe(true);
    expect(has(base({ chip: { code: "bboost", label: "Bench Boost", points: 20 } }), "chipFlop")).toBe(false);
    expect(has(base({ chip: { code: "wildcard", label: "Wildcard", points: 0 } }), "chipFlop")).toBe(false);
  });

  it("asks about hits, a bad week, a heavy bench or a lot of money doing nothing only past a threshold", () => {
    expect(has(base({ hit: 4 }), "hitTaken")).toBe(true);
    expect(has(base({ hit: 0 }), "hitTaken")).toBe(false);
    expect(has(base({ points: 40, season: { average: 60, benchPoints: 0, hitPoints: 0 } }), "badWeek")).toBe(true);
    expect(has(base({ points: 50, season: { average: 60, benchPoints: 0, hitPoints: 0 } }), "badWeek")).toBe(false);
    expect(has(base({ season: { average: 60, benchPoints: 40, hitPoints: 8 } }), "seasonBench")).toBe(true);
    expect(has(base({ season: { average: 60, benchPoints: 39, hitPoints: 7 } }), "seasonHits")).toBe(false);
    expect(has(base({ bank: 20 }), "idleBank")).toBe(true);
    expect(has(base({ bank: 19 }), "idleBank")).toBe(false);
  });

  it("puts the league leader, the chasers, the middle, the drop zone and last place in the right topics", () => {
    const at = (rank: number, over = {}) => topics(base({ league: league({ rank, points: 380, ...over }) }));
    expect(at(1, { leader: { team: "Me", points: 380 }, down: { team: "D", points: 370 } })).toContain("leader");
    expect(at(1, { leader: { team: "Me", points: 380 }, down: { team: "D", points: 380 } })).not.toContain("leader");
    expect(at(3)).toContain("chasing");
    expect(at(3, { leader: { team: "L", points: 380 } })).not.toContain("chasing"); // level with the leader: nothing to chase
    expect(at(10)).toContain("midtable");
    expect(at(10)).not.toContain("chasing");
    expect(at(19)).toContain("dropzone");
    expect(at(21)).toContain("lastPlace");
    expect(at(21)).not.toContain("dropzone");
  });

  it("mentions neighbours only when they are actually apart, and near enough to matter", () => {
    const at = (up: number, down: number) => topics(base({ league: league({ up: { team: "U", points: 380 + up }, down: { team: "D", points: 380 - down } }) }));
    expect(at(5, 5)).toEqual(expect.arrayContaining(["looksUp", "looksBack"]));
    expect(at(0, 0)).not.toEqual(expect.arrayContaining(["looksUp"]));
    expect(at(0, 0)).not.toEqual(expect.arrayContaining(["looksBack"]));
    expect(at(40, 40)).not.toContain("looksUp");
    expect(at(40, 40)).not.toContain("looksBack");
  });

  it("notices a climb or a fall of two places or more", () => {
    expect(topics(base({ league: league({ moved: 3 }) }))).toContain("climber");
    expect(topics(base({ league: league({ moved: -2 }) }))).toContain("faller");
    const small = topics(base({ league: league({ moved: 1 }) }));
    expect(small).not.toContain("climber");
    expect(small).not.toContain("faller");
  });

  it("weights bigger blunders higher", () => {
    const w = (regret: number) => candidatesOf(base({ captain: { name: "H", base: 1, state: "played", bestName: "S", bestBase: 20, regret } })).find((c) => c.topic === "captainBlank")!.weight;
    expect(w(20)).toBeGreaterThan(w(6));
  });
});

describe("what the squad, season and league give a conference to ask about", () => {
  const withPlayers = (...ps: Partial<InterviewPlayer>[]) => base({ players: [...ps.map((p) => pl(p)), ...Array.from({ length: 8 }, (_, i) => pl({ name: `Filler${i}` }))] });
  const bench = (p: Partial<InterviewPlayer>) => ({ started: false, counted: false, ...p });
  const flagged = { kind: "out" as const, label: "injured", chance: 0 };

  const cases: [string, InterviewInput][] = [
    ["injuredBench", withPlayers(bench({ name: "B", flag: flagged }))],
    ["squadInjuries", withPlayers({ flag: flagged }, { flag: flagged }, bench({ flag: { kind: "doubt", label: "doubtful", chance: 50 } }))],
    ["captainDoubt", withPlayers({ captain: true, flag: { kind: "doubt", label: "doubtful", chance: 50 } })],
    ["ghostStarter", withPlayers({ flag: flagged, minutes: 0 })],
    ["rotatedOut", base({ rotated: { name: "R" }, players: [pl()] })],
    ["hatTrick", withPlayers({ goals: 3 })],
    ["brace", withPlayers({ goals: 2 })],
    ["defenderScored", withPlayers({ pos: 2, goals: 1 })],
    ["assistHaul", withPlayers({ assists: 2 })],
    ["blankAttack", withPlayers({ pos: 4 })],
    ["xgWaste", withPlayers({ xg: 1.1 })],
    ["luckyGoals", withPlayers({ goals: 3 }, { goals: 1 })],
    ["unluckyXg", withPlayers({ xg: 1.5 }, { xg: 1.0 })],
    ["penMiss", withPlayers({ penMissed: 1 })],
    ["ownGoal", withPlayers({ ownGoals: 1 })],
    ["captainHaul", withPlayers({ captain: true, points: 12, multiplier: 2 })],
    ["cleanSheets", withPlayers({ pos: 2, cleanSheet: true }, { pos: 2, cleanSheet: true }, { pos: 1, cleanSheet: true })],
    ["leakyDefence", withPlayers({ pos: 2, conceded: 4 }, { pos: 2, conceded: 3 })],
    ["keeperSaves", withPlayers({ pos: 1, saves: 6 })],
    ["keeperBlank", withPlayers({ pos: 1, points: 1 })],
    ["redCard", withPlayers({ red: 1 })],
    ["yellowFest", withPlayers({ yellow: 2 }, { yellow: 1 })],
    ["defconHaul", withPlayers({ defconReached: true }, { defconReached: true })],
    ["defconNear", withPlayers({ defconNear: true })],
    ["expensiveFlop", withPlayers({ price: 125, points: 1 })],
    ["templateBlank", withPlayers({ ownership: 45, points: 1 })],
    ["differentialHit", withPlayers({ ownership: 4, points: 9 })],
    ["coldStarter", withPlayers({ form: 1.2 })],
    ["hotBench", withPlayers(bench({ form: 7 }))],
    ["tripleUp", withPlayers({ club: "Spurs" }, { club: "Spurs" }, { club: "Spurs" })],
    ["formation", base({ players: [pl({ pos: 1 }), ...Array.from({ length: 3 }, () => pl({ pos: 2 })), ...Array.from({ length: 5 }, () => pl({ pos: 3 })), ...Array.from({ length: 2 }, () => pl({ pos: 4 }))] })],
    ["oneManShow", withPlayers({ points: 20, multiplier: 2, captain: true })],
    ["viceBetter", withPlayers({ captain: true, points: 2, multiplier: 2 }, { vice: true, points: 10 })],
    ["subSaved", base({ autoSub: { out: "A", in: "B", inPoints: 8, outPoints: 0 } })],
    ["toughRun", base({ players: [pl()], outlook: { average: 3.6, hardest: "Hardton", easiest: "Easyton" } })],
    ["rankRise", base({ rankMove: { from: 400_000, to: 200_000 } })],
    ["rankFall", base({ rankMove: { from: 200_000, to: 400_000 } })],
    ["planetTop", base({ planet: { rank: 50_000, of: 10_000_000 } })],
    ["planetLow", base({ planet: { rank: 7_000_000, of: 10_000_000 } })],
    ["valueUp", base({ value: { now: 1010, start: 1000 } })],
    ["valueDown", base({ value: { now: 995, start: 1000 } })],
    ["beatLow", base({ beat: { weeks: 1, of: 5 } })],
    ["beatHigh", base({ beat: { weeks: 5, of: 5 } })],
    ["noTransfers", base({ transfers: 0 })],
    ["bigRevamp", base({ transfers: 4 })],
    ["ftBanked", base({ transfers: 0, freeTransfers: 4 })],
    // the moment
    ["captainWaiting", base({ phase: "live", captain: { name: "C", base: 0, state: "waiting", bestName: "B", bestBase: 0, regret: 0 } })],
    ["stillToPlay", base({ phase: "live", remaining: { count: 4, effective: 3 } })],
    ["bonusPending", { ...withPlayers({ bonus: 2 }), phase: "provisional" }],
    ["finalVerdict", base({ phase: "final" })],
    ["nextCaptain", base({ phase: "final", ahead: { gw: "Gameweek 7", captain: { name: "N", xp: 6.1, p10: 0.3 }, fixture: null } })],
    ["nextFixture", base({ phase: "final", ahead: { gw: "Gameweek 7", captain: null, fixture: { name: "F", opponent: "ARS (A)", difficulty: 5 } } })],
    ["nextTransfers", base({ phase: "final", freeTransfers: 1, ahead: { gw: "Gameweek 7", captain: null, fixture: null } })],
    ["nextFlag", { ...withPlayers({ flag: flagged }), phase: "final", ahead: { gw: "Gameweek 7", captain: null, fixture: null } }],
  ];

  it.each(cases)("asks about %s when it happened", (topic, input) => {
    expect(has({ ...input, settled: true }, topic), topic).toBe(true);
  });

  it("covers every topic that can be asked about", () => {
    const covered = new Set(cases.map(([t]) => t));
    const elsewhere = new Set<string>(["captainBlank", "captainRegret", "captainUnused", "benchHaul", "hitTaken", "autoSubbed", "chipFlop", "badWeek", "injuredStarter", "idleBank", "seasonBench", "seasonHits", ...GROUP_TOPICS.position]);
    for (const t of FULL_TOPICS) expect(covered.has(t) || elsewhere.has(t), t).toBe(true);
  });

  it("asks about the moment only in its moment: live, provisional bonus, the verdict, the next deadline", () => {
    const ahead = { gw: "Gameweek 7", captain: { name: "N", xp: 6.1, p10: 0.3 }, fixture: { name: "F", opponent: "ARS (A)", difficulty: 5 } };
    const all = (phase: InterviewInput["phase"]) => {
      const i = { ...withPlayers({ bonus: 2, flag: flagged }), phase, ahead, freeTransfers: 2, remaining: { count: 5, effective: 4 }, captain: { name: "C", base: 0, state: "waiting" as const, bestName: "B", bestBase: 0, regret: 0 } };
      return topics(i).filter((t) => (GROUP_TOPICS.phase as readonly string[]).includes(t));
    };
    expect(all("live")).toEqual(["captainWaiting", "stillToPlay"]);
    expect(all("provisional")).toEqual(["bonusPending", "nextCaptain", "nextFixture", "nextFlag", "nextTransfers"]);
    expect(all("final")).toEqual(["finalVerdict", "nextCaptain", "nextFixture", "nextFlag", "nextTransfers"]);
    expect(all(undefined)).toEqual(["nextCaptain", "nextFixture", "nextFlag", "nextTransfers"]);
    // No next deadline (the season's last gameweek): nothing about it.
    expect(topics(base({ phase: "final", freeTransfers: 2, ahead: null })).filter((t) => t.startsWith("next"))).toEqual([]);
  });

  it("knows the conference's mood: live, provisional, then the next deadline once FPL signs off (or the verdict at the season's end)", () => {
    expect(interviewMood("live", true)).toBe("live");
    expect(interviewMood("provisional", true)).toBe("provisional");
    expect(interviewMood("final", true)).toBe("ahead");
    expect(interviewMood("final", false)).toBe("final");
    expect(interviewMood("upcoming", false)).toBe("ahead");
  });

  it("does not ask about it when it did not happen", () => {
    const quiet = base({ players: [pl({ club: "A" }), pl({ pos: 1, points: 6, club: "B" }), pl({ pos: 4, goals: 1, club: "C" }), pl({ pos: 3, club: "D" })], transfers: 1, value: { now: 1004, start: 1000 }, beat: { weeks: 3, of: 5 }, planet: { rank: 3_000_000, of: 10_000_000 }, rankMove: { from: 400_000, to: 380_000 } });
    const asked = topics(quiet).filter((t) => !(GROUP_TOPICS.position as readonly string[]).includes(t));
    expect(asked).toEqual([]);
  });

  it("waits for the gameweek to finish before saying a player or an attack failed", () => {
    const live = (i: InterviewInput) => ({ ...i, settled: false });
    for (const [topic, input] of cases.filter(([t]) => ["blankAttack", "xgWaste", "luckyGoals", "unluckyXg", "cleanSheets", "leakyDefence", "keeperBlank", "defconHaul", "defconNear", "expensiveFlop", "templateBlank", "oneManShow", "viceBetter", "ghostStarter", "rotatedOut", "captainHaul", "subSaved"].includes(t))) {
      expect(has(live(input), topic), topic).toBe(false);
    }
  });

  it("asks the moment it happens about things that cannot be undone", () => {
    const live = (i: InterviewInput) => ({ ...i, settled: false });
    for (const [topic, input] of cases.filter(([t]) => ["hatTrick", "brace", "defenderScored", "penMiss", "ownGoal", "redCard", "captainDoubt", "injuredBench", "coldStarter"].includes(t))) {
      expect(has(live(input), topic), topic).toBe(true);
    }
  });

  it("fills every field of the context from a team where everything happened, and names the right player", () => {
    const c = interviewContext(richInput());
    const tipOnly = new Set(["upName", "upClub", "upOwn", "upXp", "upP10", "upP15", "upNote", "goalTop", "goalRank"]); // filled only for the altered conference's tip
    for (const [key, value] of Object.entries(c)) {
      if (tipOnly.has(key)) continue;
      expect(value === "" || value === 0, `${key} is empty`).toBe(false);
    }
    expect(c).toMatchObject({
      scorer: "Mida", scorerGoals: 3, defScorer: "Defa", assister: "Mida", assisterAssists: 2, redPlayer: "Defb", penPlayer: "Midb", ownPlayer: "Defb",
      gk: "Keepy", gkSaves: 7, expensive: "Midb", expensivePrice: "£13.0m", template: "Midb", diff: "Mida", cold: "Midb", hotBench: "Benchy", benchFlagged: "Benchy",
      trioClub: "Chelsea", trioCount: 3, formation: "3-3-3", csCount: 3, defconCount: 2, defconNear: "Defb", ghost: "Fwda", captainFlag: "doubtful", flaggedCount: 3,
      valueDelta: "£2.2m", rankPct: 88, hardClub: "Hardton", runAvg: "3.6",
      remaining: 4, bonusPts: 6, nextGw: "Gameweek 7", nextCaptain: "Nexto", nextCaptainXp: "6.4", nextCaptainP10: 31, nextPlayer: "Fwdb", nextOpp: "ARS (A)", nextFdr: 5,
    });
  });

  it("formats numbers the reader's way", () => {
    const c = interviewContext(richInput(), { money: (t) => `${t / 10} M`, oneDecimal: (n) => n.toFixed(1).replace(".", ","), number: (n) => n.toLocaleString("fr-FR") });
    expect(c.runAvg).toBe("3,6");
    expect(c.expensivePrice).toBe("13 M");
    expect(c.rankFrom).toMatch(/400\D000/);
  });

  it("does not claim a double gameweek's DefCon (the mapper decides, the domain only counts what it is told)", () => {
    expect(interviewContext(withPlayers({ defconReached: false })).defconCount).toBe(0);
  });
});

// ----------------------------------------------------------------------------------------------- dealing the conference

const rich = (): Candidate[] =>
  candidatesOf(base({
    hit: 8, bank: 30, flagged: { name: "Isak", label: "injured" },
    captain: { name: "Haaland", base: 1, state: "played", bestName: "Salah", bestBase: 12, regret: 22 },
    bench: { points: 14, top: { name: "Kinsky", points: 6 }, counted: false },
    chip: { code: "3xc", label: "Triple Captain", points: 2 }, autoSub: { out: "A", in: "B", inPoints: 6, outPoints: 0 },
    season: { average: 70, benchPoints: 50, hitPoints: 12 },
    league: league({ moved: 3 }),
  }));
const sets: [string, Candidate[]][] = [
  ["no facts at all", []],
  ["only a league position", candidatesOf(base())],
  ["a few facts", candidatesOf(base({ hit: 4, bank: 25 }))],
  ["lots of facts", rich()],
];

describe("pickInterview", () => {
  it.each(sets)("deals seven distinct questions to seven distinct voices, whatever there is to ask (%s)", (_name, cands) => {
    for (let seed = 0; seed < 300; seed++) {
      const xs = pickInterview(seed, cands);
      expect(xs, String(seed)).toHaveLength(EXCHANGES);
      expect(new Set(xs.map((x) => x.topic)).size, `topics ${seed}`).toBe(EXCHANGES);
      expect(new Set(xs.map((x) => x.answer)).size, `voices ${seed}`).toBe(EXCHANGES);
      expect(new Set(xs.map((x) => x.opener)).size, `openers ${seed}`).toBe(EXCHANGES);
      expect(xs.filter((x) => (SPECIFIC_ANSWERS as readonly string[]).includes(x.answer)).length, `specific ${seed}`).toBeGreaterThanOrEqual(2);
      expect(xs.every((x) => x.opener >= 0 && x.opener < OPENERS && x.line >= 0 && x.line < VOICE_LINES)).toBe(true);
    }
  });

  it("only asks about what the candidates say happened, plus timeless questions if there is too little", () => {
    const fillers = new Set<string>(Object.values(FILLER_TOPICS).flat());
    for (const [, cands] of sets) {
      const allowed = new Set<string>([...cands.map((c) => c.topic), ...fillers]);
      for (let seed = 0; seed < 100; seed++) for (const x of pickInterview(seed, cands)) expect(allowed.has(x.topic)).toBe(true);
    }
    for (let seed = 0; seed < 100; seed++) expect(pickInterview(seed, rich()).every((x) => !fillers.has(x.topic))).toBe(true);
  });

  it("leads with a blunder and then the league position whenever there is one to ask about", () => {
    const blunders = new Set<string>([...GROUP_TOPICS.blunder, ...GROUP_TOPICS.injury]);
    const positions = new Set<string>(GROUP_TOPICS.position);
    for (let seed = 0; seed < 200; seed++) {
      const xs = pickInterview(seed, rich());
      expect(xs.some((x) => blunders.has(x.topic))).toBe(true);
      expect(xs.some((x) => positions.has(x.topic))).toBe(true);
    }
  });

  // A team in each moment: the same week, asked about live, with the bonus provisional, and once FPL signs it off.
  const moment = (phase: "live" | "provisional" | "final") => candidatesOf(base({
    phase, hit: 4, bank: 25, freeTransfers: 2, remaining: phase === "live" ? { count: 5, effective: 4 } : null,
    captain: { name: "Haaland", base: phase === "live" ? 0 : 2, state: phase === "live" ? "waiting" : "played", bestName: "Salah", bestBase: 12, regret: 20 },
    players: [pl({ name: "Bon", bonus: 3 }), pl({ name: "Hurt", flag: { kind: "out", label: "injured", chance: 0 } }), ...Array.from({ length: 9 }, (_, k) => pl({ name: `F${k}` }))],
    ahead: phase === "live" ? null : { gw: "Gameweek 7", captain: { name: "Nexto", xp: 6.4, p10: 0.31 }, fixture: { name: "Fwdb", opponent: "ARS (A)", difficulty: 5 } },
    league: league({ moved: 3 }),
  }));

  it("always asks one question about the moment when there is one", () => {
    const phase = new Set<string>(GROUP_TOPICS.phase);
    for (const p of ["live", "provisional", "final"] as const) for (let seed = 0; seed < 200; seed++) {
      expect(pickInterview(seed, moment(p)).filter((x) => phase.has(x.topic)).length, `${p} ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("introduces some questions in the moment, when the moment's introductions are offered, keeping every rule", () => {
    let moodOnes = 0;
    for (let seed = 0; seed < 300; seed++) {
      const xs = pickInterview(seed, rich(), undefined, undefined, PHASE_OPENERS);
      expect(new Set(xs.map((x) => x.opener)).size, `openers ${seed}`).toBe(EXCHANGES);
      expect(xs.every((x) => x.opener >= 0 && x.opener < OPENERS + PHASE_OPENERS)).toBe(true);
      // the follow-up introductions are never first, the winding-up one only last
      expect(OPENERS_AFTER_ANOTHER.includes(xs[0].opener), `first ${seed}`).toBe(false);
      xs.slice(0, -1).forEach((x) => expect(x.opener, `last-only ${seed}`).not.toBe(OPENER_LAST));
      moodOnes += xs.filter((x) => x.opener >= OPENERS).length;
    }
    expect(moodOnes / 300, "mood introductions per conference").toBeGreaterThan(0.5);
    expect(moodOnes / 300).toBeLessThanOrEqual(PHASE_OPENERS);
  });

  it("has generic voices answer the question asked most of the time, with lines a league does not share", () => {
    let topical = 0;
    let generic = 0;
    for (let seed = 0; seed < 300; seed++) for (const x of pickInterview(seed, rich(), { slot: seed % 21, seed: 77 })) {
      if (!(GENERIC_ANSWERS as readonly string[]).includes(x.answer)) { expect(x.topical).toBe(-1); continue; }
      generic++;
      if (x.topical >= 0) { topical++; expect(x.topical).toBeLessThan(VOICE_TOPICAL_LINES); }
    }
    expect(topical / generic).toBeGreaterThan(0.5);
    expect(topical / generic).toBeLessThan(0.7);
  });

  it("is the same for the same inputs and redrawn when the day or the phase changes", () => {
    const deal = (phase: "live" | "provisional" | "final", day: number) => {
      const key = varietyKey(6, phase, new Date(day * 86_400_000 + 3_600_000));
      return JSON.stringify(pickInterview(interviewSeed(1234, 6, key), moment(phase), { slot: 8, seed: interviewSeed(0, 6, key) }));
    };
    for (const p of ["live", "provisional", "final"] as const) {
      expect(deal(p, 20000)).toBe(deal(p, 20000));
      expect(new Set([20000, 20001, 20002, 20003, 20004, 20005, 20006].map((d) => deal(p, d))).size, p).toBe(7);
    }
    expect(new Set(["live", "provisional", "final"].map((p) => deal(p as "live", 20000))).size).toBe(3);
  });

  const wide = (): Candidate[] => Object.entries(GROUP_TOPICS).flatMap(([group, topics]) => topics.map((topic) => ({ topic, group: group as Candidate["group"], weight: 50 })));
  const groupOf = (t: string) => Object.entries(GROUP_TOPICS).find(([, ts]) => (ts as readonly string[]).includes(t))?.[0];

  it("runs like a conversation: a headline first, the long view or a light one last, no area or style twice in a row", () => {
    let sameStyle = 0;
    for (let seed = 0; seed < 400; seed++) {
      const xs = pickInterview(seed, wide());
      expect(["position", "blunder", "injury"], `first ${seed}`).toContain(groupOf(xs[0].topic));
      expect(["season", "market", "phase"], `last ${seed}`).toContain(groupOf(xs[xs.length - 1].topic));
      expect(new Set(xs.map((x) => groupOf(x.topic))).size, `seven areas ${seed}`).toBe(EXCHANGES);
      for (let i = 1; i < xs.length; i++) if (xs[i].ask === xs[i - 1].ask) sameStyle++;
    }
    expect(sameStyle / 400, "style repeats per conference").toBeLessThan(0.05);
  });

  it("still keeps the same area from coming twice in a row when the team has fewer areas than questions", () => {
    let repeats = 0;
    let possible = 0;
    for (let seed = 0; seed < 400; seed++) {
      const xs = pickInterview(seed, rich());
      expect(["position", "blunder", "injury"], `first ${seed}`).toContain(groupOf(xs[0].topic));
      expect(["season", "market", "phase"], `last ${seed}`).toContain(groupOf(xs[xs.length - 1].topic));
      for (let i = 1; i < xs.length; i++) { possible++; if (groupOf(xs[i].topic) === groupOf(xs[i - 1].topic)) repeats++; }
    }
    expect(repeats / possible).toBeLessThan(0.03);
  });

  it("never asks about the same fact twice in one conference (the gap to the leader and the gap to the team above, ...)", () => {
    const all = [...sets.map(([, c]) => c), wide()];
    for (const cands of all) for (let seed = 0; seed < 300; seed++) {
      const topics = pickInterview(seed, cands).map((x) => x.topic as string);
      for (const set of SAME_FACT) expect(topics.filter((t) => set.includes(t)).length, `${set[0]}… ${seed}`).toBeLessThanOrEqual(1);
    }
  });
  it("asks one league question at most, however thin the rest of the team's week is", () => {
    const positions = new Set<string>(GROUP_TOPICS.position);
    for (const [, cands] of sets) for (let seed = 0; seed < 200; seed++) expect(pickInterview(seed, cands).filter((x) => positions.has(x.topic)).length).toBeLessThanOrEqual(1);
  });

  it("starts a thin conference with a headline too, and ends it on a timeless question", () => {
    const cands = candidatesOf(base({ hit: 4, bank: 25 }));
    const fillers = new Set<string>(Object.values(FILLER_TOPICS).flat());
    for (let seed = 0; seed < 200; seed++) {
      const xs = pickInterview(seed, cands);
      expect(fillers.has(xs[0].topic), `first ${seed}`).toBe(false);
      expect(new Set(xs.map((x) => x.topic)).size).toBe(EXCHANGES);
    }
  });

  it("puts the introductions where they make sense: none that leans on a previous answer first, the winding-up one only last", () => {
    let closing = 0;
    for (let seed = 0; seed < 500; seed++) {
      const xs = pickInterview(seed, rich());
      expect(OPENERS_AFTER_ANOTHER, `first ${seed}`).not.toContain(xs[0].opener);
      xs.forEach((x, i) => { if (x.opener === OPENER_LAST) { expect(i, `closing ${seed}`).toBe(xs.length - 1); closing++; } });
    }
    expect(closing / 500).toBeGreaterThan(0.35); // the winding-up one does get used, about half the time
    expect(closing / 500).toBeLessThan(0.65);
  });

  it("can deal fewer questions on request, for the altered conference to mix its own in", () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(pickInterview(seed, rich(), { slot: seed, seed: 0 }, 5)).toHaveLength(5);
      expect(new Set(pickInterview(seed, rich(), { slot: seed, seed: 0 }, 4).map((x) => x.answer)).size).toBe(4);
    }
  });

  it("asks the biggest blunder most often", () => {
    const cands: Candidate[] = [{ topic: "captainBlank", group: "blunder", weight: 95 }, { topic: "idleBank", group: "blunder", weight: 30 }, { topic: "midtable", group: "position", weight: 40 }];
    let big = 0;
    for (let seed = 0; seed < 400; seed++) if (pickInterview(seed, cands).some((x) => x.topic === "captainBlank")) big++;
    expect(big).toBe(400); // three candidates, seven questions: all of them are asked, the fillers make up the rest
    let first = 0;
    const pair: Candidate[] = [{ topic: "captainBlank", group: "blunder", weight: 95 }, { topic: "hitTaken", group: "blunder", weight: 56 }];
    for (let seed = 0; seed < 600; seed++) { const xs = pickInterview(seed, [...pair, { topic: "midtable", group: "position", weight: 40 }]); if (xs.length) first++; }
    expect(first).toBe(600);
  });

  it("spreads the question styles: a full set of real topics uses all three", () => {
    for (let seed = 0; seed < 200; seed++) {
      const xs = pickInterview(seed, rich());
      const count = Object.fromEntries(ASK_KINDS.map((k) => [k, xs.filter((x) => x.ask === k).length]));
      expect(Math.max(...Object.values(count)) - Math.min(...Object.values(count)), JSON.stringify(count)).toBeLessThanOrEqual(1);
    }
  });

  it("writes each question in a style the topic has", () => {
    const t = MESSAGES.en.interview.topics;
    for (const [, cands] of sets) for (let seed = 0; seed < 100; seed++) for (const x of pickInterview(seed, cands)) expect(t[x.topic].q[x.ask], `${x.topic} ${x.ask}`).toBeTypeOf("function");
  });

  it("is the same for the same seed, and differs across seeds in order, topics, voices and wording", () => {
    expect(pickInterview(42, rich())).toEqual(pickInterview(42, rich()));
    const seen = (f: (x: ReturnType<typeof pickInterview>) => string) => new Set(Array.from({ length: 200 }, (_, s) => f(pickInterview(s, rich())))).size;
    expect(seen((x) => x.map((e) => e.topic).join())).toBeGreaterThan(100);
    expect(seen((x) => x.map((e) => e.answer).join())).toBeGreaterThan(100);
    expect(seen((x) => x.map((e) => e.opener).join())).toBeGreaterThan(50);
  });

  it("uses every voice, and every topic, across enough seeds", () => {
    const voices = new Set<string>();
    const asked = new Set<string>();
    for (let seed = 0; seed < 600; seed++) for (const x of pickInterview(seed, rich())) { voices.add(x.answer); asked.add(x.topic); }
    expect([...voices].sort()).toEqual([...ANSWER_KINDS].sort());
    for (const c of rich()) expect(asked.has(c.topic), c.topic).toBe(true);
  });

  it("changes every day while the gameweek is live and never once it is over", () => {
    expect(interviewSeed(7, 6, 20000)).not.toBe(interviewSeed(7, 6, 20001));
    expect(interviewSeed(7, 6)).toBe(interviewSeed(7, 6, 0));
    expect(interviewSeed(1, 6)).not.toBe(interviewSeed(2, 6));
    expect(interviewSeed(1, 6)).not.toBe(interviewSeed(1, 7));
    const days = new Set(Array.from({ length: 7 }, (_, d) => JSON.stringify(pickInterview(interviewSeed(7, 6, 20000 + d), rich()).map((x) => x.topic))));
    expect(days.size).toBeGreaterThan(4);
  });

  it("gives different managers in the same league different conferences", () => {
    const seeds = Array.from({ length: 21 }, (_, i) => interviewSeed(1000 + i * 977, 6, 20000));
    const questions = seeds.flatMap((s) => pickInterview(s, rich()).map((x) => `${x.topic}/${x.ask}`));
    const firstQuestions = seeds.map((s) => pickInterview(s, rich())[0].topic);
    expect(new Set(firstQuestions).size).toBeGreaterThan(5);
    const whole = seeds.map((s) => JSON.stringify(pickInterview(s, rich())));
    expect(new Set(whole).size).toBe(21);
    expect(questions.length).toBe(21 * EXCHANGES);
  });
});

// ----------------------------------------------------------------------------------------------- a whole league

/** A repeatable pseudo-random generator for building twenty-one different managers. */
function lcg(seed: number) {
  let a = seed >>> 0;
  return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A believable gameweek for one manager: a random squad, captain, hit, flags, league place. */
function randomManager(i: number, settled: boolean): InterviewInput {
  const r = lcg(1000 + i * 7919);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const clubs = ["Arsenal", "Chelsea", "Man City", "Liverpool", "Spurs", "Everton", "Brighton", "Villa", "Fulham", "Leeds", "Wolves"];
  const names = ["Saka", "Haaland", "Salah", "Palmer", "Isak", "Watkins", "Gordon", "Foden", "Cole", "Raya", "Gabriel", "Konsa", "Pedro", "Semenyo", "Bruno", "Mbeumo"];
  const shape: (1 | 2 | 3 | 4)[] = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 1, 2, 3, 4];
  const players = shape.map((pos, k) => {
    const started = k < 11;
    const points = Math.floor(r() * r() * 14);
    const goals = pos >= 3 && r() < 0.15 ? 1 + Math.floor(r() * 2) : 0;
    return pl({
      name: `${pick(names)}${k}`, pos, club: pick(clubs), started, counted: started, captain: k === 5, vice: k === 6,
      multiplier: k === 5 ? 2 : started ? 1 : 0, points, goals, assists: r() < 0.05 ? 2 : 0, // a two-assist game is rare in real FPL (a few per gameweek across a 15-man squad at most) xg: Math.round(r() * r() * 15) / 10,
      yellow: r() < 0.1 ? 1 : 0, red: r() < 0.03 ? 1 : 0, cleanSheet: pos <= 2 && r() < 0.35, conceded: pos <= 2 ? Math.floor(r() * 3) : 0, saves: pos === 1 ? Math.floor(r() * 8) : 0,
      price: 40 + Math.floor(r() * 90), form: Math.round(r() * 90) / 10, ownership: Math.round(r() * 600) / 10,
      minutes: r() < 0.06 ? 0 : 90, flag: r() < 0.15 ? { kind: r() < 0.5 ? "out" : "doubt", label: pick(["injured", "doubtful", "suspended"]), chance: pick([0, 25, 50, 75]) } : null,
      defconReached: pos === 2 && r() < 0.2, defconNear: pos === 2 && r() < 0.1,
    });
  });
  const points = 30 + Math.floor(r() * 60);
  const rank = i + 1;
  return base({
    team: `Team ${i}`, first: pick(["Ana", "Ben", "Cris", "Dev", "Eli", "Fay", "Gus"]), manager: `Manager ${i}`, points, hit: r() < 0.3 ? 4 : 0, transfers: Math.floor(r() * 4), bank: Math.floor(r() * 40),
    bankText: "£1.0m", settled, players, rotated: r() < 0.1 ? { name: "Rota" } : null,
    league: { rank, size: 21, points: 400 - rank * 7 - Math.floor(r() * 6), leader: { team: "Team 0", points: 400 }, up: rank > 1 ? { team: `Team ${i - 1}`, points: 400 - (rank - 1) * 7 } : null, down: rank < 21 ? { team: `Team ${i + 1}`, points: 400 - (rank + 1) * 7 } : null, moved: Math.floor(r() * 9) - 4 },
    captain: { name: "Cap", base: Math.floor(r() * 14), state: "played", bestName: "Best", bestBase: 6 + Math.floor(r() * 12), regret: Math.floor(r() * 24) },
    bench: { points: Math.floor(r() * 20), top: { name: "Benchman", points: 1 + Math.floor(r() * 7) }, counted: false },
    chip: r() < 0.15 ? { code: "3xc", label: "Triple Captain", points: Math.floor(r() * 14) } : null,
    flagged: r() < 0.3 ? { name: "Hurt", label: "injured" } : null, autoSub: r() < 0.2 ? { out: "Outy", in: "Inny", inPoints: Math.floor(r() * 10), outPoints: 0 } : null,
    season: { average: 50 + Math.floor(r() * 25), benchPoints: Math.floor(r() * 70), hitPoints: Math.floor(r() * 16) },
    planet: { rank: 50_000 + Math.floor(r() * 9_000_000), of: 10_000_000 }, rankMove: { from: 100_000 + Math.floor(r() * 900_000), to: 100_000 + Math.floor(r() * 900_000) },
    value: { now: 995 + Math.floor(r() * 40), start: 1000 }, beat: { weeks: Math.floor(r() * 6), of: 5 }, freeTransfers: 1 + Math.floor(r() * 4),
    outlook: { average: 2.4 + r() * 1.6, hardest: pick(clubs), easiest: pick(clubs) },
  });
}

/** What the page shows for one manager, as plain text, the way InterviewPanel builds it. */
function conference(input: InterviewInput, entryId: number, locale: (typeof LOCALES)[number], day = 20000) {
  const t = MESSAGES[locale].interview;
  const c = interviewContext(input);
  const xs = pickInterview(interviewSeed(entryId, input.gwNumber, day), candidatesOf(input), { slot: input.league?.rank ?? entryId, seed: interviewSeed(0, input.gwNumber, day) });
  return xs.map((x) => {
    const topic = t.topics[x.topic];
    const q = t.openers[x.opener](c, (topic.q[x.ask] ?? Object.values(topic.q)[0]!)(c));
    const generic = x.answer as (typeof GENERIC_ANSWERS)[number];
    const a = (SPECIFIC_ANSWERS as readonly string[]).includes(x.answer)
      ? topic.a[x.answer as "genius" | "snarky" | "egotist"](c)
      : x.topical >= 0 ? t.voicesOn[generic][x.topical](c, t.trip.gist[x.topic](c)) : t.voices[generic][x.line](c);
    return { topic: x.topic, q, a, voice: x.answer };
  });
}


describe.each(["live", "settled"] as const)("a whole league of twenty-one different managers (%s gameweek)", (state) => {
  const managers = Array.from({ length: 21 }, (_, i) => randomManager(i, state === "settled"));
  it.each(LOCALES)("reads differently for each manager in %s", (locale) => {
    const all = managers.flatMap((m, i) => conference(m, 1000 + i * 977, locale));
    expect(all).toHaveLength(21 * EXCHANGES);
    // Almost every question and answer on the page is different from every other manager's (the topic answers of the
    // clever, snarky and egotist voices are written once per topic, so two managers asked the same topic can share one).
    expect(new Set(all.map((x) => x.q)).size).toBeGreaterThanOrEqual(Math.ceil(all.length * 0.98));
    expect(new Set(all.map((x) => x.a)).size).toBeGreaterThanOrEqual(Math.ceil(all.length * 0.9));
    // The questions are about many different things, none of which dominates.
    const byTopic = new Map<string, number>();
    for (const x of all) byTopic.set(x.topic, (byTopic.get(x.topic) ?? 0) + 1);
    expect(byTopic.size, [...byTopic.keys()].join()).toBeGreaterThanOrEqual(state === "settled" ? 38 : 30);
    expect(Math.max(...byTopic.values()), JSON.stringify([...byTopic])).toBeLessThanOrEqual(14);
    // Two managers share few topics: a quarter on average, and never more than five of the seven.
    const sets = managers.map((m, i) => new Set(conference(m, 1000 + i * 977, locale).map((x) => x.topic)));
    let total = 0;
    let pairs = 0;
    for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
      const shared = [...sets[a]].filter((t) => sets[b].has(t)).length;
      expect(shared, `${a} and ${b}`).toBeLessThanOrEqual(5);
      total += shared;
      pairs++;
    }
    expect(total / pairs / EXCHANGES).toBeLessThan(0.3);
  });

  it("changes from day to day", () => {
    const days = [20000, 20001, 20002].map((d) => managers.map((m, i) => conference(m, 1000 + i * 977, "en", d).map((x) => x.q).join("|")));
    for (let i = 0; i < 21; i++) expect(new Set(days.map((d) => d[i])).size, `manager ${i}`).toBe(3);
  });

  it("reads the same way every time on the same day", () => {
    expect(managers.map((m, i) => conference(m, 1000 + i * 977, "en"))).toEqual(managers.map((m, i) => conference(m, 1000 + i * 977, "en")));
  });
});

describe("lines for the generic voices across a league", () => {
  it("never repeats a generic line between two managers whose places in the table are less than a cycle apart", () => {
    for (const day of [20000, 20001, 20002]) for (const voice of GENERIC_ANSWERS) {
      const seen = new Map<number, number>();
      for (let rank = 1; rank <= 21; rank++) {
        const x = pickInterview(interviewSeed(1000 + rank * 977, 6, day), rich(), { slot: rank, seed: interviewSeed(0, 6, day) }).find((e) => e.answer === voice);
        if (!x) continue;
        const prior = seen.get(x.line);
        if (prior !== undefined) expect(rank - prior, `${voice} day ${day}`).toBeGreaterThanOrEqual(VOICE_LINES);
        seen.set(x.line, rank);
      }
    }
  });
});

describe("neatName", () => {
  it("capitalises lower-case names and leaves the rest alone", () => {
    expect(neatName("gian")).toBe("Gian");
    expect(neatName("danny lopez")).toBe("Danny Lopez");
    expect(neatName("  Neil  Patel-Hernandez ")).toBe("Neil Patel-Hernandez");
    expect(neatName("McKay")).toBe("McKay");
    expect(neatName("")).toBe("");
  });
});

// ----------------------------------------------------------------------------------------------- the words

/** A squad in which everything noteworthy happened, so every field of the context has something to say. */
const squad = (): InterviewPlayer[] => [
  pl({ name: "Keepy", pos: 1, club: "Arsenal", points: 1, saves: 7, cleanSheet: true, conceded: 1, price: 50 }),
  pl({ name: "Defa", pos: 2, club: "Chelsea", points: 8, goals: 1, cleanSheet: true, defconReached: true, form: 6 }),
  pl({ name: "Defb", pos: 2, club: "Chelsea", points: 0, yellow: 2, red: 1, ownGoals: 1, conceded: 4, defconNear: true }),
  pl({ name: "Defc", pos: 2, club: "Chelsea", points: 2, cleanSheet: true, conceded: 3, defconReached: true }),
  pl({ name: "Mida", pos: 3, club: "Everton", points: 14, multiplier: 2, captain: true, goals: 3, assists: 2, xg: 1.4, bonus: 3, flag: { kind: "doubt", label: "doubtful", chance: 50 }, ownership: 5 }),
  pl({ name: "Midb", pos: 3, club: "Everton", points: 1, price: 130, xg: 1.2, penMissed: 1, ownership: 45, form: 1.5, yellow: 1 }),
  pl({ name: "Midc", pos: 3, club: "Brighton", points: 3, vice: true }),
  pl({ name: "Fwda", pos: 4, club: "Spurs", points: 6, ownership: 8, flag: { kind: "out", label: "injured", chance: 0 }, minutes: 0 }),
  pl({ name: "Fwdb", pos: 4, club: "Leeds", points: 2 }),
  pl({ name: "Fwdc", pos: 4, club: "Fulham", points: 2 }),
  pl({ name: "Gkb", pos: 1, club: "Wolves", started: false, counted: false, points: 0, minutes: 0 }),
  pl({ name: "Benchy", pos: 3, club: "Villa", started: false, counted: false, points: 6, form: 8, flag: { kind: "out", label: "injured", chance: 0 } }),
  pl({ name: "Benchz", pos: 2, club: "Villa", started: false, counted: false, points: 2 }),
  pl({ name: "Benchw", pos: 4, club: "Villa", started: false, counted: false, points: 1 }),
  pl({ name: "Benchv", pos: 3, club: "Villa", started: false, counted: false, points: 0 }),
];

/** An input in which everything has happened. */
const richInput = (over: Partial<InterviewInput> = {}): InterviewInput =>
  base({
    first: "Zed", manager: "Zed Qux", team: "Teamy FC", gw: "Gameweek 6",
    league: league({ rank: 13, size: 21, points: 380, leader: { team: "Leady FC", points: 443 }, up: { team: "Upton FC", points: 388 }, down: { team: "Downe FC", points: 374 }, moved: -3 }),
    captain: { name: "Capt", base: 2, state: "played", bestName: "Besto", bestBase: 12, regret: 20 },
    bench: { points: 14, top: { name: "Benchy", points: 6 }, counted: false },
    chip: { code: "3xc", label: "Triple Captain", points: 3 }, hit: 4, flagged: { name: "Hurt", label: "injured" }, autoSub: { out: "Outy", in: "Inny", inPoints: 7, outPoints: 0 },
    season: { average: 66, benchPoints: 52, hitPoints: 12 }, bank: 25, bankText: "£2.5m",
    players: squad(), rotated: { name: "Rotato" }, planet: { rank: 1_200_000, of: 10_000_000 }, rankMove: { from: 400_000, to: 800_000 },
    value: { now: 1022, start: 1000 }, beat: { weeks: 1, of: 5 }, freeTransfers: 4, transfers: 3, outlook: { average: 3.6, hardest: "Hardton", easiest: "Easyton" },
    phase: "final", remaining: { count: 4, effective: 3 },
    ahead: { gw: "Gameweek 7", captain: { name: "Nexto", xp: 6.4, p10: 0.31 }, fixture: { name: "Fwdb", opponent: "ARS (A)", difficulty: 5 } },
    ...over,
  });
const ctx = (over: Partial<ReturnType<typeof interviewContext>> = {}) => ({ ...interviewContext(richInput()), ...over });
const BAD = /undefined|NaN|\[object|\$\{|\{|\}|null/;

describe.each(LOCALES)("the interview copy in %s", (locale) => {
  const t = MESSAGES[locale].interview;

  it("has every topic with the questions its kind needs and an answer for each of the three topic voices", () => {
    const fillerStyle = new Map<string, string>(ASK_KINDS.flatMap((k) => FILLER_TOPICS[k].map((id) => [id, k] as [string, string])));
    for (const id of ALL_TOPICS) {
      const topic = t.topics[id as TopicId];
      expect(topic, id).toBeDefined();
      const styles = Object.keys(topic.q).sort();
      expect(styles, id).toEqual(fillerStyle.has(id) ? [fillerStyle.get(id)] : [...ASK_KINDS].sort());
      for (const a of SPECIFIC_ANSWERS) expect(topic.a[a](ctx()).length, `${id} ${a}`).toBeGreaterThan(12);
    }
  });

  it("has the right number of openers and generic lines, all different", () => {
    expect(t.openers).toHaveLength(OPENERS);
    for (const g of GENERIC_ANSWERS) {
      expect(t.voices[g], g).toHaveLength(VOICE_LINES);
      const lines = t.voices[g].map((f) => f(ctx()));
      expect(new Set(lines).size, g).toBe(VOICE_LINES);
    }
    expect(Object.keys(t.answerers).sort()).toEqual([...ANSWER_KINDS].sort());
  });

  it("keeps the introductions that depend on position at the indexes the code expects: follow-ups never first, the winding-up one last", () => {
    const re: Record<string, Record<number, RegExp>> = {
      en: { 2: /^Back to/, 11: /^Moving on/, 13: /^Before you go/ },
      es: { 2: /^Volvamos a/, 11: /^Pasando a otro tema/, 13: /^Antes de que se vaya/ },
      fr: { 2: /^Revenons à/, 11: /^Passons à autre chose/, 13: /^Avant de vous laisser filer/ },
    };
    expect(OPENERS_AFTER_ANOTHER).toEqual([2, 11]);
    expect(OPENER_LAST).toBe(13);
    for (const k of [...OPENERS_AFTER_ANOTHER, OPENER_LAST]) expect(t.openers[k](ctx(), "Q?"), `opener ${k}`).toMatch(re[locale][k]);
    // None of the others leans on an earlier answer or winds up.
    t.openers.forEach((o, k) => { if (![...OPENERS_AFTER_ANOTHER, OPENER_LAST].includes(k)) expect(o(ctx(), "Q?"), `opener ${k}`).not.toMatch(/^(Back to|Moving on|Before you go|Volvamos|Pasando a otro|Antes de que se vaya|Revenons|Passons à|Avant de vous laisser)/); });
  });

  it("names the manager or the team in every opener, and no two openers read the same", () => {
    const outs = t.openers.map((o) => o(ctx(), "Q?"));
    for (const o of outs) expect(/Zed|Teamy FC/.test(o), o).toBe(true);
    expect(new Set(outs).size).toBe(OPENERS);
    expect(outs.some((o) => o.includes("Zed Qux"))).toBe(true);
    expect(outs.some((o) => o.includes("Teamy FC"))).toBe(true);
  });

  it("introduces questions in the conference's moment: three ways per mood, each naming the manager or the team once, all different", () => {
    expect(Object.keys(t.moodOpeners).sort()).toEqual([...INTERVIEW_MOODS].sort());
    const outs: string[] = [];
    for (const mood of INTERVIEW_MOODS) {
      expect(t.moodOpeners[mood], mood).toHaveLength(PHASE_OPENERS);
      for (const o of t.moodOpeners[mood]) {
        const text = o(ctx(), "Q?");
        outs.push(text);
        expect(/Zed|Teamy FC/.test(text), text).toBe(true);
        expect(text, text).not.toMatch(BAD);
        expect(text, text).not.toMatch(/ {2}| ,| \.|,,/);
        // no name twice, whatever the question says
        for (const id of ALL_TOPICS) for (const q of Object.values(t.topics[id as TopicId].q)) {
          const whole = o(ctx(), q!(ctx()));
          expect((whole.match(/Zed/g) ?? []).length, whole).toBeLessThanOrEqual(1);
          expect((whole.match(/Teamy FC/g) ?? []).length, whole).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(new Set([...outs, ...t.openers.map((o) => o(ctx(), "Q?"))]).size).toBe(outs.length + OPENERS);
  });

  it("lets every generic voice talk about the question asked, in lines that read well with any topic's gist", () => {
    const problems: string[] = [];
    for (const g of GENERIC_ANSWERS) {
      expect(t.voicesOn[g], g).toHaveLength(VOICE_TOPICAL_LINES);
      expect(new Set(t.voicesOn[g].map((f) => f(ctx(), "zebra stripes"))).size, g).toBe(VOICE_TOPICAL_LINES);
      for (const id of ALL_TOPICS) {
        const gist = t.trip.gist[id as TopicId](ctx());
        t.voicesOn[g].forEach((f, i) => {
          const line = f(ctx(), gist);
          if (BAD.test(line) || / {2}| ,| \.|,,|\?\?/.test(line) || line.trim() !== line) problems.push(`${g}/${i}/${id}: ${line}`);
          if (!line.includes(gist) && !line.includes(gist.charAt(0).toLocaleUpperCase() + gist.slice(1))) problems.push(`${g}/${i}/${id}: does not name the topic: ${line}`);
        });
      }
      // A line that leads with the gist starts with a capital.
      for (const f of t.voicesOn[g]) {
        const line = f(ctx(), "zebra stripes");
        if (line.toLowerCase().replace(/^[¿¡]/, "").startsWith("zebra")) expect(line, line).toMatch(/^[¿¡]?Zebra/);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it("says what each phase means in the lede and the note", () => {
    const ledes = (["live", "provisional", "final", "ahead"] as const).map((m) => t.lede("Zed Qux", "Teamy FC", "Gameweek 6", m, "Gameweek 7"));
    expect(new Set(ledes).size).toBe(4);
    for (const l of ledes) expect(l).toMatch(/Zed Qux.*Teamy FC.*6/);
    expect(ledes[3]).toContain("7");
    expect(t.lede("Zed Qux", "Teamy FC", "Gameweek 6", "ahead", "")).toBe(t.lede("Zed Qux", "Teamy FC", "Gameweek 6", "final"));
    expect(t.provisionalNote("Gameweek 6")).toContain("6");
    expect(t.provisionalNote("Gameweek 6").startsWith("*")).toBe(true);
    expect(t.finalNote("Gameweek 6")).toMatch(/FPL/);
    const trips = (["live", "provisional", "final", "ahead"] as const).map((m) => t.trip.lede("Zed Qux", "Teamy FC", "Gameweek 6", m, "Gameweek 7"));
    expect(new Set(trips).size).toBe(4);
  });

  it("reads well: whole questions and replies have no leftover placeholders, double spaces or stray punctuation", () => {
    const problems: string[] = [];
    const check = (label: string, text: string, question: boolean) => {
      if (BAD.test(text)) problems.push(`${label}: placeholder in "${text}"`);
      if (/ {2}| ,| \.|\.\.(?!\.)|,,|\?\?/.test(text)) problems.push(`${label}: stray punctuation in "${text}"`);
      if (text.trim() !== text) problems.push(`${label}: stray space in "${text}"`);
      if (question) {
        if (!text.endsWith("?")) problems.push(`${label}: does not end in a question mark: "${text}"`);
        if (locale === "es" && (text.match(/¿/g) ?? []).length !== (text.match(/\?/g) ?? []).length) problems.push(`${label}: ¿ and ? do not match: "${text}"`);
      }
    };
    for (const id of ALL_TOPICS) {
      const topic = t.topics[id as TopicId];
      for (const [kind, q] of Object.entries(topic.q)) for (const [i, opener] of t.openers.entries()) check(`${id}/${kind}/opener${i}`, opener(ctx(), q!(ctx())), true);
      for (const a of SPECIFIC_ANSWERS) check(`${id}/${a}`, topic.a[a](ctx()), false);
    }
    for (const g of GENERIC_ANSWERS) t.voices[g].forEach((f, i) => check(`${g}/${i}`, f(ctx()), false));
    expect(problems).toEqual([]);
  });

  it("does not say the manager's or the team's name twice in one question", () => {
    for (const id of ALL_TOPICS) {
      const topic = t.topics[id as TopicId];
      for (const q of Object.values(topic.q)) for (const opener of t.openers) {
        const text = opener(ctx(), q!(ctx()));
        expect((text.match(/Zed/g) ?? []).length, text).toBeLessThanOrEqual(1);
        expect((text.match(/Teamy FC/g) ?? []).length, text).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses the singular for one point, and the right ordinals", () => {
    const one = ctx({ captainPts: 1, chipPts: 1, points: 1, gapUp: 1, gapDown: 1, leaderGap: 1, beatWeeks: 1, expensivePts: 1, gkPts: 1 }); // the figures that can really be 1
    const wrong = locale === "en" ? /\b1 (points|wins|goals|assists|transfers|saves|cards|weeks)\b/ : locale === "es" ? /\b1 (puntos|victorias|goles|semanas)\b/ : /\b[01] (points|victoires|buts|semaines)\b/;
    const problems: string[] = [];
    const needsBig = new Set<string>(["captainHaul"]); // only asked when the captain scored ten or more
    for (const id of ALL_TOPICS) {
      if (needsBig.has(id)) continue;
      const topic = t.topics[id as TopicId];
      for (const q of Object.values(topic.q)) if (wrong.test(q!(one))) problems.push(`${id}: ${q!(one)}`);
      for (const a of SPECIFIC_ANSWERS) if (wrong.test(topic.a[a](one))) problems.push(`${id}/${a}: ${topic.a[a](one)}`);
    }
    for (const g of GENERIC_ANSWERS) t.voices[g].forEach((f) => wrong.test(f(one)) && problems.push(`${g}: ${f(one)}`));
    expect(problems).toEqual([]);
    const ordinal = (rank: number) => t.topics.midtable.q.genius!(ctx({ rank }));
    const expected: Record<string, [number, string][]> = {
      en: [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"]],
      es: [[1, "1.º"], [13, "13.º"], [21, "21.º"]],
      fr: [[1, "1er"], [2, "2e"], [13, "13e"], [21, "21e"]],
    };
    for (const [rank, text] of expected[locale]) expect(ordinal(rank), String(rank)).toContain(text);
  });

  it("explains the daily change in every phase", () => {
    expect(t.liveNote.startsWith("*")).toBe(true);
    expect(t.finalNote("Gameweek 6")).toContain("6");
    expect(JSON.stringify(t)).not.toMatch(/Invented|Inventada|Inventée|nobody was really asked/);
  });
});

// ----------------------------------------------------------------------------------------------- the panel

const svc = () => createTeamService(fakeFpl({ entry: async () => ({ id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6, summary_overall_points: null, summary_overall_rank: null, summary_event_points: null }) }), { now: clock });
async function okModel(gw?: string): Promise<Extract<TeamModel, { kind: "ok" }>> {
  const m = await svc().load(7, gw);
  if (m.kind !== "ok") throw new Error("expected an ok model");
  return m;
}
const withMascot = (m: Extract<TeamModel, { kind: "ok" }>, on = true): Extract<TeamModel, { kind: "ok" }> => ({
  ...m, team: { ...m.team, mascot: on ? { action: { src: "/mascots/7-action.webp", width: 768, height: 768 }, press: { src: "/mascots/7-press.webp?v=abc", width: 1200, height: 800 }, trip: { src: "/psychedelic/7-l.webp", width: 512, height: 512 } } : null },
});
const withLeague = (m: Extract<TeamModel, { kind: "ok" }>): Extract<TeamModel, { kind: "ok" }> => ({
  ...m, team: { ...m.team, league: { rank: 8, size: 21, points: 380, moved: -2, leader: { entryId: 1, slug: "barts-team", teamName: "Bart's Team", rank: 1, points: 443 }, prev: { entryId: 2, slug: "up-fc", teamName: "Up FC", rank: 7, points: 385 }, next: { entryId: 3, slug: "down-fc", teamName: "Down FC", rank: 9, points: 375 } } },
});
const text = (el: Element) => Array.from(el.querySelectorAll("li")).map((li) => li.textContent).join("|");

describe("InterviewPanel", () => {
  it("shows the press picture at its own size, with seven questions each followed by a reply", async () => {
    const { container } = render(<InterviewPanel model={withLeague(withMascot(await okModel()))} />);
    const img = container.querySelector("img[src^='/mascots/7-press']")!;
    expect(img).toHaveAttribute("width", "1200");
    expect(img).toHaveAttribute("height", "800");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.getAttribute("alt")).toMatch(/Gaucho F\.C\./);
    expect(screen.getByRole("heading", { level: 2, name: "Press conference" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Transcript" })).getAllByRole("listitem");
    expect(items).toHaveLength(EXCHANGES);
    for (const li of items) expect(li.querySelectorAll("p[class*=bubble]")).toHaveLength(2);
  });

  it("calls the manager and the team by name: in the lede and in the questions", async () => {
    const { container } = render(<InterviewPanel model={withLeague(withMascot(await okModel()))} />);
    expect(screen.getByText(/Gian Jaen of Gaucho F\.C\. faces the press during Gameweek 6/)).toBeInTheDocument();
    const questions = Array.from(container.querySelectorAll("[data-ask] p[class*=bubble]")).map((p) => p.textContent!);
    expect(questions).toHaveLength(EXCHANGES);
    for (const q of questions) expect(/Gian|Gaucho F\.C\./.test(q), q).toBe(true);
    expect(questions.some((q) => q.includes("Gian Jaen"))).toBe(true);
    expect(container.textContent).not.toMatch(/gian jaen|\bgian\b/); // capitalised, never as the raw data
  });

  it("says the conference changes every day while the gameweek is live", async () => {
    const m = withLeague(await okModel());
    expect(m.gameweek.status).toBe("live");
    render(<InterviewPanel model={m} />);
    expect(screen.getByText("*Changes every day during the gameweek.")).toBeInTheDocument();
  });

  it("is redrawn each day while live, and the same all day", async () => {
    const m = withLeague(await okModel());
    const day = (d: number) => { const { container, unmount } = render(<InterviewPanel model={m} now={new Date(d * 86_400_000 + 3_600_000)} />); const t = text(container); unmount(); return t; };
    expect(day(20000)).toBe(day(20000));
    expect(new Set([20000, 20001, 20002, 20003].map(day)).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps changing every day once the gameweek is over, the same all day, and says FPL has confirmed the scores", async () => {
    const final = withLeague(await okModel("5"));
    expect(final.gameweek.status).toBe("final");
    const at = (d: number, h = 0) => { const { container, unmount } = render(<InterviewPanel model={final} now={new Date(d * 86_400_000 + h * 3_600_000)} />); const t = text(container); unmount(); return t; };
    expect(at(20000, 1)).toBe(at(20000, 22));
    expect(new Set([20000, 20001, 20002, 20003].map((d) => at(d))).size).toBeGreaterThanOrEqual(3);
    render(<InterviewPanel model={final} />);
    expect(screen.getByText(/FPL has confirmed the scores for Gameweek 5/)).toBeInTheDocument();
    expect(screen.queryByText(/Changes every day during/)).toBeNull();
  });

  it("is redrawn the moment FPL moves the gameweek on, even on the same day", async () => {
    const m = withLeague(await okModel("5"));
    const as = (status: "live" | "provisional" | "final") => {
      const { container, unmount } = render(<InterviewPanel model={{ ...m, gameweek: { ...m.gameweek, status } }} now={new Date(20000 * 86_400_000)} />);
      const out = { items: text(container), all: container.textContent ?? "" };
      unmount();
      return out;
    };
    const live = as("live");
    const provisional = as("provisional");
    const final = as("final");
    expect(new Set([live.items, provisional.items, final.items]).size).toBe(3);
    expect(provisional.all).toMatch(/Bonus for Gameweek 5 is still provisional/);
    expect(provisional.all).toMatch(/while FPL settles the bonus/);
    expect(live.all).toMatch(/faces the press during Gameweek 5/);
  });

  it("uses the shared variety key, so it turns together with the rest of the page", () => {
    // The key the panel salts its seed with: different on each day and in each phase, the same within one.
    const day = new Date(20000 * 86_400_000 + 3_600_000);
    const later = new Date(20000 * 86_400_000 + 20 * 3_600_000);
    expect(varietyKey(5, "final", day)).toBe(varietyKey(5, "final", later));
    expect(varietyKey(5, "final", day)).not.toBe(varietyKey(5, "provisional", day));
    expect(interviewSeed(7, 5, varietyKey(5, "final", day))).not.toBe(interviewSeed(7, 5, varietyKey(5, "provisional", day)));
  });

  it("gives managers in the same league different conferences", async () => {
    const m = withLeague(await okModel());
    const conference = (id: number) => { const { container, unmount } = render(<InterviewPanel model={{ ...m, team: { ...m.team, entryId: id } }} now={new Date(20000 * 86_400_000)} />); const t = text(container); unmount(); return t; };
    expect(new Set(Array.from({ length: 21 }, (_, i) => conference(1000 + i * 977))).size).toBe(21);
  });

  it("still works for a manager with no mascot picture and no league information", async () => {
    const m = withMascot(await okModel(), false);
    const { container } = render(<InterviewPanel model={{ ...m, team: { ...m.team, league: null } }} />);
    expect(container.querySelector("img[src*='mascots']")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(EXCHANGES);
  });

  it("is accessible", async () => {
    const { container } = render(<InterviewPanel model={withLeague(withMascot(await okModel()))} />);
    await expectNoAxeViolations(container);
  });

  it.each(["es", "fr"] as const)("speaks %s, with the daily-change note", async (locale) => {
    setRequestLocale(locale);
    render(<InterviewPanel model={withLeague(await okModel())} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(MESSAGES[locale].interview.heading);
    expect(screen.getByText(MESSAGES[locale].interview.liveNote)).toBeInTheDocument();
  });
});

describe("interviewInputOf", () => {
  const t = MESSAGES.en;
  const money = (n: number) => `£${(n / 10).toFixed(1)}m`;
  const lower = (s: string) => s.toLowerCase();
  const input = (m: Extract<TeamModel, { kind: "ok" }>) => interviewInputOf(m, t, money, "Gameweek 6", lower);

  it("takes the manager's names, the points and the bank from the page's own numbers", async () => {
    const i = input(await okModel());
    expect(i).toMatchObject({ team: "Gaucho F.C.", first: "Gian", manager: "Gian Jaen", gw: "Gameweek 6", settled: false });
    expect(i.points).toBeTypeOf("number");
    expect(i.bankText).toMatch(/^£\d/);
  });
  it("counts a final gameweek as settled", async () => {
    expect(input(await okModel("5")).settled).toBe(true);
  });
  it("brings a worrying flagged starter, not a bench player or a slight doubt", async () => {
    const m = await okModel();
    const flag = (over: object) => ({ name: "Isak", club: "NEW", label: "Injured", chance: 0, news: "", wasStarter: true, ...over });
    const g = (flags: ReturnType<typeof flag>[]) => input({ ...m, insights: { ...m.insights, gameweek: { ...m.insights.gameweek, flags } } }).flagged;
    expect(g([flag({})])).toEqual({ name: "Isak", label: "injured" });
    expect(g([flag({ wasStarter: false })])).toBeNull();
    expect(g([flag({ label: "Doubtful", chance: 75 })])).toBeNull();
    expect(g([flag({ label: "Doubtful", chance: 25 })])).toEqual({ name: "Isak", label: "doubtful" });
  });
  it("carries the league place, the neighbours and the leader", async () => {
    const i = input(withLeague(await okModel()));
    expect(i.league).toEqual({ rank: 8, size: 21, points: 380, leader: { team: "Bart's Team", points: 443 }, up: { team: "Up FC", points: 385 }, down: { team: "Down FC", points: 375 }, moved: -2 });
  });
});

describe("the mascot gateway and its files", () => {
  const ids = Object.keys(manifest.managers);
  it("has the action and press scene of all 21 managers, on disk, in the size the manifest says", () => {
    expect(ids).toHaveLength(21);
    const gateway = createMascotGateway();
    for (const id of ids) {
      const s = gateway.scenes(Number(id))!;
      expect(s, id).not.toBeNull();
      for (const [role, img] of Object.entries({ action: s.action, press: s.press })) {
        expect(img.src).toMatch(new RegExp(`^/mascots/${id}-${role}\\.webp\\?v=[0-9a-f]{10}$`));
        expect(existsSync(join(process.cwd(), "public", img.src.split("?")[0])), img.src).toBe(true);
      }
      expect(s.trip?.src, id).toMatch(new RegExp(`^/psychedelic/${id}-l\\.webp\\?v=[0-9a-f]{10}$`));
      expect(existsSync(join(process.cwd(), "public", s.trip!.src.split("?")[0])), id).toBe(true);
      expect(s.press.width / s.press.height).toBeCloseTo(1.5, 2);
      expect(s.action.width).toBe(s.action.height);
    }
  });
  it("knows nothing of a manager who has none, and refuses unsafe file names", () => {
    expect(createMascotGateway().scenes(1)).toBeNull();
    const bad = { managers: { "5": { action: { file: "../x.webp", width: 1, height: 1 }, press: { file: "5-press.webp", width: 1, height: 1 } } } };
    expect(createMascotGateway(bad).scenes(5)).toBeNull();
    expect(createMascotGateway({ managers: { "5": { action: { file: "5-action.webp", width: 0, height: 1 }, press: { file: "5-press.webp", width: 1, height: 1 } } } }).scenes(5)).toBeNull();
    expect(createMascotGateway({}).scenes(5)).toBeNull();
  });
});
