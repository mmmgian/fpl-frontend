/**
 * The team page under the data FPL actually sends on a bad day: missing names, junk numbers, half-built payloads,
 * auto-subbed captains, negative bench boosts, unknown chips, odd addresses. Every scenario here failed (crashed, or
 * printed "undefined"/"NaN"/"+-2") before the matching fix.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initLocale } from "@/app/locale";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { InterviewPanel } from "@/components/views/InterviewPanel";
import { Sparkline } from "@/components/ui/Sparkline";
import { buildTeamSheet, captainInsight, chipContribution, entryOfSlug, entrySlugs } from "@/lib/domain";
import type { Bootstrap, Entry, EntryPicks, EventLive } from "@/lib/domain/types";
import type { TeamModel } from "@/lib/services/models";
import { createTeamService } from "@/lib/services/team";
import { expectNoAxeViolations } from "./axe";
import { bootstrap, event, live, picks, standing } from "./fixtures";
import { testLanguage } from "./language";
import { NOW, clock, fakeFpl } from "./support";

type Ok = Extract<TeamModel, { kind: "ok" }>;

const entry = (over: Partial<Entry> = {}): Entry =>
  ({ id: 7, name: "Gaucho F.C.", player_first_name: "gian", player_last_name: "jaen", started_event: 1, current_event: 6, ...over }) as Entry;

/** Text a reader should never see. */
const JUNK = /undefined|NaN|\bnull\b|\[object|Infinity|\+-|\+\u2212/;
const expectClean = (s: string) => {
  const hit = s.match(new RegExp(`.{0,40}(${JUNK.source}).{0,40}`));
  expect(hit?.[0] ?? null).toBeNull();
};
const markup = (el: ReactElement) => renderToStaticMarkup(el);

async function load(over: Parameters<typeof fakeFpl>[0] = {}, gw?: string): Promise<TeamModel> {
  const svc = createTeamService(fakeFpl({ entry: async () => entry(), history: async () => null, ...over }), { now: clock });
  return svc.load(7, gw);
}
const ok = (m: TeamModel): Ok => {
  expect(m.kind).toBe("ok");
  return m as Ok;
};
async function renderTeam(model: TeamModel) {
  const { TeamView } = await import("@/components/views/TeamView");
  expect(model.kind).not.toBe("not-found");
  return markup(<TeamView model={model as Exclude<TeamModel, { kind: "not-found" }>} now={NOW} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setRequestTrip(false);
});

// ------------------------------------------------------------------------------------------------------------ addresses

describe("team addresses", () => {
  it("never gives two teams the same slug, even when a suffix collides with a real name", () => {
    // Before: "Foo" (5) -> foo, "Foo" (9) -> foo-9, and "Foo 9" (3) had already taken foo-9.
    const slugs = entrySlugs([{ id: 3, name: "Foo 9" }, { id: 5, name: "Foo" }, { id: 9, name: "Foo" }, { id: 12, name: "foo-9" }]);
    const all = [...slugs.values()];
    expect(new Set(all).size).toBe(all.length);
    for (const [id, s] of slugs) expect(entryOfSlug(slugs, s)).toBe(id);
  });
  it("gives names with no letters a usable, unique address", () => {
    const slugs = entrySlugs([{ id: 1, name: "🦞🦞" }, { id: 2, name: "!!!" }, { id: 3, name: "" }, { id: 4, name: "Ωμέγα" }]);
    const all = [...slugs.values()];
    expect(new Set(all).size).toBe(4);
    for (const s of all) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("finds a team whatever the case of its address, so it can be sent on to the right one", () => {
    const slugs = entrySlugs([{ id: 7, name: "Gaucho F.C." }]);
    expect(entryOfSlug(slugs, "Gaucho-F-C")).toBe(7);
    expect(entryOfSlug(slugs, "gaucho-f-c-")).toBe(7);
    expect(entryOfSlug(slugs, "-")).toBeNull();
  });

  const svc = () =>
    createTeamService(fakeFpl({ standings: async () => ({ league: { id: 1, name: "L" }, standings: { has_next: false, results: [standing({ entry: 7, entry_name: "Gaucho F.C." })] } }) as never }), {
      now: clock,
      leagueId: () => 1,
    });
  it("resolves a differently-cased address to the canonical one (so the page redirects)", async () => {
    expect(await svc().resolve("GAUCHO-F-C")).toEqual({ entryId: 7, slug: "gaucho-f-c" });
  });
  it("rejects addresses that are neither a team number nor a known name", async () => {
    for (const bad of ["0", "-7", "7.0", " 7", "1e3", "12345678901", "..", "%2F%2Fevil.com", "//evil.com", "", "gaucho-f-c/../x"]) {
      expect(await svc().resolve(bad), bad).toBeNull();
    }
  });
});

describe("/team?id= form handler", () => {
  const go = async (id: string | null) => {
    const { GET } = await import("@/app/team/route");
    const { NextRequest } = await import("next/server");
    const url = new URL("https://lobster.example/team");
    if (id !== null) url.searchParams.set("id", id);
    return GET(new NextRequest(url));
  };
  it("sends a team number to its page, on this site", async () => {
    const res = await go(" 2379133 ");
    expect(res.headers.get("location")).toBe("https://lobster.example/team/2379133");
  });
  it("never redirects off-site or to a bogus team", async () => {
    for (const bad of [null, "", "0", "-1", "1.5", "//evil.com", "https://evil.com", "/\\evil.com", "12345678901", "7/../../x", "javascript:alert(1)"]) {
      const loc = (await go(bad)).headers.get("location");
      expect(loc, String(bad)).toBe("https://lobster.example/tools#prices");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------- bad data

describe("the team page with what FPL sends on a bad day", () => {
  it("never prints 'undefined' for a manager or team with no name", async () => {
    const m = ok(await load({ entry: async () => entry({ name: undefined as never, player_first_name: undefined as never, player_last_name: null as never }) }));
    expect(m.team.manager).toBe("");
    expect(m.team.teamName).toBe("#7");
    expectClean(await renderTeam(m));
  });

  it("treats a missing first gameweek as the start of the season", async () => {
    const m = ok(await load({ entry: async () => entry({ started_event: undefined as never }) }, "5"));
    expect(m.gameweek.min).toBe(1);
    expect(m.gameweek.gw).toBe(5);
  });

  it("shows junk ownership, form, price and live stats as unknown, not NaN", async () => {
    const bs: Bootstrap = {
      ...bootstrap,
      elements: bootstrap.elements.map((e, i) => ({ ...e, selected_by_percent: ["", "abc", null, "12.5", undefined, "NaN"][i] as never, form: "x" as never, now_cost: "?" as never })),
    };
    const junkLive: EventLive = { elements: [...live.elements.map((e) => ({ id: e.id, stats: { total_points: e.stats.total_points } as never })), null as never, { id: 3 } as never] };
    const m = ok(await load({ bootstrap: async () => bs, live: async () => junkLive }));
    const all = [...m.sheet.starters.flatMap((g) => g.players), ...m.sheet.bench];
    for (const p of all) {
      for (const v of [p.ownership, p.form, p.price, p.minutes, p.bps]) expect(v === null || Number.isFinite(v)).toBe(true);
      for (const v of [p.goals ?? 0, p.xg, p.bonus, p.saves]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(all.find((p) => p.id === 4)!.ownership).toBe(12.5);
    expectClean(await renderTeam(m));
  });

  it("explains 'no picks' when FPL sends picks without a squad, instead of crashing", async () => {
    const m = await load({ picks: async () => ({ active_chip: null, entry_history: picks.entry_history, picks: null }) as never });
    expect(m.kind).toBe("no-picks");
  });

  it("shows zeros, not NaN, when the gameweek summary is missing", async () => {
    const m = ok(await load({ picks: async () => ({ ...picks, entry_history: undefined }) as never, live: async () => null as never }));
    expect(Object.values(m.summary).every((v) => v === null || Number.isFinite(v))).toBe(true);
    expectClean(await renderTeam(m));
  });

  it("keeps the page when match states, schedule or history are malformed: only those sections go", async () => {
    const m = ok(
      await load({
        fixtures: async () => [null, {}, { event: 6, team_h: 1 }] as never,
        allFixtures: async () => [null, { event: "x" }] as never,
        history: async () => ({ current: [null, { event: null, points: "x" }, { event: 5, points: 50, total_points: 400 }], past: null, chips: [{}] }) as never,
      }),
    );
    expectClean(await renderTeam(m));
  });

  it("ignores a player listed twice in the picks", async () => {
    const twice: EntryPicks = { ...picks, picks: [...picks.picks, { element: 3, position: 15, multiplier: 0, is_captain: false, is_vice_captain: false }] };
    const sheet = buildTeamSheet(twice, bootstrap, live);
    expect([...sheet.starters.flatMap((g) => g.players), ...sheet.bench].filter((p) => p.id === 3)).toHaveLength(1);
  });

  it("renders an unknown chip without crashing or printing junk", async () => {
    const m = ok(await load({ picks: async () => ({ ...picks, active_chip: "mystery_chip" }) }));
    expectClean(await renderTeam(m));
  });

  it("gives no React key warnings when two players share a name", async () => {
    const bs: Bootstrap = {
      ...bootstrap,
      elements: bootstrap.elements.map((e) => ({ ...e, web_name: "Gabriel", status: "d", chance_of_playing_next_round: 50, news: "Knock" })),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = ok(await load({ bootstrap: async () => bs, fixtures: async () => [] }));
    await renderTeam(m);
    expect(spy.mock.calls.map((c) => String(c[0])).filter((s) => /same key/i.test(s))).toEqual([]);
    spy.mockRestore();
  });
});

// --------------------------------------------------------------------------------------------------- captain and chips

describe("armband and chips", () => {
  // Haaland (4) captain didn't play; FPL lists him subbed off for Gvardiol (6) but leaves the slots as picked.
  const subbed: EntryPicks = {
    ...picks,
    automatic_subs: [{ element_in: 6, element_out: 4, entry: 7, event: 6 } as never],
    picks: picks.picks.map((p) =>
      p.element === 4 ? { ...p, multiplier: 0 } : p.element === 2 ? { ...p, multiplier: 2 } : p.element === 6 ? { ...p, multiplier: 1 } : p,
    ),
  };
  const noShow: EventLive = { elements: live.elements.map((e) => (e.id === 4 ? { id: 4, stats: { ...e.stats, total_points: 0, minutes: 0 } } : e)) };

  it("moves an auto-subbed player to the bench and the sub into the XI", () => {
    const sheet = buildTeamSheet(subbed, bootstrap, noShow);
    expect(sheet.bench.map((p) => p.id)).toContain(4);
    expect(sheet.starters.flatMap((g) => g.players).map((p) => p.id)).toContain(6);
  });
  it("leaves slots alone when FPL has already swapped them", () => {
    const swapped: EntryPicks = { ...subbed, picks: subbed.picks.map((p) => (p.element === 4 ? { ...p, position: 13 } : p.element === 6 ? { ...p, position: 4 } : p)) };
    const sheet = buildTeamSheet(swapped, bootstrap, noShow);
    expect(sheet.bench.map((p) => p.id)).toContain(4);
    expect(sheet.starters.flatMap((g) => g.players).map((p) => p.id)).toContain(6);
  });
  it("still has a captaincy card when the captain was auto-subbed, without a '0 × 0' sum", async () => {
    const sheet = buildTeamSheet(subbed, bootstrap, noShow);
    const c = captainInsight(sheet, new Map([[2, "finished"]]));
    expect(c?.captain.name).toBe("Haaland");
    expect(c?.state).toBe("unused");
    const m = ok(await load({ picks: async () => subbed, live: async () => noShow }));
    const html = await renderTeam(m);
    expect(html).not.toMatch(/\(0 × 0\)|× 0\)/);
  });
  it("credits Triple Captain to the vice-captain when he took the armband", () => {
    const tc: EntryPicks = { ...subbed, active_chip: "3xc", picks: subbed.picks.map((p) => (p.element === 2 ? { ...p, multiplier: 3 } : p)) };
    expect(chipContribution(buildTeamSheet(tc, bootstrap, noShow), "3xc")).toEqual({ chip: "3xc", points: 6 });
  });
  it("shows a negative Bench Boost as −2, never +-2", async () => {
    const bad: EventLive = { elements: live.elements.map((e) => (e.id === 5 ? { id: 5, stats: { ...e.stats, total_points: -2, minutes: 90 } } : e.id === 6 ? { id: 6, stats: { ...e.stats, total_points: 0 } } : e)) };
    const bb: EntryPicks = { ...picks, active_chip: "bboost", picks: picks.picks.map((p) => (p.position > 11 ? { ...p, multiplier: 1 } : p)) };
    const m = ok(await load({ picks: async () => bb, live: async () => bad }));
    expect(m.insights.gameweek.chip?.points).toBe(-2);
    const html = await renderTeam(m);
    expect(html).toContain("\u22122");
    expect(html).not.toContain("+-2");
  });
});

// ------------------------------------------------------------------------------------------------------------ charts

describe("charts with gaps", () => {
  it("never writes NaN coordinates", () => {
    const html = markup(<Sparkline values={[3, Number.NaN, 7, Number.POSITIVE_INFINITY, 1]} highlight={2} label="x" />);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(markup(<Sparkline values={[Number.NaN]} label="x" />)).toBe("");
  });
});

// ------------------------------------------------------------------------------------------------------------ freshness

describe("freshness", () => {
  it("marks a past gameweek final and the current one live", async () => {
    expect(ok(await load({}, "5")).gameweek.status).toBe("final");
    const now = ok(await load());
    expect(now.gameweek.status).toBe("live");
    expect(now.gameweek.isLive).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------------------- accessibility

describe("accessibility", () => {
  for (const trip of [false, true]) {
    it(`has no axe violations and no skipped heading levels${trip ? " (blotter)" : ""}`, async () => {
      testLanguage.trip = trip ? "1" : undefined;
      await initLocale();
      setRequestTrip(trip);
      const m = ok(await load({ history: async () => ({ current: [{ event: 5, points: 50, total_points: 400, rank: 1, overall_rank: 100000, bank: 0, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 0 }], past: [], chips: [] }) }));
      document.body.innerHTML = `<main>${await renderTeam(m)}</main>`;
      await expectNoAxeViolations(document.body);
      const levels = [...document.body.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `h${levels[i - 1]} -> h${levels[i]}`).toBeLessThanOrEqual(1);
      document.body.innerHTML = "";
    });
  }
});

// ----------------------------------------------------------------------------------------------- press conference fuzz

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random but legal-looking world: sparse stats, any chip, any armband, flags, a hit, sometimes no history. */
function randomWorld(seed: number) {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const maybe = <T,>(v: T) => (r() < 0.3 ? undefined : v);
  const cap = int(1, 4);
  const vice = (cap % 4) + 1;
  const chip = [null, null, "bboost", "3xc", "freehit", "wildcard", "manager", "mystery"][int(0, 7)];
  const p: EntryPicks = {
    ...picks,
    active_chip: chip,
    entry_history: { ...picks.entry_history, points: int(-8, 120), event_transfers_cost: [0, 0, 4, 8][int(0, 3)], overall_rank: r() < 0.2 ? (null as never) : int(1, 9_000_000), bank: int(0, 40) },
    picks: picks.picks.map((x) => ({ ...x, is_captain: x.element === cap, is_vice_captain: x.element === vice, multiplier: x.position > 11 ? (chip === "bboost" ? 1 : 0) : x.element === cap ? (chip === "3xc" ? 3 : 2) : 1 })),
  };
  const l: EventLive | null =
    r() < 0.15
      ? null
      : { elements: [1, 2, 3, 4, 5, 6].filter(() => r() > 0.1).map((id) => ({ id, stats: { total_points: int(-3, 24), minutes: maybe(int(0, 90)), bps: maybe(int(-5, 60)), goals_scored: maybe(int(0, 3)), assists: maybe(int(0, 2)), defensive_contribution: maybe(int(0, 14)), yellow_cards: maybe(int(0, 1)), red_cards: maybe(r() < 0.05 ? 1 : 0), saves: maybe(int(0, 6)), bonus: maybe(int(0, 3)), expected_goals: maybe(r() < 0.5 ? String(r()) : "x") } as never })) };
  const bs: Bootstrap = {
    ...bootstrap,
    elements: bootstrap.elements.map((e) => ({ ...e, status: maybe(["a", "d", "i", "s", "u"][int(0, 4)]), chance_of_playing_next_round: maybe([0, 25, 50, 75, 100][int(0, 4)]) as never, form: maybe(String(int(0, 10))), selected_by_percent: maybe(String(r() * 80)) as never, news: maybe("Knock") })),
  };
  const history = r() < 0.3 ? null : { current: [1, 2, 3, 4, 5].map((ev) => ({ event: ev, points: int(20, 90), total_points: ev * 55, rank: int(1, 9e6), overall_rank: int(1, 9e6), bank: int(0, 30), value: 1000, event_transfers: int(0, 3), event_transfers_cost: 0, points_on_bench: int(0, 20) })), past: [], chips: r() < 0.5 ? [{ name: "wildcard", event: 2 }] : [] };
  const names = r() < 0.2 ? { player_first_name: "", player_last_name: "" } : {};
  return { p, l, bs, history, names, gw: r() < 0.25 ? "5" : undefined, phase: r() };
}

describe("press conference fuzz", () => {
  const SEEDS = 40;
  for (const locale of ["en", "es", "fr"] as const) {
    for (const trip of [false, true]) {
      it(`reads clean in ${locale}${trip ? " (blotter)" : ""} for ${SEEDS} random teams`, async () => {
        testLanguage.cookie = locale;
        testLanguage.trip = trip ? "1" : undefined;
        await initLocale();
        setRequestTrip(trip);
        let checked = 0;
        for (let s = 1; s <= SEEDS; s++) {
          const w = randomWorld(s * 7919 + (trip ? 1 : 0));
          const events = w.phase < 0.3 ? [event({ id: 5, name: "Gameweek 5", is_current: false, finished: true, data_checked: true }), event({ finished: true, data_checked: w.phase < 0.15 })] : bootstrap.events;
          const m = await load({ bootstrap: async () => ({ ...w.bs, events }), picks: async () => w.p, live: async () => w.l as never, history: async () => w.history as never, entry: async () => entry(w.names) }, w.gw);
          if (m.kind !== "ok") continue;
          for (const variety of [0, 1, 2]) {
            // A different day is a different seed for the conference.
            document.body.innerHTML = markup(<InterviewPanel model={m} now={new Date(NOW.getTime() + variety * 86_400_000)} />);
            const blocks = [...document.body.querySelectorAll("p, li, h2, h3, blockquote, figcaption, dt, dd")].map((e) => e.textContent ?? "").filter(Boolean);
            for (const text of blocks) {
              checked++;
              const where = `${locale}${trip ? "/trip" : ""} seed ${s} variety ${variety}: ${text.slice(0, 160)}`;
              expect(JUNK.test(text), where).toBe(false);
              expect(/ {2}/.test(text), where).toBe(false);
              expect(/ [,.;:!?](?!\d)/.test(text) && locale !== "fr", where).toBe(false);
              expect(/\{\w+\}|\$\{/.test(text), where).toBe(false);
              if (locale === "es") expect((text.match(/¿/g) ?? []).length <= (text.match(/\?/g) ?? []).length, where).toBe(true);
            }
          }
        }
        // Most random teams produce a conference of seven exchanges: the fuzz must actually have read them.
        expect(checked).toBeGreaterThan(SEEDS * 3 * 7);
        document.body.innerHTML = "";
      }, 60_000);
    }
  }
});
