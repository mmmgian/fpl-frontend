import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BonusView } from "@/components/views/BonusView";
import { ClubView } from "@/components/views/ClubView";
import { fixturesLede } from "@/components/views/fixturesLede";
import { BUBBLE_GAP, bonusRace, clubOutlook, fdrHighlights, type ClubMatch, type ClubNewsItem, type ClubPlayer, type FdrMatrix, type FdrRow } from "@/lib/domain";
import { MESSAGES, tripMessagesFor } from "@/lib/domain/i18n";
import type { Bootstrap, FplEvent, ScheduledFixture } from "@/lib/domain/types";
import { createBonusService } from "@/lib/services/bonus";
import { createClubService } from "@/lib/services/club";
import { createFixturesService } from "@/lib/services/fixtures";
import type { ClubModel, FdrHighlightsView } from "@/lib/services/models";
import { bootstrap, event, fixture } from "./fixtures";

// ----------------------------------------------------------------------------------------------- domain facts

describe("bonusRace", () => {
  it("names the leader, the margin and the bonus bubble from the BPS feed", () => {
    const r = bonusRace(fixture({
      stats: [
        { identifier: "bps", h: [{ element: 3, value: 35 }, { element: 2, value: 28 }], a: [{ element: 4, value: 31 }, { element: 6, value: 26 }] },
        { identifier: "bonus", h: [], a: [] },
      ],
    }))!;
    expect(r.leader).toMatchObject({ element: 3, bps: 35 });
    expect(r.runnerUp).toMatchObject({ element: 4, bps: 31 });
    expect(r.lead).toBe(4);
    expect(r.bubble).toMatchObject({ inside: { element: 2 }, outside: { element: 6 }, gap: 2 });
    expect(r.bubble!.gap).toBeLessThanOrEqual(BUBBLE_GAP);
  });

  it("leaves out the bubble when FPL's confirmed bonus doesn't follow the BPS order", () => {
    const r = bonusRace(fixture({
      stats: [
        { identifier: "bps", h: [{ element: 3, value: 40 }, { element: 2, value: 30 }], a: [{ element: 4, value: 20 }, { element: 6, value: 10 }] },
        { identifier: "bonus", h: [{ element: 3, value: 3 }], a: [{ element: 4, value: 2 }, { element: 6, value: 1 }] },
      ],
    }))!;
    expect(r.bubble).toBeNull();                                              // Saliba (30) out, Gvardiol (10) in
  });

  it("has nothing to say before any BPS exists", () => {
    expect(bonusRace(fixture({ stats: [] }))).toBeNull();
  });
});

const row = (teamId: number, difficulties: (number | number[] | null)[]): FdrRow => {
  const cells = difficulties.map((d, i) => ({
    gw: 10 + i,
    matches: d === null ? [] : (Array.isArray(d) ? d : [d]).map((difficulty) => ({ opponentId: 99, home: true, difficulty })),
  }));
  const per = cells.map((c) => (c.matches.length ? c.matches.reduce((s, m) => s + m.difficulty, 0) / c.matches.length : 3));
  const score = per.reduce((a, b) => a + b, 0);
  return { teamId, cells, score, average: score / cells.length };
};

describe("fdrHighlights", () => {
  const matrix: FdrMatrix = {
    start: 10, window: 4, gameweeks: [10, 11, 12, 13],
    rows: [row(1, [2, 2, 2, [2, 2]]), row(2, [5, 4, 2, 2]), row(3, [4, 4, 4, null])],
  };

  it("finds the kindest and toughest runs, the biggest swing and the first double and blank", () => {
    const h = fdrHighlights(matrix)!;
    expect(h.easiest.teamId).toBe(1);
    expect(h.toughest.teamId).toBe(3);
    expect(h.swing).toMatchObject({ teamId: 2, before: 4.5, after: 2, from: 12 });
    expect(h.double).toEqual({ gw: 13, teams: [1] });
    expect(h.blank).toEqual({ gw: 13, teams: [3] });
  });

  it("is null for an empty matrix and skips a swing nobody has", () => {
    expect(fdrHighlights({ start: 1, window: 3, gameweeks: [], rows: [] })).toBeNull();
    const flat = fdrHighlights({ start: 10, window: 2, gameweeks: [10, 11], rows: [row(1, [3, 3]), row(2, [4, 4])] })!;
    expect(flat.swing).toBeNull();
    expect(flat.double).toBeNull();
    expect(flat.blank).toBeNull();
  });
});

