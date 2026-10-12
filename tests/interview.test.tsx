import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { interviewInputOf } from "@/components/views/interviewInput";
import { setRequestLocale } from "@/components/ui/i18n";
import {
  ALL_TOPICS, ANSWER_KINDS, ASK_KINDS, BLUNDER_TOPICS, EXCHANGES, FILLER_TOPICS, GENERIC_ANSWERS, OPENERS, POSITION_TOPICS, SPECIFIC_ANSWERS, VOICE_LINES,
  candidatesOf, interviewContext, interviewSeed, neatName, pickInterview, type Candidate, type InterviewInput, type TopicId,
} from "@/lib/domain/interview";
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

const base = (over: Partial<InterviewInput> = {}): InterviewInput => ({
  team: "Gaucho F.C.", first: "Gian", manager: "Gian Jaen", gw: "Gameweek 6", points: 60, total: 433, hit: 0, bank: 5, bankText: "£0.5m", settled: true,
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
      chip: { code: "3xc", label: "Triple Captain", points: 2 }, autoSub: { out: "A", in: "B" },
      season: { average: 70, benchPoints: 50, hitPoints: 12 },
    });
    expect(topics(live).filter((t) => (BLUNDER_TOPICS as readonly string[]).includes(t))).toEqual(["hitTaken", "injuredStarter", "seasonBench", "seasonHits"].sort());
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

// ----------------------------------------------------------------------------------------------- dealing the conference

