import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { setRequestLocale } from "@/components/ui/i18n";
import { ANSWER_KINDS, ASK_KINDS, TOPICS, interviewSeed, pickInterview, type AskKind } from "@/lib/domain/interview";
import { MESSAGES } from "@/lib/domain/i18n";
import { LOCALES } from "@/lib/domain/i18n/locales";
import type { TeamGameweek, TeamIdentity, TeamSummary } from "@/lib/services/models";
import { createMascotGateway } from "@/lib/mascots";
import manifest from "@/lib/mascots/manifest.json";
import { expectNoAxeViolations } from "./axe";
import { existsSync } from "node:fs";
import { join } from "node:path";

const inStep: Record<AskKind, string> = { genius: "genius", dumb: "snarky", satirical: "egotist" };

describe("pickInterview", () => {
  it("asks one question of each kind and gives each answer kind out once", () => {
    for (let seed = 0; seed < 500; seed++) {
      const xs = pickInterview(seed);
      expect(xs.map((x) => x.ask).sort(), String(seed)).toEqual([...ASK_KINDS].sort());
      expect(xs.map((x) => x.answer).sort(), String(seed)).toEqual([...ANSWER_KINDS].sort());
      for (const x of xs) expect((TOPICS[x.ask] as readonly string[]).includes(x.topic)).toBe(true);
    }
  });
  it("never deals every answer in step with its question", () => {
    for (let seed = 0; seed < 500; seed++) expect(pickInterview(seed).every((x) => inStep[x.ask] === x.answer), String(seed)).toBe(false);
  });
  it("is the same for the same seed and varies across seeds, in order, topics and answers", () => {
    expect(pickInterview(42)).toEqual(pickInterview(42));
    const seen = (f: (x: ReturnType<typeof pickInterview>) => string) => new Set(Array.from({ length: 200 }, (_, s) => f(pickInterview(s)))).size;
    expect(seen((x) => x.map((e) => e.ask).join())).toBe(6);
    expect(seen((x) => x.map((e) => e.answer).join())).toBeGreaterThanOrEqual(5);
    expect(seen((x) => x.map((e) => e.topic).join())).toBeGreaterThan(20);
  });
  it("differs by manager and by gameweek", () => {
    expect(interviewSeed(1, 6)).not.toBe(interviewSeed(2, 6));
    expect(interviewSeed(1, 6)).not.toBe(interviewSeed(1, 7));
  });
});

describe("the interview copy", () => {
  it.each(LOCALES)("%s has every topic, each with a question and all three answers", (locale) => {
    const t = MESSAGES[locale].interview;
    const ctx = { team: "Gaucho F.C.", first: "gian", gw: "GW6", points: 60, total: 433 };
    for (const kind of ASK_KINDS) for (const id of TOPICS[kind]) {
      const topic = t.topics[id];
      expect(topic.q(ctx).length, `${locale} ${id}`).toBeGreaterThan(20);
      for (const a of ANSWER_KINDS) expect(topic.a[a](ctx).length, `${locale} ${id} ${a}`).toBeGreaterThan(15);
      expect(topic.q(ctx)).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

const team = (over: Partial<TeamIdentity> = {}): TeamIdentity => ({
  entryId: 7, teamName: "Gaucho F.C.", firstName: "gian", lastName: "jaen", manager: "gian jaen", avatar: "/avatars/7.webp",
  mascot: { action: { src: "/mascots/7-action.webp", width: 768, height: 768 }, press: { src: "/mascots/7-press.webp?v=abc", width: 1200, height: 800 } }, ...over,
});
const gameweek = { gw: 6, name: "Gameweek 6", status: "live", min: 1, max: 6, isLive: true } as unknown as TeamGameweek;
const summary: TeamSummary = { gwPoints: 60, hit: 0, total: 433, overallRank: 288583, transfers: 1, value: 997, bank: 14 };

describe("InterviewPanel", () => {
  it("shows the press picture at its own size, with three questions each followed by a reply", () => {
    const { container } = render(<InterviewPanel team={team()} gameweek={gameweek} summary={summary} />);
    const img = container.querySelector("img[src^='/mascots/7-press']")!;
    expect(img).toHaveAttribute("width", "1200");
    expect(img).toHaveAttribute("height", "800");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.getAttribute("alt")).toMatch(/Gaucho F\.C\./);
    expect(screen.getByRole("heading", { level: 2, name: "Press conference" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Transcript" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const li of items) expect(li.querySelectorAll("p[class*=bubble]")).toHaveLength(2);
  });
  it("gives a manager the same conference each time, and another gameweek a different one", () => {
    const text = (gw: number) => { const { container, unmount } = render(<InterviewPanel team={team()} gameweek={{ ...gameweek, gw }} summary={summary} />); const t = container.textContent; unmount(); return t; };
    expect(text(6)).toBe(text(6));
    expect(new Set([1, 2, 3, 4, 5, 6].map(text)).size).toBeGreaterThan(2);
  });
  it("still works for a manager with no mascot picture", () => {
    const { container } = render(<InterviewPanel team={team({ mascot: null })} gameweek={gameweek} summary={summary} />);
    expect(container.querySelector("img[src*='mascots']")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  it("is accessible", async () => {
    const { container } = render(<InterviewPanel team={team()} gameweek={gameweek} summary={summary} />);
    await expectNoAxeViolations(container);
  });
  it.each(["es", "fr"] as const)("speaks %s", (locale) => {
    setRequestLocale(locale);
    render(<InterviewPanel team={team()} gameweek={gameweek} summary={summary} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(MESSAGES[locale].interview.heading);
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