const clubMatch = (band: 1 | 2 | 3 | 4 | 5, state: ClubMatch["state"] = "upcoming"): ClubMatch => ({
  id: band, gw: band, kickoff: null, state, opponentId: 2, home: true, band, scored: null, conceded: null, result: null,
});
const clubPlayer = (id: number, name: string, points: number, over: Partial<ClubPlayer> = {}): ClubPlayer => ({
  id, name, position: 3, status: "a", news: "", newsAdded: null, chance: null, cost: 80, form: 3, points, minutes: 400, starts: 5, ownership: 12.5, ...over,
});

describe("clubOutlook", () => {
  it("reads the form, the run ahead, the top scorer and the absentees", () => {
    const star = clubPlayer(1, "Saka", 60);
    const gone = clubPlayer(2, "Gone", 90, { status: "u" });
    const out: ClubNewsItem = { player: clubPlayer(3, "Odegaard", 20), severity: "out" };
    const doubt: ClubNewsItem = { player: clubPlayer(4, "Rice", 25), severity: "doubt" };
    const o = clubOutlook(["W", "W", "D", "W", "L"], [clubMatch(2), clubMatch(2), clubMatch(3), clubMatch(5)], [star, gone], [out, doubt]);
    expect(o.form).toEqual({ played: 5, wins: 3, draws: 1, losses: 1, points: 10, mood: "hot" });
    expect(o.run).toMatchObject({ matches: 3, mood: "kind" });
    expect(o.run!.average).toBeCloseTo(7 / 3);
    expect(o.star).toEqual({ name: "Saka", points: 60, ownership: 12.5 });   // a player who has left doesn't count
    expect(o.out).toEqual(["Odegaard"]);
    expect(o.doubts).toBe(1);
  });

  it("counts matches that have no kick-off time yet", () => {
    expect(clubOutlook([], [clubMatch(2, "tbc"), clubMatch(4, "tbc")], [], []).run).toMatchObject({ matches: 2, average: 3, mood: "mixed" });
  });

  it("calls a bad run cold and a hard run tough, and is empty without facts", () => {
    const o = clubOutlook(["L", "L", "D"], [clubMatch(4), clubMatch(5), clubMatch(4)], [], []);
    expect(o.form!.mood).toBe("cold");
    expect(o.run!.mood).toBe("tough");
    expect(clubOutlook([], [], [], [])).toEqual({ form: null, run: null, star: null, out: [], doubts: 0 });
  });
});

// ----------------------------------------------------------------------------------------------- the catalogs