const rich = (): Candidate[] =>
  candidatesOf(base({
    hit: 8, bank: 30, flagged: { name: "Isak", label: "injured" },
    captain: { name: "Haaland", base: 1, state: "played", bestName: "Salah", bestBase: 12, regret: 22 },
    bench: { points: 14, top: { name: "Kinsky", points: 6 }, counted: false },
    chip: { code: "3xc", label: "Triple Captain", points: 2 }, autoSub: { out: "A", in: "B" },
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
  it.each(sets)("deals five distinct questions to five distinct voices, whatever there is to ask (%s)", (_name, cands) => {
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
    const blunders = new Set<string>(BLUNDER_TOPICS);
    const positions = new Set<string>(POSITION_TOPICS);
    for (let seed = 0; seed < 200; seed++) {
      const xs = pickInterview(seed, rich());
      expect(xs.some((x) => blunders.has(x.topic))).toBe(true);
      expect(xs.some((x) => positions.has(x.topic))).toBe(true);
    }
  });

  it("asks the biggest blunder most often", () => {
    const cands: Candidate[] = [{ topic: "captainBlank", group: "blunder", weight: 95 }, { topic: "idleBank", group: "blunder", weight: 30 }, { topic: "midtable", group: "position", weight: 40 }];
    let big = 0;
    for (let seed = 0; seed < 400; seed++) if (pickInterview(seed, cands).some((x) => x.topic === "captainBlank")) big++;
    expect(big).toBe(400); // three candidates, five questions: all of them are asked, the fillers make up the rest
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
    expect(questions.length).toBe(105);
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

/** A context whose every field is a recognisable value, to see what a line uses and how it reads. */
const ctx = (over: Partial<ReturnType<typeof interviewContext>> = {}) => ({
  ...interviewContext(base({
    first: "Zed", manager: "Zed Qux", team: "Teamy FC", gw: "Gameweek 6",
    league: league({ rank: 13, size: 21, points: 380, leader: { team: "Leady FC", points: 443 }, up: { team: "Upton FC", points: 388 }, down: { team: "Downe FC", points: 374 }, moved: -3 }),
    captain: { name: "Capt", base: 2, state: "played", bestName: "Besto", bestBase: 12, regret: 20 },
    bench: { points: 14, top: { name: "Benchy", points: 6 }, counted: false },
    chip: { code: "3xc", label: "Triple Captain", points: 3 }, hit: 4, flagged: { name: "Hurt", label: "injured" }, autoSub: { out: "Outy", in: "Inny" },
    season: { average: 66, benchPoints: 52, hitPoints: 12 }, bank: 25, bankText: "£2.5m",
  })),
  ...over,
});
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

  it("names the manager or the team in every opener, and no two openers read the same", () => {
    const outs = t.openers.map((o) => o(ctx(), "Q?"));
    for (const o of outs) expect(/Zed|Teamy FC/.test(o), o).toBe(true);
    expect(new Set(outs).size).toBe(OPENERS);
    expect(outs.some((o) => o.includes("Zed Qux"))).toBe(true);
    expect(outs.some((o) => o.includes("Teamy FC"))).toBe(true);
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
    const one = ctx({ captainPts: 1, chipPts: 1, points: 1, gapUp: 1, gapDown: 1, leaderGap: 1 }); // the figures that can really be 1
    const wrong = locale === "en" ? /\b1 points\b/ : locale === "es" ? /\b1 puntos\b/ : /\b[01] points\b/;
    const problems: string[] = [];
    for (const id of ALL_TOPICS) {
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

  it("explains the daily change and the final state", () => {
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
  ...m, team: { ...m.team, mascot: on ? { action: { src: "/mascots/7-action.webp", width: 768, height: 768 }, press: { src: "/mascots/7-press.webp?v=abc", width: 1200, height: 800 } } : null },
});
const withLeague = (m: Extract<TeamModel, { kind: "ok" }>): Extract<TeamModel, { kind: "ok" }> => ({
  ...m, team: { ...m.team, league: { rank: 8, size: 21, points: 380, moved: -2, leader: { entryId: 1, slug: "barts-team", teamName: "Bart's Team", rank: 1, points: 443 }, prev: { entryId: 2, slug: "up-fc", teamName: "Up FC", rank: 7, points: 385 }, next: { entryId: 3, slug: "down-fc", teamName: "Down FC", rank: 9, points: 375 } } },
});
const text = (el: Element) => Array.from(el.querySelectorAll("li")).map((li) => li.textContent).join("|");

describe("InterviewPanel", () => {
  it("shows the press picture at its own size, with five questions each followed by a reply", async () => {
    const { container } = render(<InterviewPanel model={withLeague(withMascot(await okModel()))} />);
    const img = container.querySelector("img[src^='/mascots/7-press']")!;
    expect(img).toHaveAttribute("width", "1200");
    expect(img).toHaveAttribute("height", "800");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.getAttribute("alt")).toMatch(/Gaucho F\.C\./);
    expect(screen.getByRole("heading", { level: 2, name: "Press conference" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Transcript" })).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const li of items) expect(li.querySelectorAll("p[class*=bubble]")).toHaveLength(2);
  });

  it("calls the manager and the team by name: in the lede and in the questions", async () => {
    const { container } = render(<InterviewPanel model={withLeague(withMascot(await okModel()))} />);
    expect(screen.getByText(/Gian Jaen of Gaucho F\.C\. faces the press after Gameweek 6/)).toBeInTheDocument();
    const questions = Array.from(container.querySelectorAll("[data-ask] p[class*=bubble]")).map((p) => p.textContent!);
    expect(questions).toHaveLength(5);
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

  it("is fixed once the gameweek is over, whatever the day, and says so", async () => {
    const final = withLeague(await okModel("5"));
    expect(final.gameweek.status).toBe("final");
    const at = (d: number) => { const { container, unmount } = render(<InterviewPanel model={final} now={new Date(d * 86_400_000)} />); const t = text(container); unmount(); return t; };
    expect(at(20000)).toBe(at(20400));
    render(<InterviewPanel model={final} />);
    expect(screen.getByText(/Final for Gameweek 5: this press conference is fixed/)).toBeInTheDocument();
    expect(screen.queryByText(/Changes every day/)).toBeNull();
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
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
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
      for (const [role, img] of Object.entries(s)) {
        expect(img.src).toMatch(new RegExp(`^/mascots/${id}-${role}\\.webp\\?v=[0-9a-f]{10}$`));
        expect(existsSync(join(process.cwd(), "public", img.src.split("?")[0])), img.src).toBe(true);
      }
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