describe("the variant copy", () => {
  const variantPaths = (m: (typeof MESSAGES)["en"]) => ({
    "fixtures.feedIntro": m.fixtures.feedIntro, "fixtures.deadline": m.fixtures.deadline, "fixtures.easiest": m.fixtures.easiest,
    "fixtures.toughest": m.fixtures.toughest, "fixtures.swing": m.fixtures.swing, "fixtures.double": m.fixtures.double, "fixtures.blank": m.fixtures.blank,
    "club.newsEmpty": m.club.newsEmpty, "club.formLine.hot": m.club.formLine.hot, "club.runLine.tough": m.club.runLine.tough,
    "club.starLine": m.club.starLine, "club.outLine": m.club.outLine, "club.doubtLine": m.club.doubtLine,
    "bonus.upcomingNote": m.bonus.upcomingNote, "bonus.lede.final": m.bonus.lede.final, "bonus.lede.provisional": m.bonus.lede.provisional,
    "bonus.race.confirmed": m.bonus.race.confirmed, "bonus.race.projected": m.bonus.race.projected, "bonus.race.bubbleOpen": m.bonus.race.bubbleOpen,
  });

  it("has three distinct wordings for each fact, in every language", () => {
    for (const [lang, m] of Object.entries(MESSAGES)) {
      for (const [path, items] of Object.entries(variantPaths(m))) {
        expect(items.length, `${lang} ${path}`).toBe(3);
        expect(new Set(items.map(String)).size, `${lang} ${path}`).toBe(3);
      }
    }
  });

  it("keeps every figure in every wording, regular and blotter", () => {
    for (const [lang, m] of Object.entries(MESSAGES)) {
      for (const f of m.fixtures.deadline) expect(f(14, "in 30 hours", 10), lang).toContain("14");
      for (const f of m.fixtures.swing) {
        const s = f("Spurs", "4.5", "2.0", 12);
        for (const fig of ["Spurs", "4.5", "2.0", "12"]) expect(s, `${lang} swing`).toContain(fig);
      }
      for (const f of m.bonus.race.confirmed) {
        const s = f("Saka", 41, 6, "Rice");
        for (const fig of ["Saka", "41"]) expect(s, `${lang} race`).toContain(fig);
      }
      for (const f of m.club.starLine) expect(f("Saka", 60, null), `${lang} star`).toContain("60");
    }
    for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      const trip = tripMessagesFor(lang);
      for (const [path, items] of Object.entries(variantPaths(trip))) expect(items.length, `trip ${lang} ${path}`).toBe(3);
      for (const f of trip.bonus.race.confirmed) expect(f("Saka", 41, 6, "Rice"), `trip ${lang}`).toContain("41");
      for (const f of trip.fixtures.swing) expect(f("Spurs", "4.5", "2.0", 12), `trip ${lang}`).toContain("4.5");
    }
  });
});

// ----------------------------------------------------------------------------------------------- services: variety

const DAY = 86_400_000;
const at = (iso: string) => () => new Date(iso);

describe("variety follows the day and the gameweek's phase", () => {
  const teams = [1, 2].map((id) => ({ id, code: 100 + id, name: `Club ${id}`, short_name: `C${id}` }));
  const events = (current: Partial<FplEvent>): FplEvent[] => [
    { id: 5, name: "Gameweek 5", deadline_time: "2026-10-03T10:00:00Z", is_current: true, is_next: false, finished: false, data_checked: false, ...current },
    { id: 6, name: "Gameweek 6", deadline_time: "2026-10-17T10:00:00Z", is_current: false, is_next: true, finished: false, data_checked: false },
  ];
  const sched: ScheduledFixture[] = [5, 6, 6].map((gw, i) => ({
    id: i + 1, event: gw, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: `2026-10-${gw === 5 ? "04" : "18"}T14:00:00Z`,
    started: false, finished: false, finished_provisional: false,
  }));
  const fixtures = (ev: FplEvent[], now: () => Date) => createFixturesService({ bootstrap: async () => ({ events: ev, teams, elements: [] }), allFixtures: async () => sched }, { now });

  it("is the same all day, and changes the next day and when the gameweek is checked", async () => {
    const v = async (ev: FplEvent[], iso: string) => {
      const m = await fixtures(ev, at(iso)).feed(undefined);
      if (m.kind !== "ok") throw new Error("expected ok");
      return m;
    };
    const morning = await v(events({}), "2026-10-13T08:00:00Z");
    const evening = await v(events({}), "2026-10-13T20:00:00Z");
    const tomorrow = await v(events({}), "2026-10-14T08:00:00Z");
    const checked = await v(events({ finished: true, data_checked: true }), "2026-10-13T08:00:00Z");
    expect(evening.variety).toBe(morning.variety);
    expect(tomorrow.variety).not.toBe(morning.variety);
    expect(checked.variety).not.toBe(morning.variety);
    expect(morning.next).toEqual({ gw: 6, hours: 98, matches: 2 });          // 13th 08:00 → 17th 10:00
  });

  it("gives the bonus page a summary of the week and a race for each match", async () => {
    const svc = createBonusService(
      { bootstrap: async () => ({ ...bootstrap, events: [event({ id: 6, is_current: true })] }), fixtures: async () => [fixture()] },
      { now: at("2026-10-10T12:30:00Z") },
    );
    const m = await svc.load(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.summary).toMatchObject({ top: { bps: 35 } });
    expect(m.fixtures[0].race).toMatchObject({ bps: 35, lead: 0 });
    const later = await createBonusService(
      { bootstrap: async () => ({ ...bootstrap, events: [event({ id: 6, is_current: true })] }), fixtures: async () => [fixture()] },
      { now: () => new Date(Date.parse("2026-10-10T12:30:00Z") + DAY) },
    ).load(undefined);
    if (later.kind !== "ok") throw new Error("expected ok");
    expect(later.variety).not.toBe(m.variety);
  });

  it("gives the club page its outlook", async () => {
    const bs: Bootstrap = { ...bootstrap, events: events({}), elements: [
      { id: 2, web_name: "Saka", team: 1, element_type: 3, total_points: 50, selected_by_percent: "30.1", starts: 5, minutes: 430 },
    ] };
    const m = await createClubService({ bootstrap: async () => bs, allFixtures: async () => sched }, undefined, { now: at("2026-10-13T08:00:00Z") }).load(1);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.outlook.run).toMatchObject({ matches: 3, mood: "kind" });
    expect(m.outlook.star).toMatchObject({ name: "Saka", points: 50 });
    expect(typeof m.variety).toBe("number");
  });
});

// ----------------------------------------------------------------------------------------------- views

describe("the opening lines", () => {
  const h: FdrHighlightsView = {
    from: 10, to: 14,
    easiest: { team: "Arsenal", average: 2.2 }, toughest: { team: "Spurs", average: 3.8 },
    swing: { team: "Brighton", before: 4.5, after: 2, from: 12 },
    double: { gw: 13, teams: ["Arsenal", "Chelsea"] }, blank: null,
  };

  it("frames the fixtures by the next deadline and the facts in the window, differently on different days", () => {
    const lines = fixturesLede(h, { gw: 10, hours: 30, matches: 10 }, 1);
    expect(lines.length).toBe(4);                                             // deadline, double, two runs
    expect(lines[1]).toMatch(/Arsenal and Chelsea/);
    const seen = new Set(Array.from({ length: 12 }, (_, i) => fixturesLede(h, { gw: 10, hours: 30, matches: 10 }, i * 104729).join(" ")));
    expect(seen.size).toBeGreaterThan(1);
    expect(fixturesLede(null, null, 0)).toEqual([MESSAGES.en.fixtures.seasonOver]);
  });

  it("opens the club page with form, run, star and absentees", () => {
    const model: Extract<ClubModel, { kind: "ok" }> = {
      kind: "ok", club: { id: 1, name: "Arsenal", short: "ARS", code: 3 }, form: ["W", "W", "W"], next: [], recent: [], news: [], lineup: null,
      europe: { status: "off" }, headlines: { status: "off" },
      outlook: { form: { played: 3, wins: 3, draws: 0, losses: 0, points: 9, mood: "hot" }, run: null, star: { name: "Saka", points: 60, ownership: 30.1 }, out: ["Odegaard"], doubts: 0 },
      variety: 7,
    };
    const { container } = render(<ClubView model={model} />);
    const lede = container.querySelector("p[class*='lede']")!;
    expect(lede.textContent).toContain("Saka");
    expect(lede.textContent).toContain("60");
    expect(lede.textContent).toContain("Odegaard");
  });

  it("puts a verdict on the bonus page once there are fixtures", async () => {
    const m = await createBonusService(
      { bootstrap: async () => ({ ...bootstrap, events: [event({ id: 6, is_current: true, finished: true, data_checked: true })] }), fixtures: async () => [fixture({ finished: true, finished_provisional: true })] },
      { now: at("2026-10-12T12:00:00Z") },
    ).load(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    render(<BonusView model={m} />);
    expect(screen.getAllByText(/Saka|Haaland/).length).toBeGreaterThan(0);
  });
});
