/**
 * Journey: the Tools page (/tools) walked through every moment of a season, rendered by the real page, service and view
 * from the shared in-memory season, with the streamed (Suspense) slots resolved the way the page's own wiring resolves
 * them, so the whole page is checked, not just its first paint.
 *
 * 1. What the page tells you at every moment: the brief, the countdown, section order and jump links, honest labels,
 *    which gameweek's picks each league tool shows, missing data, and junk in the query.
 * 2. The numbers are right: every figure recomputed here from the world's own data and compared with what is rendered.
 */
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import type { Locale } from "@/lib/domain/i18n/locales";
import type { FplElement, ScheduledFixture } from "@/lib/domain/types";
import type { ToolsDeferredSlots } from "@/components/views/ToolsView";
import type { ToolsModel } from "@/lib/services/models";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { install, jsonRes, playerName, season, teams, uninstall, PHASES, type PhaseName, type Routes, type World, type WorldOptions } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

// ------------------------------------------------------------------------------------------------ visiting the page

interface Lang {
  locale: Locale;
  trip: boolean;
}
const EN: Lang = { locale: "en", trip: false };
const catalog = (l: Lang): Messages => (l.trip ? tripMessagesFor(l.locale) : MESSAGES[l.locale]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
type Query = Record<string, string | string[]>;

/** What one of the page's Suspense slots resolves to: the async server component inside it, run. */
async function resolveSlot(n: ReactNode): Promise<ReactNode> {
  const child = (n as ReactElement<{ children: ReactElement }>).props.children;
  return await (child.type as (p: unknown) => Promise<ReactElement>)(child.props);
}

interface Visit {
  html: string;
  doc: Document;
  text: string;
  /** The first paint: the page with each slot's fallback. */
  firstPaint: Document;
  model: Extract<ToolsModel, { kind: "ok" }>;
}

/** Fresh modules, the world behind fetch, the request's language, then the real page with its streamed slots resolved. */
async function visit(world: World, { extra = [], lang = EN, query = {} }: { extra?: Routes; lang?: Lang; query?: Query } = {}): Promise<Visit> {
  vi.resetModules();
  uninstall();
  install(world, extra);
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  const page = (await import("@/app/tools/page")).default;
  const element = (await page({ searchParams: Promise.resolve(query) })) as ReactElement<{ model: Visit["model"]; deferred: ToolsDeferredSlots }>;
  const { ToolsView } = await import("@/components/views/ToolsView");
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  const d = element.props.deferred;
  const slots = ["eo", "league", "nav", "injuries", "injuriesNav"] as const;
  const arrived = { kept: d.kept } as ToolsDeferredSlots;
  const fallback = { kept: d.kept } as ToolsDeferredSlots;
  for (const k of slots) {
    arrived[k] = await resolveSlot(d[k]);
    fallback[k] = (d[k] as ReactElement<{ fallback: ReactNode }>).props.fallback;
  }
  const paint = (slotsNow: ToolsDeferredSlots) =>
    renderToStaticMarkup(
      <I18nProvider locale={lang.locale} trip={lang.trip}>
        <ToolsView model={element.props.model} deferred={slotsNow} />
      </I18nProvider>,
    );
  const html = paint(arrived);
  const parse = (h: string) => new DOMParser().parseFromString(h, "text/html");
  const doc = parse(html);
  const { services } = await import("@/lib/container");
  const { leagueId } = await import("@/lib/config");
  const model = await services.tools.load(leagueId(), query);
  if (model.kind !== "ok") throw new Error("the tools model should always be ok");
  return { html, doc, text: norm(doc.body.textContent), firstPaint: parse(paint(fallback)), model };
}

// ------------------------------------------------------------------------------------------------ reading the page

const G = (n: number) => `Gameweek ${n}`;
const NAME = /(?:ARS|MCI|CHE|NEW|LIV|TOT|EVE|BHA) (?:GK|D1|D2|M1|M2|F1)/g;
/** Every player name in an element's text, in order (crest initials and club tags don't get in the way). */
const namesIn = (el: Element | null | undefined) => [...norm(el?.textContent).matchAll(NAME)].map((m) => m[0]);
const rowsIn = (el: Element | null | undefined) => [...(el?.querySelectorAll("tbody tr") ?? [])];
const cellsOf = (tr: Element) => [...tr.children].map((c) => norm(c.textContent));
const sectionIds = (doc: Document) => [...doc.querySelectorAll(".grid > section[id]")].map((s) => s.id);
const navGroups = (doc: Document) =>
  [...doc.querySelectorAll("nav .jumpGroup")].map((g) => ({ label: norm(g.querySelector(".jumpLabel")?.textContent), hrefs: [...g.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "") }));
const pct = (x: number) => `${(Math.round((x + Number.EPSILON) * 10) / 10).toFixed(1)}%`;
const one = (x: number) => ((Math.round((x + Number.EPSILON) * 10) / 10) || 0).toFixed(1).replace("-", "−");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** No undefined, NaN, Infinity or [object Object] anywhere a reader (or a screen reader) could see. */
function expectClean(v: Pick<Visit, "html" | "text">, where: string) {
  for (const bad of ["undefined", "NaN", "Infinity", "[object Object]", "null%"]) expect(v.text.includes(bad), `${where}: "${bad}" on the page`).toBe(false);
  for (const m of v.html.matchAll(/(?:href|aria-label|title|value)="([^"]*)"/g)) expect(/undefined|NaN|\[object/.test(m[1]), `${where}: attribute ${m[0]}`).toBe(false);
}

/** Every jump link leads to an element that is on the page; ids are unique. */
function expectLinksLand(doc: Document, where: string) {
  const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
  expect(ids.length, `${where}: ids are unique`).toBe(new Set(ids).size);
  for (const g of navGroups(doc)) for (const h of g.hrefs) {
    expect(h.startsWith("#"), `${where}: nav link ${h} is an in-page link`).toBe(true);
    expect(doc.getElementById(h.slice(1)), `${where}: nav link ${h} (${g.label}) lands on the page`).not.toBeNull();
  }
}

// ------------------------------------------------------------------------------------------------ the oracle

/** The latest gameweek whose deadline has passed: the one whose picks are locked in (null before the first deadline). */
const lockedGw = (w: World) => {
  const passed = w.bootstrap.events.filter((e) => Date.parse(e.deadline_time) <= w.now.getTime()).map((e) => e.id);
  return passed.length ? Math.max(...passed) : null;
};
const nextEvent = (w: World) => [...w.bootstrap.events].filter((e) => Date.parse(e.deadline_time) > w.now.getTime()).sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0] ?? null;
const element = (w: World, id: number) => w.bootstrap.elements.find((e) => e.id === id)!;
const rankOrder = (w: World) => [...w.standings].sort((a, b) => a.rank - b.rank).map((r) => r.entry);
const managerOf = (w: World, entry: number) => w.managers.find((m) => m.entry === entry)!;
const picksOf = (w: World, entry: number) => w.truth.picksFor(entry, lockedGw(w)!).picks;
const short = (club: number) => teams.find((t) => t.id === club)!.short_name;
const fit = (e: FplElement) => (e.status ?? "a") === "a" || (e.status === "d" && (e.chance_of_playing_next_round ?? 0) >= 75);
const ep = (e: FplElement) => Number(e.ep_next);

/** Effective ownership over every manager's locked-in picks: a starter counts his multiplier (2 captain, 3 triple), the bench nothing. */
function eoOracle(w: World, entries: number[]) {
  const by = new Map<number, { eo: number; started: number; captained: number }>();
  for (const entry of entries)
    for (const p of picksOf(w, entry)) {
      if (p.multiplier <= 0) continue;
      const r = by.get(p.element) ?? { eo: 0, started: 0, captained: 0 };
      r.eo += p.multiplier;
      r.started += 1;
      if (p.is_captain) r.captained += 1;
      by.set(p.element, r);
    }
  const n = entries.length;
  const share = (x: number) => Math.round((x / n) * 1000) / 10;
  return [...by].map(([id, r]) => ({ id, eo: share(r.eo), started: share(r.started), captained: share(r.captained) })).sort((a, b) => b.eo - a.eo || b.started - a.started || a.id - b.id);
}

/** How many of the read squads own and start each player. */
function ownershipOracle(w: World, entries: number[]) {
  const c = new Map<number, { owners: number; starters: number; captains: number; teams: string[] }>();
  for (const entry of rankOrder(w).filter((e) => entries.includes(e)))
    for (const p of picksOf(w, entry)) {
      const r = c.get(p.element) ?? { owners: 0, starters: 0, captains: 0, teams: [] };
      r.owners += 1;
      if (p.position <= 11) r.starters += 1;
      if (p.is_captain) r.captains += 1;
      r.teams.push(managerOf(w, entry).teamName);
      c.set(p.element, r);
    }
  return c;
}

const SHAPES: [number, number, number][] = [];
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) SHAPES.push([d, m, f]);

/** The most-owned legal eleven, ties broken by starts then id, found by trying every legal shape. */
function templateOracle(w: World, entries: number[]) {
  const own = ownershipOracle(w, entries);
  const pool = (pos: number) => [...own].filter(([id]) => element(w, id).element_type === pos).sort(([a, x], [b, y]) => y.owners - x.owners || y.starters - x.starters || a - b);
  const value = (xs: [number, { owners: number; starters: number }][]) => xs.reduce((s, [, r]) => s + r.owners * 1000 + r.starters, 0);
  let best: { shape: [number, number, number]; value: number } | null = null;
  for (const shape of SHAPES) {
    const [d, m, f] = shape;
    if (pool(2).length < d || pool(3).length < m || pool(4).length < f || pool(1).length < 1) continue;
    const v = value([...pool(1).slice(0, 1), ...pool(2).slice(0, d), ...pool(3).slice(0, m), ...pool(4).slice(0, f)]);
    if (!best || v > best.value) best = { shape, value: v };
  }
  const [d, m, f] = best!.shape;
  const lines = [pool(1).slice(0, 1), pool(2).slice(0, d), pool(3).slice(0, m), pool(4).slice(0, f)].map((xs) => xs.map(([id, r]) => ({ id, share: Math.round((r.owners / entries.length) * 1000) / 10 })));
  return { formation: `${d}-${m}-${f}`, lines };
}

/** FPL's expected points' best legal eleven of players likely to play; the top scorer captains. */
function xiOracle(w: World) {
  const pool = (pos: number) => w.bootstrap.elements.filter((e) => e.element_type === pos && fit(e)).sort((a, b) => ep(b) - ep(a) || b.id - a.id);
  const sum = (xs: FplElement[]) => xs.reduce((s, e) => s + ep(e), 0);
  let best: { shape: [number, number, number]; value: number } | null = null;
  for (const shape of SHAPES) {
    const v = sum(pool(1).slice(0, 1)) + sum(pool(2).slice(0, shape[0])) + sum(pool(3).slice(0, shape[1])) + sum(pool(4).slice(0, shape[2]));
    if (!best || v > best.value + 1e-9) best = { shape, value: v };
  }
  const [d, m, f] = best!.shape;
  const chosen = [...pool(1).slice(0, 1), ...pool(2).slice(0, d), ...pool(3).slice(0, m), ...pool(4).slice(0, f)];
  const captain = [...chosen].sort((a, b) => ep(b) - ep(a) || b.id - a.id)[0];
  return { formation: `${d}-${m}-${f}`, ids: chosen.map((e) => e.id), captain: captain.id, total: Math.round((best!.value + ep(captain)) * 10) / 10 };
}

/** FPL's chip windows judged at the next deadline against each manager's history. */
function chipOracle(w: World, entry: number, histChips: { name: string; event: number }[]) {
  const chips = w.bootstrap.chips!;
  const ref = nextEvent(w)?.id ?? Math.max(...chips.map((c) => c.stop_event)) + 1;
  const out: Record<string, { state: "used" | "open" | "later" | "gone"; gw?: number; until?: number; from?: number; again: number | null }> = {};
  let left = 0;
  for (const name of ["wildcard", "freehit", "bboost", "3xc"]) {
    const windows = chips.filter((c) => c.name === name).sort((a, b) => a.start_event - b.start_event);
    const judged = windows.map((win) => {
      const used = histChips.find((c) => c.name === name && c.event >= win.start_event && c.event <= win.stop_event);
      const state = used ? "used" : win.stop_event < ref ? "gone" : win.start_event > ref ? "later" : "open";
      return { win, used, state } as const;
    });
    left += judged.filter((j) => j.state === "open" || j.state === "later").length;
    const cur = judged.find((j) => j.win.start_event <= ref && ref <= j.win.stop_event) ?? judged.find((j) => j.win.start_event > ref) ?? judged[judged.length - 1];
    const after = judged.find((j) => j.win.start_event > cur.win.stop_event && (j.state === "open" || j.state === "later"));
    out[name] = { state: cur.state, gw: cur.used?.event, until: cur.win.stop_event, from: cur.win.start_event, again: after ? after.win.start_event : null };
  }
  return { cells: out, left };
}
const HISTORY_CHIPS: Record<number, { name: string; event: number }[]> = { 7: [{ name: "wildcard", event: 3 }], 2: [{ name: "bboost", event: 2 }] };

/** Price pressure: net transfers against owners, both a share and a head count must clear the bar. */
function priceOracle(w: World) {
  const total = w.bootstrap.total_players!;
  const ORDER = ["likelyRise", "closeRise", "rose", "steady", "fell", "closeFall", "likelyFall"];
  return w.bootstrap.elements
    .map((e) => {
      const owned = Number(e.selected_by_percent) || 0;
      const owners = (total * owned) / 100;
      const net = (e.transfers_in_event ?? 0) - (e.transfers_out_event ?? 0);
      const share = owners > 0 ? Math.round((net / owners) * 1000) / 10 : 0;
      const cc = e.cost_change_event ?? 0;
      const status =
        cc > 0 ? "rose" : cc < 0 ? "fell"
        : share >= 4 && net >= total * 0.005 ? "likelyRise"
        : share >= 2 && net >= total * 0.0025 ? "closeRise"
        : share <= -4 && -net >= total * 0.005 ? "likelyFall"
        : share <= -2 && -net >= total * 0.0025 ? "closeFall"
        : "steady";
      return { id: e.id, name: e.web_name, team: e.team, pos: e.element_type, net, share, owned, status };
    })
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Math.abs(b.net) - Math.abs(a.net) || a.id - b.id);
}

/** Each club's matches in a gameweek of a schedule, in kick-off order. */
const matchesOf = (schedule: ScheduledFixture[], club: number, gw: number) =>
  schedule
    .filter((f) => f.event === gw && (f.team_h === club || f.team_a === club))
    .sort((a, b) => String(a.kickoff_time).localeCompare(String(b.kickoff_time)) || a.id - b.id)
    .map((f) => (f.team_h === club ? { opp: f.team_a, home: true, d: f.team_h_difficulty } : { opp: f.team_h, home: false, d: f.team_a_difficulty }));

/** Fixture swings over the next five gameweeks: a blank counts as the hardest (5), a double counts both matches. */
function swingOracle(w: World, schedule: ScheduledFixture[]) {
  const from = nextEvent(w)!.id;
  const gws = w.bootstrap.events.map((e) => e.id).filter((id) => id >= from).sort((a, b) => a - b).slice(0, 5);
  const scheduled = new Set(gws.filter((g) => schedule.some((f) => f.event === g)));
  const avg = (club: number, span: number[]) => {
    const ds = span.flatMap((g) => {
      const ms = matchesOf(schedule, club, g);
      return ms.length ? ms.map((m) => m.d) : scheduled.has(g) ? [5] : [];
    });
    return round2(ds.reduce((s, d) => s + d, 0) / ds.length);
  };
  const rows = teams.map((t) => {
    const soon = avg(t.id, gws.slice(0, 2));
    const later = avg(t.id, gws.slice(2));
    return { club: t.short_name, id: t.id, soon, later, change: round2(soon - later), blanks: gws.filter((g) => matchesOf(schedule, t.id, g).length === 0) };
  });
  return {
    gws,
    easing: rows.filter((r) => r.change >= 0.5).sort((a, b) => b.change - a.change || a.club.localeCompare(b.club)).slice(0, 5),
    hardening: rows.filter((r) => r.change <= -0.5).sort((a, b) => a.change - b.change || a.club.localeCompare(b.club)).slice(0, 5),
  };
}

/** The schedule with every fixture of the given (gameweek, club) pairs removed: blank gameweeks. */
const blanked = (schedule: ScheduledFixture[], pairs: [number, number][]) => schedule.filter((f) => !pairs.some(([g, c]) => f.event === g && (f.team_h === c || f.team_a === c)));
const scheduleRoute = (schedule: ScheduledFixture[] | (() => Response)): Routes => [[(u) => u.endsWith("/api/fixtures/"), typeof schedule === "function" ? schedule : () => jsonRes(schedule)]];
const down = () => new Response("Service Unavailable", { status: 503 });

/** Owned players with FPL flags, plus one flagged player nobody in the league owns (LIV M2). */
const FLAGS: NonNullable<WorldOptions["flags"]> = {
  16: { status: "i", news: "Ankle injury - unknown return date", chance: 0 },
  12: { status: "d", news: "Hamstring - 50% chance of playing", chance: 50 },
  13: { status: "d", news: "Knock - 75% chance of playing", chance: 75 },
  85: { status: "d", news: "Illness - 25% chance of playing", chance: 25 },
  15: { status: "s", news: "Suspended for 1 match", chance: 0 },
  55: { status: "i", news: "Knee injury - expected back in November", chance: 0 },
};

// ================================================================================================ 1. every moment

it("what the page tells you at every moment", async () => {
  const t = MESSAGES.en;
  const tt = t.tools;
  const b = tt.brief;
  const lt = tt.leagueTools;
  const EXPECT_LEAD: Record<PhaseName, (w: World) => string[] | RegExp> = {
    preseason: () => b.upcoming.map((f) => f(G(1))),
    // GW7 is flagged current a day before its deadline: GW6 is where the season stands, final, and GW7 is next.
    upcoming: () => b.final.map((f) => f(G(6), G(7))),
    "live-playing": () => b.live.map((f) => f(G(6), G(7))),
    // a quiet gap between Sunday's and Monday's matches: paused until the next kick-off, never "matches are on"
    "live-between": () => new RegExp(`^(?:${b.paused.map((f) => f(G(6), "\u0000", G(7)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "(?<when>.+)")).join("|")})$`),
    "live-over": () => b.provisional.map((f) => f(G(6), G(7))),
    provisional: () => b.provisional.map((f) => f(G(6), G(7))),
    final: () => b.final.map((f) => f(G(6), G(7))),
    "season-over": () => b.over.map((f) => f(G(38))),
  };

  for (const phase of PHASES) {
    const world = season(phase);
    const v = await visit(world);
    const where = phase;
    const locked = lockedGw(world);
    const next = nextEvent(world);
    expectClean(v, where);
    expect(norm(v.doc.querySelector("h1")?.textContent), `${where}: heading`).toBe(tt.heading);

    // ---- the brief
    const lead = norm(v.doc.querySelector("#brief .briefLead")?.textContent);
    const want = EXPECT_LEAD[phase](world);
    if (want instanceof RegExp) {
      const m = lead.match(want);
      expect(m, `${where}: brief "${lead}" says the gameweek is paused until the next kick-off`).not.toBeNull();
      // the next kick-off is Monday 19:00 UTC (the 4th match of the gameweek), in the reader's time (UTC on the server)
      const nextKick = world.schedule.filter((f) => f.event === 6 && Date.parse(f.kickoff_time!) > world.now.getTime()).map((f) => Date.parse(f.kickoff_time!)).sort((x, y) => x - y)[0];
      expect(new Date(nextKick).toISOString(), `${where}: the world's next kick-off`).toBe("2026-10-12T19:00:00.000Z");
      expect(m!.groups!.when, `${where}: paused until when`).toMatch(/Monday.*19:00/);
    } else expect(want, `${where}: brief lead "${lead}"`).toContain(lead);
    if (phase !== "live-playing") for (const f of b.live) expect(lead, `${where}: does not claim matches are on`).not.toBe(f(G(6), G(7)));
    if (phase === "preseason") expect(lead, `${where}: names the first deadline`).toContain(G(1));
    const lines = [...v.doc.querySelectorAll("#brief .briefList li")].map((li) => norm(li.textContent));
    // the average manager's score is FPL's, only once the gameweek has been played and not while it is live
    const avgEvent = world.bootstrap.events.find((e) => e.id === (phase === "season-over" ? 38 : 6));
    const hasAverage = ["upcoming", "provisional", "final", "season-over"].includes(phase);
    expect(lines.some((l) => b.average.some((f) => f(G(avgEvent!.id), t.common.points(avgEvent!.average_entry_score ?? -1)) === l)), `${where}: average line ${JSON.stringify(lines)}`).toBe(hasAverage);
    // the crowd: most bought / sold from bootstrap (BHA F1 has the most transfers in and out in this world)
    const most = (k: "transfers_in_event" | "transfers_out_event") => [...world.bootstrap.elements].sort((x, y) => (y[k] ?? 0) - (x[k] ?? 0) || x.id - y.id)[0];
    const bought = most("transfers_in_event");
    const sold = most("transfers_out_event");
    expect(lines.some((l) => b.bought.some((f) => f(bought.web_name, short(bought.team), bought.transfers_in_event!.toLocaleString("en-GB")) === l)), `${where}: most bought line`).toBe(true);
    expect(lines.some((l) => b.sold.some((f) => f(sold.web_name, short(sold.team), sold.transfers_out_event!.toLocaleString("en-GB")) === l)), `${where}: most sold line`).toBe(true);

    // ---- the countdown
    const timer = v.doc.querySelector("section[aria-label^='Next deadline']");
    if (next) {
      expect(timer, `${where}: deadline countdown`).not.toBeNull();
      expect(norm(timer!.querySelector(".gw")?.textContent), `${where}: countdown names the next gameweek`).toBe(G(next.id));
      const ms = Date.parse(next.deadline_time) - world.now.getTime();
      const s = Math.floor(ms / 1000);
      const want2 = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0"));
      expect([...timer!.querySelectorAll(".value")].map((x) => norm(x.textContent)), `${where}: days, hours, minutes, seconds to the deadline`).toEqual(want2);
      const time = timer!.querySelector("time");
      expect(time?.getAttribute("dateTime"), `${where}: deadline as a machine-readable time, shown in the reader's zone`).toBe(new Date(next.deadline_time).toISOString());
      expect(norm(time?.textContent), `${where}: the server paint is labelled UTC, never a wrong local time`).toMatch(/ UTC$/);
    } else expect(timer, `${where}: no countdown when no deadline is left`).toBeNull();

    // ---- section order and jump links: before the deadline, transfers, league
    const squads = locked !== null;
    const deadlineIds = [...(squads ? ["injury-watch"] : []), ...(next ? ["shortlist", "xi"] : [])];
    const transferIds = next ? ["swings", "pairs", "prices", "setpieces"] : ["prices", "setpieces"];
    const leagueIds = ["eo", "chip-tracker", ...(squads ? ["template", "differentials", "head-to-head"] : []), "teams"];
    const groups = navGroups(v.doc);
    expect(groups.map((g) => g.label), `${where}: nav groups in decision order`).toEqual([tt.groups.deadline, tt.groups.transfers, tt.groups.league]);
    expect(groups.map((g) => g.hrefs), `${where}: nav links`).toEqual([deadlineIds, transferIds, leagueIds].map((ids) => ids.map((id) => `#${id}`)));
    expect(sectionIds(v.doc), `${where}: sections in the same order as the nav`).toEqual(["brief", ...deadlineIds, ...transferIds, ...leagueIds]);
    expect([...v.doc.querySelectorAll(".grid > p.group")].map((p) => norm(p.textContent)), `${where}: group labels in the page`).toEqual([tt.groups.deadline, tt.groups.transfers, tt.groups.league]);
    expectLinksLand(v.doc, where);
    // the first paint (before the squads arrive) never links to a streamed section that isn't there yet
    expectLinksLand(v.firstPaint, `${where} (first paint)`);
    expect(v.firstPaint.querySelectorAll("[role=status]").length, `${where}: first paint says what it waits for (injuries, EO, league)`).toBe(3);

    // ---- honest labels: the projected XI is a projection for the next gameweek, the shortlist a simulation
    if (next) {
      const xi = v.doc.querySelector("#xi");
      expect(norm(xi?.querySelector("h2")?.textContent), `${where}: XI title`).toBe(tt.xi.title(G(next.id)));
      expect(norm(xi?.querySelector("header .badge")?.textContent), `${where}: XI badge`).toBe(tt.xi.badge);
      expect(groups[0].hrefs.includes("#xi") && norm(v.doc.querySelector('nav a[href="#xi"]')?.textContent), `${where}: nav says Projected XI`).toBe("Projected XI");
      expect(norm(v.doc.querySelector("#shortlist h2")?.textContent), `${where}: shortlist is for the next gameweek`).toContain(G(next.id));
    }

    // ---- which gameweek's picks the league tools show
    const eoCard = v.doc.querySelector("#eo");
    const picksFrom = locked !== null && next ? lt.picksFrom(G(locked), G(next.id)) : null;
    if (squads) {
      expect(norm(eoCard?.querySelector(".note")?.textContent), `${where}: EO note names the gameweek`).toContain(G(locked!));
      if (picksFrom) expect(norm(eoCard?.querySelector(".aside")?.textContent), `${where}: EO says whose picks`).toBe(picksFrom);
      else expect(eoCard?.querySelector(".aside"), `${where}: no "next picks hidden" note once the season is over`).toBeNull();
      const h2hNote = norm(v.doc.querySelector("#head-to-head .note")?.textContent);
      expect(h2hNote, `${where}: head to head says whose picks`).toBe(picksFrom ?? lt.squadsFrom(G(locked!), 6, 6));
      const injScope = norm(v.doc.querySelector("#injury-watch .scope")?.textContent);
      expect(injScope, `${where}: injury watch says whose squads`).toBe([lt.squadsFrom(G(locked!), 6, 6), next ? lt.nextHidden(G(next.id)) : null].filter(Boolean).join(" "));
      const tplScope = norm(v.doc.querySelector("#template .scope")?.textContent);
      expect(tplScope, `${where}: template says whose squads`).toBe(injScope);
    } else {
      expect(tt.eo.none, `${where}: EO says there is nothing to count yet`).toContain(norm(eoCard?.querySelector(".note")?.textContent));
    }
    const chipScope = norm(v.doc.querySelector("#chip-tracker .scope")?.textContent);
    if (locked !== null && next) expect(chipScope, `${where}: chip tracker says up to which gameweek`).toBe(lt.chipsFrom(G(locked), G(next.id)));
    else expect(v.doc.querySelector("#chip-tracker .scope"), `${where}: no "chips up to" note without a played and a next gameweek`).toBeNull();
  }

  // ---- no tool takes the page down when its data is missing
  const final = season("final");
  const failing: { name: string; extra: Routes; check: (v: Visit, where: string) => void }[] = [
    {
      name: "schedule 503",
      extra: scheduleRoute(down),
      check: (v, where) => {
        // the schedule feeds the shortlist, swings and rotation pairs: they go, everything else stays
        for (const id of ["shortlist", "swings", "pairs"]) expect(v.doc.getElementById(id), `${where}: #${id} needs the schedule`).toBeNull();
        for (const id of ["brief", "injury-watch", "xi", "prices", "setpieces", "eo", "chip-tracker", "template", "differentials", "head-to-head", "teams"]) expect(v.doc.getElementById(id), `${where}: #${id} survives`).not.toBeNull();
        // no fixture known: the XI shows no opponent rather than a made-up one
        expect(v.doc.querySelectorAll("#xi .chip").length, `${where}: XI without opponents`).toBe(0);
        // the brief can't tell whether a match is on, so it doesn't pretend either way
        expect(MESSAGES.en.tools.brief.final.map((f) => f(G(6), G(7)))).toContain(norm(v.doc.querySelector("#brief .briefLead")?.textContent));
      },
    },
    {
      name: "standings 503",
      extra: [[(u) => u.includes("/leagues-classic/"), down]],
      check: (v, where) => {
        for (const id of ["injury-watch", "chip-tracker", "template", "differentials", "head-to-head"]) expect(v.doc.getElementById(id), `${where}: #${id} needs the league`).toBeNull();
        expect(MESSAGES.en.tools.eo.none, `${where}: EO says it has nothing`).toContain(norm(v.doc.querySelector("#eo .note")?.textContent));
        expect(v.doc.querySelectorAll("#teams li").length, `${where}: no teams to open`).toBe(0);
        for (const id of ["shortlist", "xi", "swings", "pairs", "prices", "setpieces"]) expect(v.doc.getElementById(id), `${where}: #${id} needs no league`).not.toBeNull();
      },
    },
    {
      name: "picks failing for two managers",
      extra: [[(u) => /\/entry\/(3|5)\/event\/\d+\/picks\//.test(u), () => new Response("err", { status: 500 })]],
      check: (v, where) => {
        expect(norm(v.doc.querySelector("#injury-watch .scope")?.textContent), `${where}: says how many squads were read`).toContain(MESSAGES.en.tools.leagueTools.squadsFrom(G(6), 4, 6));
        // the head to head can only offer the four squads it read
        const selects = [...v.doc.querySelectorAll("#head-to-head select[name=vs]")];
        expect(selects.length, `${where}: two pickers`).toBe(2);
        for (const s of selects) expect([...s.querySelectorAll("option")].map((o) => o.getAttribute("value")), `${where}: head to head options`).toEqual(final.standings.filter((r) => ![3, 5].includes(r.entry)).map((r) => String(r.entry)));
        // the chip tracker reads histories, which all arrived
        expect(rowsIn(v.doc.querySelector("#chip-tracker")).length, `${where}: chip rows`).toBe(6);
        expect(norm(v.doc.querySelector("#template .note")?.textContent), `${where}: template from 4 squads`).toMatch(/\b4\b/);
        expect(rowsIn(v.doc.querySelector("#differentials")).length, `${where}: differentials for the 4 read`).toBe(4);
      },
    },
    {
      name: "history failing for everyone",
      extra: [[(u) => /\/entry\/\d+\/history\/$/.test(u), () => new Response("err", { status: 500 })]],
      check: (v, where) => {
        expect(v.doc.getElementById("chip-tracker"), `${where}: no chip tracker without histories`).toBeNull();
        for (const id of ["injury-watch", "eo", "template", "differentials", "head-to-head"]) expect(v.doc.getElementById(id), `${where}: #${id} survives`).not.toBeNull();
      },
    },
    {
      name: "picks and histories failing for everyone",
      extra: [[(u) => /\/entry\/\d+\/(event\/\d+\/picks|history)\/$/.test(u), () => new Response("err", { status: 502 })]],
      check: (v, where) => {
        for (const id of ["injury-watch", "chip-tracker", "template", "differentials", "head-to-head"]) expect(v.doc.getElementById(id), `${where}: #${id} has nothing to show`).toBeNull();
        expect(MESSAGES.en.tools.eo.none, `${where}: EO says it has nothing`).toContain(norm(v.doc.querySelector("#eo .note")?.textContent));
        expect(v.doc.querySelectorAll("#teams li").length, `${where}: teams still listed`).toBe(6);
      },
    },
    {
      name: "bootstrap nonsense fields",
      extra: [[(u) => u.includes("/bootstrap-static/"), () => jsonRes({ ...final.bootstrap, elements: final.bootstrap.elements.map((e, i) => (i % 7 === 0 ? { ...e, ep_next: "abc", now_cost: null, selected_by_percent: "x", transfers_in_event: "lots" } : e)) })]],
      check: (v, where) => {
        for (const id of ["brief", "xi", "prices", "eo", "teams"]) expect(v.doc.getElementById(id), `${where}: #${id} survives`).not.toBeNull();
      },
    },
  ];
  for (const f of failing) {
    const where = `final, ${f.name}`;
    const v = await visit(final, { extra: f.extra });
    expectClean(v, where);
    expectLinksLand(v.doc, where);
    expectLinksLand(v.firstPaint, `${where} (first paint)`);
    expect(v.doc.querySelector("#brief"), `${where}: the brief is still there`).not.toBeNull();
    expect(v.doc.querySelector("#prices"), `${where}: price changes still there`).not.toBeNull();
    // every section the page shows has a jump link, and every jump link a section
    const linked = navGroups(v.doc).flatMap((g) => g.hrefs.map((h) => h.slice(1)));
    expect(sectionIds(v.doc).filter((id) => id !== "brief"), `${where}: sections and links agree`).toEqual(linked);
    f.check(v, where);
  }

  // ---- junk in the query: kept safe, never echoed raw, never a crash
  const junk: { q: Query; check: (v: Visit, where: string) => void }[] = [
    {
      q: { q: '<script>alert("x")</script>', pos: "9", team: "999", moving: "yes", eo: "bogus", by: "nonsense", vs: "1,1" },
      check: (v, where) => {
        expect(v.html.includes("<script>alert"), `${where}: the search is escaped`).toBe(false);
        const form = v.doc.querySelector('#prices form[action="/tools#prices"]')!;
        expect(form.querySelector<HTMLInputElement>('input[name="q"]')?.getAttribute("value"), `${where}: search kept as text`).toBe('<script>alert("x")</script>');
        expect(form.querySelector('select[name="pos"] option[selected]')?.getAttribute("value") ?? "", `${where}: unknown position is "all"`).toBe("");
        expect(form.querySelector('select[name="team"] option[selected]')?.getAttribute("value") ?? "", `${where}: unknown team is "all"`).toBe("");
        expect(form.querySelector<HTMLInputElement>('input[name="moving"]')?.hasAttribute("checked"), `${where}: moving only on "1"`).toBe(false);
        expect(v.doc.querySelector('#eo a[aria-current="true"]')?.getAttribute("href"), `${where}: bogus EO group falls back to the top 4`).toBe(`/tools?${new URLSearchParams({ q: '<script>alert("x")</script>', eo: "top4" })}#eo`);
        expect(v.doc.querySelector("#head-to-head [role=status]"), `${where}: a manager against himself is no head to head`).not.toBeNull();
      },
    },
    {
      q: { q: ["ars", "zzz"], pos: ["2", "3"], team: ["1", "2"], moving: ["0", "1"], eo: ["all", "top4"], by: ["captain"], vs: ["7", "1"] },
      check: (v, where) => {
        // first of each repeated value; a form's two vs selects make the pair
        const names = rowsIn(v.doc.querySelector("#prices")).map((r) => namesIn(r)[0]);
        expect(names, `${where}: ARS defenders only`).toEqual(priceOracle(season("final")).filter((p) => p.team === 1 && p.pos === 2).map((p) => p.name));
        expect(v.doc.querySelector('#eo a[aria-current="true"]')?.getAttribute("href"), `${where}: EO group kept`).toContain("eo=all");
        expect(v.doc.querySelector("#head-to-head table"), `${where}: vs=7&vs=1 compares`).not.toBeNull();
      },
    },
    { q: { vs: "7,999999" }, check: (v, where) => expect(norm(v.doc.querySelector("#head-to-head [role=status]")?.textContent), `${where}: not in the league`).toBe(MESSAGES.en.tools.leagueTools.rivals.invalid) },
    { q: { vs: "1".repeat(200), q: "x".repeat(500) }, check: (v, where) => {
      expect(v.doc.querySelector<HTMLInputElement>('#prices input[name="q"]')?.getAttribute("value"), `${where}: search clipped to 40`).toBe("x".repeat(40));
      expect(v.doc.querySelector("#head-to-head [role=status]"), `${where}: oversize vs is invalid`).not.toBeNull();
    } },
    { q: { pos: "-1", team: "NaN", eo: "", by: "", vs: "" }, check: (v, where) => {
      expect(rowsIn(v.doc.querySelector("#prices")).length, `${where}: no filter: the first 40 rows`).toBe(40);
      expect(v.doc.querySelector("#head-to-head [role=status]"), `${where}: an empty vs is no request`).toBeNull();
    } },
  ];
  for (const j of junk) {
    const where = `final ?${new URLSearchParams(Object.entries(j.q).flatMap(([k, val]) => (Array.isArray(val) ? val : [val]).map((x) => [k, x]))).toString().slice(0, 60)}`;
    const v = await visit(final, { query: j.q });
    expectClean(v, where);
    expectLinksLand(v.doc, where);
    j.check(v, where);
  }
}, 120_000);

// ================================================================================================ 2. the numbers

it("the numbers are right", async () => {
  const t = MESSAGES.en;
  const tt = t.tools;
  const lt = tt.leagueTools;

  // ---- effective ownership: six squads, captains double, a triple captain and a bench boost in play
  {
    const world = season("live-playing", { activeChips: { 3: "3xc", 2: "bboost" } });
    const all = rankOrder(world);
    for (const [q, entries] of [[{ eo: "all" }, all], [{}, all.slice(0, 4)], [{ eo: "top4" }, all.slice(0, 4)]] as [Query, number[]][]) {
      const where = `EO ${JSON.stringify(q)}`;
      const v = await visit(world, { query: q });
      expectClean(v, where);
      const want = eoOracle(world, entries).slice(0, 15);
      const rows = rowsIn(v.doc.querySelector("#eo"));
      expect(rows.length, `${where}: rows`).toBe(want.length);
      want.forEach((w, i) => {
        const e = element(world, w.id);
        expect(cellsOf(rows[i]).slice(1), `${where}: row ${i + 1} (${playerName(w.id)})`).toEqual([pct(w.eo), pct(w.started), pct(w.captained), pct(Number(e.selected_by_percent))]);
        expect(namesIn(rows[i]), `${where}: row ${i + 1} name`).toEqual([playerName(w.id)]);
      });
      expect(norm(v.doc.querySelector("#eo .note")?.textContent), `${where}: note`).toBe(
        tt.eo.note.map((f) => f(entries.length, G(6), playerName(want[0].id), pct(want[0].eo))).find((s) => s === norm(v.doc.querySelector("#eo .note")?.textContent)) ?? `one of the EO notes for ${entries.length} managers, ${playerName(want[0].id)} at ${pct(want[0].eo)}`,
      );
    }
    // the triple captain counts three times: Saka la bolsita (3) captains LIV F1 (56)
    const six = eoOracle(world, all);
    expect(six.find((r) => r.id === 56), "LIV F1: five starters plus a triple captain = 8/6").toEqual({ id: 56, eo: 133.3, started: 100, captained: 16.7 });
    expect(six.find((r) => r.id === 26), "MCI F1: captained by 7, 2 and 4").toEqual({ id: 26, eo: 150, started: 100, captained: 50 });
    // bench boost: Dang's bench counts (GK 21 is on everyone's bench, only Dang's counts)
    expect(six.find((r) => r.id === 21), "MCI GK counts for the bench boost only").toEqual({ id: 21, eo: 16.7, started: 16.7, captained: 0 });
    // by captain: only captained players, most captained first
    const vc = await visit(world, { query: { eo: "all", by: "captain" } });
    const capOrder = [...six].filter((r) => r.captained > 0).sort((a, b) => b.captained - a.captained || b.eo - a.eo || a.id - b.id);
    expect(rowsIn(vc.doc.querySelector("#eo")).map((r) => namesIn(r)[0]), "EO by captain: order").toEqual(capOrder.map((r) => playerName(r.id)));

    // head to head with chips in play: active chips from the picks
    const h = await visit(world, { query: { vs: "3,2" } });
    const table = rowsIn(h.doc.querySelector("#head-to-head"));
    expect(cellsOf(table[0]), "vs=3,2 captains").toEqual([lt.rivals.captain, playerName(56), playerName(26)]);
    expect(cellsOf(table[1])[1], "Saka's active chip").toContain(t.chips?.["3xc"] ?? "Triple Captain");
    expect(cellsOf(table[1])[2], "Dang's active chip").toContain(t.chips?.bboost ?? "Bench Boost");
  }

  // ---- template, differentials, chip tracker, head to head, set pieces: the final gameweek, six squads
  {
    const world = season("final");
    const entries = rankOrder(world);
    const v = await visit(world, { query: { vs: "7,1" } });
    expectClean(v, "final");

    // template: the most-owned legal eleven
    const tpl = templateOracle(world, entries);
    const tplEl = v.doc.querySelector("#template")!;
    expect(norm(tplEl.querySelector(".note")?.textContent), "template formation").toContain(tpl.formation);
    const lines = [...tplEl.querySelectorAll(".line")];
    expect(lines.map((l) => [...l.querySelectorAll(".tileName")].map((x) => norm(x.textContent))), "template eleven, line by line").toEqual(tpl.lines.map((xs) => xs.map((p) => playerName(p.id))));
    expect(lines.flatMap((l) => [...l.querySelectorAll(".xp")].map((x) => norm(x.textContent))), "template shares").toEqual(tpl.lines.flat().map((p) => `${short(Math.floor(p.id / 10))} · ${pct(p.share)}`));
    expect(tpl.lines.flat().length, "eleven players").toBe(11);
    const own = ownershipOracle(world, entries);
    const ids = new Set(tpl.lines.flat().map((p) => p.id));
    // nobody left out is owned by more managers than someone of the same position kept in
    for (const pos of [1, 2, 3, 4]) {
      const minIn = Math.min(...[...ids].filter((id) => element(world, id).element_type === pos).map((id) => own.get(id)!.owners));
      for (const [id, r] of own) if (!ids.has(id) && element(world, id).element_type === pos) expect(r.owners, `template: ${playerName(id)} left out with more owners`).toBeLessThanOrEqual(minIn);
    }
    expect(rowsIn(tplEl).map(cellsOf), "template coverage per team").toEqual(entries.map((e) => [managerOf(world, e).teamName, lt.template.ownedOf(picksOf(world, e).filter((p) => ids.has(p.element)).length, 11)]));

    // differentials: owned by exactly one manager
    const diffRows = rowsIn(v.doc.querySelector("#differentials"));
    expect(diffRows.map((r) => namesIn(r.querySelector("th")).length === 0 && norm(r.querySelector("th a")?.textContent)), "differentials: every team in table order").toEqual(entries.map((e) => managerOf(world, e).teamName));
    entries.forEach((e, i) => {
      const unique = picksOf(world, e).filter((p) => own.get(p.element)!.owners === 1).map((p) => p.element);
      expect(namesIn(diffRows[i].querySelector("td")), `differentials: ${managerOf(world, e).teamName}`).toEqual(unique.map(playerName));
      for (const id of unique) expect(entries.filter((x) => picksOf(world, x).some((p) => p.element === id)), `${playerName(id)} owned once`).toEqual([e]);
    });

    // chip tracker: used/remaining from the histories and FPL's windows, judged at the GW7 deadline
    const chipRows = rowsIn(v.doc.querySelector("#chip-tracker"));
    expect(chipRows.map((r) => norm(r.querySelector("th a")?.textContent)), "chip rows in table order").toEqual(entries.map((e) => managerOf(world, e).teamName));
    const holders: Record<string, number> = { wildcard: 0, freehit: 0, bboost: 0, "3xc": 0 };
    entries.forEach((e, i) => {
      const o = chipOracle(world, e, HISTORY_CHIPS[e] ?? []);
      const cells = cellsOf(chipRows[i]);
      ["wildcard", "freehit", "bboost", "3xc"].forEach((k, j) => {
        const c = o.cells[k];
        if (c.state === "open") holders[k] += 1;
        const label = c.state === "used" ? lt.chips.used(`GW${c.gw}`) : c.state === "open" ? lt.chips.open(`GW${c.until}`) : c.state === "later" ? lt.chips.later(`GW${c.from}`) : lt.chips.gone;
        expect(cells[1 + j], `chips: ${managerOf(world, e).teamName} ${k}`).toBe(`${label}${c.again ? lt.chips.again(`GW${c.again}`) : ""}`);
      });
      expect(cells[6], `chips: ${managerOf(world, e).teamName} still to play`).toBe(String(o.left));
      const played = HISTORY_CHIPS[e] ?? [];
      if (played.length) for (const p of played) expect(cells[5], `chips: ${managerOf(world, e).teamName} played`).toContain(`GW${p.event}`);
      else expect(cells[5], `chips: ${managerOf(world, e).teamName} played none`).toBe(lt.chips.nonePlayed);
    });
    expect(chipOracle(world, 7, HISTORY_CHIPS[7]).cells.wildcard.state, "entry 7's wildcard is used").toBe("used");
    expect(chipOracle(world, 2, HISTORY_CHIPS[2]).cells.bboost.state, "entry 2's bench boost is used").toBe("used");
    expect([...v.doc.querySelectorAll("#chip-tracker .summary strong")].map((x) => norm(x.textContent)), "chips in hand at the next deadline").toEqual(["wildcard", "freehit", "bboost", "3xc"].map((k) => lt.chips.holding(holders[k], 6)));
    expect(holders, "holders").toEqual({ wildcard: 5, freehit: 6, bboost: 5, "3xc": 6 });

    // head to head ?vs=7,1: shared and unique players, captains, chips still open
    const a = picksOf(world, 7);
    const bb = picksOf(world, 1);
    const shared = a.filter((p) => bb.some((q) => q.element === p.element)).map((p) => p.element);
    const onlyA = a.filter((p) => !bb.some((q) => q.element === p.element)).map((p) => p.element);
    const onlyB = bb.filter((p) => !a.some((q) => q.element === p.element)).map((p) => p.element);
    expect([shared.length, onlyA, onlyB], "the world's 7 v 1").toEqual([14, [54], [85]]);
    const h2h = v.doc.querySelector("#head-to-head")!;
    const sideNames = (label: string) => namesIn(h2h.querySelector(`section[aria-label="${label}"]`));
    const byPos = (xs: number[]) => [...xs].sort((x, y) => element(world, x).element_type - element(world, y).element_type || x - y);
    expect(sideNames(lt.rivals.only("Gaucho F.C.")), "only Gaucho").toEqual(onlyA.map(playerName));
    expect(sideNames(lt.rivals.only("Bart's Team")), "only Bart").toEqual(onlyB.map(playerName));
    expect(sideNames(lt.rivals.shared), "shared, by position").toEqual(byPos(shared).map(playerName));
    const cmp = rowsIn(h2h);
    expect(cellsOf(cmp[0]), "captains").toEqual([lt.rivals.captain, playerName(managerOf(world, 7).captain), playerName(managerOf(world, 1).captain)]);
    expect(cellsOf(cmp[1]), "no active chips").toEqual([lt.rivals.activeChip, lt.rivals.noChip, lt.rivals.noChip]);
    const openOf = (e: number) => ["wildcard", "freehit", "bboost", "3xc"].filter((k) => chipOracle(world, e, HISTORY_CHIPS[e] ?? []).cells[k].state === "open");
    expect([...cmp[2].children[1].querySelectorAll(".badge")].length, "Gaucho's open chips").toBe(openOf(7).length);
    expect([...cmp[2].children[2].querySelectorAll(".badge")].length, "Bart's open chips").toBe(openOf(1).length);
    expect(openOf(7), "Gaucho can't wildcard again before GW20").toEqual(["freehit", "bboost", "3xc"]);
    expect(lt.rivals.note.map((f) => f("Gaucho F.C.", "Bart's Team", 14, 1, 1)), "h2h note").toContain(norm(h2h.querySelector("p.note:not(:first-of-type), table ~ p, .note + .note")?.textContent) || norm([...h2h.querySelectorAll(".note")].map((n) => n.textContent).find((s) => /14/.test(s ?? ""))));
    // the selects keep the pair, in order
    expect([...h2h.querySelectorAll('select[name="vs"]')].map((s) => s.querySelector("option[selected]")?.getAttribute("value")), "selects keep 7 v 1").toEqual(["7", "1"]);

    // set pieces: FPL's order fields, clubs alphabetically by full name
    const spRows = rowsIn(v.doc.querySelector("#setpieces"));
    const clubs = [...teams].sort((x, y) => x.name.localeCompare(y.name));
    expect(spRows.map((r) => norm(r.querySelector("th")?.textContent).slice(-3)), "set-piece clubs").toEqual(clubs.map((c) => c.short_name));
    clubs.forEach((c, i) => {
      const taker = (field: "penalties_order" | "direct_freekicks_order" | "corners_and_indirect_freekicks_order") =>
        world.bootstrap.elements.filter((e) => e.team === c.id && (e[field] ?? 0) >= 1).sort((x, y) => x[field]! - y[field]! || x.id - y.id).slice(0, 3).map((e) => e.web_name);
      expect([...spRows[i].querySelectorAll("td")].map((td) => namesIn(td)), `set pieces: ${c.short_name}`).toEqual([taker("penalties_order"), taker("direct_freekicks_order"), taker("corners_and_indirect_freekicks_order")]);
    });

    // the season-over chip tracker: every window has closed
    const overWorld = season("season-over");
    const over = await visit(overWorld);
    for (const [i, r] of rowsIn(over.doc.querySelector("#chip-tracker")).entries()) {
      const c = cellsOf(r);
      const entry = overWorld.managers.find((m) => m.teamName === norm(r.querySelector("th a")?.textContent))!.entry;
      const o = chipOracle(overWorld, entry, HISTORY_CHIPS[entry] ?? []);
      // the last window (GW20-38) is the one shown; the first-half plays (GW3 wildcard, GW2 bench boost) sit outside it
      expect(Object.values(o.cells).map((x) => x.state), `season over oracle: ${entry}`).toEqual(["gone", "gone", "gone", "gone"]);
      expect(c.slice(1, 5), `season over: row ${i + 1} chips`).toEqual([lt.chips.gone, lt.chips.gone, lt.chips.gone, lt.chips.gone]);
      expect(c[6], `season over: row ${i + 1} nothing left`).toBe("0");
    }
  }

  // ---- injury watch, captain shortlist, projected XI, set-piece fitness: with players flagged
  {
    const world = season("final", { flags: FLAGS });
    const entries = rankOrder(world);
    const v = await visit(world);
    expectClean(v, "flags");
    const own = ownershipOracle(world, entries);
    const flagged = Object.keys(FLAGS).map(Number).filter((id) => own.has(id));
    expect(flagged.sort((x, y) => x - y), "LIV M2 is flagged but owned by nobody").toEqual([12, 13, 15, 16, 85]);
    const chanceOf = (id: number) => FLAGS[id].chance ?? (FLAGS[id].status === "d" ? 50 : 0);
    const order = [...flagged].sort((x, y) => own.get(y)!.starters - own.get(x)!.starters || own.get(y)!.captains - own.get(x)!.captains || own.get(y)!.owners - own.get(x)!.owners || chanceOf(x) - chanceOf(y) || x - y);
    const inj = v.doc.querySelector("#injury-watch")!;
    const rows = rowsIn(inj);
    expect(rows.map((r) => namesIn(r.querySelector("th"))[0]), "injury watch: exactly the flagged players the league owns, biggest worry first").toEqual(order.map(playerName));
    order.forEach((id, i) => {
      const o = own.get(id)!;
      const f = FLAGS[id];
      const c = cellsOf(rows[i]);
      expect(c.slice(1), `injury watch: ${playerName(id)}`).toEqual([
        lt.injuries.statuses[f.status],
        `${f.chance}%`,
        String(o.starters),
        String(o.owners),
        f.news,
        o.teams.length > 3 ? `${o.teams.slice(0, 3).join(", ")} ${lt.injuries.more(o.teams.length - 3)}` : o.teams.join(", "),
      ]);
    });
    expect(lt.injuries.note.map((f) => f(5, playerName(order[0]), own.get(order[0])!.starters)), "injury note").toContain(norm(inj.querySelector(".note")?.textContent));
    expect(v.text.includes("Knee injury"), "an unowned player's news stays out of the league's injury watch").toBe(false);

    // captain shortlist: nobody under 75%, only clubs with a fixture
    const shortlist = v.doc.querySelector("#shortlist")!;
    const listed = new Set(namesIn(shortlist.querySelector("table") ? shortlist : null).filter((n) => /\s(GK|D1|D2|M1|M2|F1)$/.test(n)));
    const tables = [...shortlist.querySelectorAll("table")];
    expect(tables.length, "three shortlists").toBe(3);
    for (const tb of tables) {
      const names = rowsIn(tb).map((r) => namesIn(r.querySelector("th"))[0]);
      expect(names.length, "a shortlist has rows").toBeGreaterThan(0);
      for (const n of names) {
        const e = world.bootstrap.elements.find((x) => x.web_name === n)!;
        expect(fit(e), `shortlist: ${n} is likely to play`).toBe(true);
        expect(matchesOf(world.schedule, e.team, 7).length, `shortlist: ${n}'s club plays GW7`).toBeGreaterThan(0);
      }
    }
    expect(listed.has("ARS D1"), "ARS D1 (50%) is left out").toBe(false);
    expect(listed.has("ARS F1"), "ARS F1 (injured) is left out").toBe(false);
    // without the flags, ARS D1 tops the simulation: the exclusion is real
    const plain = await visit(season("final"));
    expect(namesIn(rowsIn(plain.doc.querySelector("#shortlist table"))[0]?.querySelector("th"))[0], "unflagged: ARS D1 is the safest armband").toBe("ARS D1");

    // projected XI: FPL's expected points, flagged-under-75 players out
    const xi = xiOracle(world);
    const xiEl = v.doc.querySelector("#xi")!;
    expect(norm(xiEl.querySelector(".formation")?.textContent), "XI formation and total, read as words").toBe(`Formation ${xi.formation} Expected points, captain doubled ${xi.total.toFixed(1)}`);
    expect([...xiEl.querySelectorAll(".tileName")].map((x) => namesIn(x)[0]), "XI players").toEqual(xi.ids.map(playerName));
    for (const id of xi.ids) expect(fit(element(world, id)), `XI: ${playerName(id)} likely to play`).toBe(true);
    const capTile = [...xiEl.querySelectorAll(".tile")].find((x) => /Captain/.test(norm(x.textContent)) && !/Vice/.test(norm(x.textContent)));
    expect(namesIn(capTile?.querySelector(".tileName"))[0], "XI captain: the top expected points").toBe(playerName(xi.captain));

    // set pieces flag the unfit takers: ARS F1 (penalties) is out, ARS M2 (corners) suspended
    const ars = rowsIn(v.doc.querySelector("#setpieces")).find((r) => norm(r.querySelector("th")?.textContent).endsWith("ARS"))!;
    const [pens, , corners] = [...ars.querySelectorAll("td")];
    expect(norm(pens.textContent), "ARS penalties: F1 marked out").toContain(`ARS F1${tt.planning.setPieces.out}`);
    expect(norm(corners.textContent), "ARS corners: M2 marked out").toContain(`ARS M2${tt.planning.setPieces.out}`);
  }

  // ---- price pressure: the thresholds, both share and head count
  {
    const base = season("final");
    const tweak: Record<number, Partial<FplElement>> = {
      11: { selected_by_percent: "1.0", transfers_in_event: 70_000, transfers_out_event: 0 }, // likely rise
      21: { selected_by_percent: "20.0", transfers_in_event: 50_000, transfers_out_event: 0 }, // close: 2.3% of owners, 50k
      12: { selected_by_percent: "10.0", transfers_in_event: 0, transfers_out_event: 50_000 }, // -4.5% but only 50k: close fall
      13: { selected_by_percent: "5.0", transfers_in_event: 0, transfers_out_event: 60_000 }, // likely fall
      14: { selected_by_percent: "0.1", transfers_in_event: 5_000, transfers_out_event: 0 }, // 45% of a tiny ownership, 5k: steady
      15: { cost_change_event: 1 }, // rose
      16: { cost_change_event: -1 }, // fell
    };
    const world = { ...base, bootstrap: { ...base.bootstrap, elements: base.bootstrap.elements.map((e) => ({ ...e, ...tweak[e.id] })) } } as World;
    const extra: Routes = [[(u) => u.includes("/bootstrap-static/"), () => jsonRes(world.bootstrap)]];
    const oracle = priceOracle(world);
    const status = (id: number) => oracle.find((p) => p.id === id)!.status;
    expect([11, 21, 12, 13, 14, 15, 16].map(status), "the thresholds").toEqual(["likelyRise", "closeRise", "closeFall", "likelyFall", "steady", "rose", "fell"]);
    for (const q of [{ moving: "1" }, {}, { pos: "2" }, { team: "1" }, { q: "ars" }, { pos: "3", team: "8", moving: "1" }] as Query[]) {
      const where = `prices ${JSON.stringify(q)}`;
      const v = await visit(world, { extra, query: q });
      const want = oracle.filter((p) => (!q.moving || p.status !== "steady") && (!q.pos || p.pos === Number(q.pos)) && (!q.team || p.team === Number(q.team)) && (!q.q || p.name.toLowerCase().includes(String(q.q))));
      const rows = rowsIn(v.doc.querySelector("#prices"));
      expect(rows.map((r) => namesIn(r.querySelector("th"))[0]), `${where}: rows in pressure order`).toEqual(want.slice(0, 40).map((p) => p.name));
      rows.forEach((r, i) => expect(cellsOf(r)[1], `${where}: ${want[i].name} status`).toBe(tt.prices.statuses[want[i].status]));
      if (!q.pos && !q.team && !q.q && !q.moving) {
        const rising = oracle.filter((p) => p.status === "likelyRise");
        const falling = oracle.filter((p) => p.status === "likelyFall");
        const lines = [...v.doc.querySelectorAll("#brief .briefList li")].map((li) => norm(li.textContent));
        expect(lines.some((l) => tt.brief.rising.some((f) => f(rising.length, rising[0].name) === l)), `${where}: brief names the likely riser ${JSON.stringify(lines)}`).toBe(true);
        expect(lines.some((l) => tt.brief.falling.some((f) => f(falling.length, falling[0].name) === l)), `${where}: brief names the likely faller`).toBe(true);
      }
    }
  }

  // ---- fixture swings and blanks against the schedule: ARS and MCI blank in GW7, NEW and LIV in GW9
  {
    const world = season("final");
    const schedule = blanked(world.schedule, [[7, 1], [9, 4]]);
    const v = await visit(world, { extra: scheduleRoute(schedule) });
    expectClean(v, "blanks");
    const sw = swingOracle(world, schedule);
    const swEl = v.doc.querySelector("#swings")!;
    const [easeT, hardT] = [...swEl.querySelectorAll("table")];
    for (const [tb, want, label] of [[easeT, sw.easing, "easing"], [hardT, sw.hardening, "hardening"]] as const) {
      const rows = rowsIn(tb);
      expect(rows.map((r) => norm(r.querySelector("th .stack")?.firstChild?.textContent)), `swings ${label}: clubs`).toEqual(want.map((r) => r.club));
      want.forEach((r, i) => {
        const c = [...rows[i].querySelectorAll("td")].map((x) => norm(x.textContent));
        const change = one(r.later - r.soon);
        expect(c.slice(0, 3), `swings ${label}: ${r.club}`).toEqual([one(r.soon), one(r.later), /^[−-]?0\.0$/.test(change) ? "0.0" : change.startsWith("−") ? change : `+${change}`]);
        expect((c[3].match(new RegExp(tt.planning.swings.blank, "g")) ?? []).length, `swings ${label}: ${r.club} blanks shown`).toBe(r.blanks.length);
      });
    }
    // the world's numbers: ARS's soon run is a blank (5) and GW8, so it hardens rather than eases
    const arsSoon = (5 + matchesOf(schedule, 1, 8)[0].d) / 2;
    expect(swingOracle(world, schedule).easing.concat(sw.hardening).find((r) => r.club === "ARS")?.soon ?? round2(arsSoon), "ARS soon includes the blank at 5").toBe(round2(arsSoon));
    // captain shortlist: ARS and MCI players are out, and the page says why
    const shortlist = v.doc.querySelector("#shortlist")!;
    for (const n of namesIn(shortlist.querySelector(".views"))) expect(/^(ARS|MCI) /.test(n), `shortlist: ${n} has no GW7 fixture`).toBe(false);
    expect(norm(shortlist.textContent), "shortlist names the blank clubs").toContain(tt.planning.captain.blanks(2, "ARS, MCI", G(7)));
    // rotation pairs never start a club without a fixture
    for (const chip of shortlist.ownerDocument.querySelectorAll("#pairs tbody td .chip")) {
      const m = norm(chip.textContent).match(/^GW(\d+) ([A-Z]{3})/);
      if (!m) continue;
      const club = teams.find((x) => x.short_name === m[2])!.id;
      expect(matchesOf(schedule, club, Number(m[1])).length, `pairs: ${m[2]} started in GW${m[1]} must play`).toBeGreaterThan(0);
    }
    // the projected XI's opponents come from the same schedule: a blank club shows no fixture
    for (const tile of v.doc.querySelectorAll("#xi .tile")) {
      const club = norm(tile.querySelector(".tileName")?.textContent).slice(0, 3);
      const id = teams.find((x) => x.short_name === club)!.id;
      expect(tile.querySelectorAll(".chip").length, `XI: ${club} fixtures in GW7`).toBe(matchesOf(schedule, id, 7).length);
    }
  }

  // ---- languages and the altered view: the same facts, nothing broken, nothing left in English
  {
    const world = season("final", { flags: FLAGS });
    const query: Query = { eo: "all", vs: "7,1" };
    const english = await visit(world, { query });
    const eoRef = rowsIn(english.doc.querySelector("#eo")).map((r) => namesIn(r));
    const injRef = rowsIn(english.doc.querySelector("#injury-watch")).map((r) => namesIn(r.querySelector("th")));
    const allow = [...teams.flatMap((x) => [x.name, x.short_name]), /^[A-Z]{3} (GK|D1|D2|M1|M2|F1)/, "The Lobster League", ...world.managers.flatMap((m) => [m.teamName, m.manager]), ...Object.values(FLAGS).map((f) => f.news)];
    for (const lang of [{ locale: "es", trip: false }, { locale: "fr", trip: false }, { locale: "en", trip: true }, { locale: "es", trip: true }, { locale: "fr", trip: true }] as Lang[]) {
      const where = `${lang.locale}${lang.trip ? " + blotter" : ""}`;
      const c = catalog(lang);
      const v = await visit(world, { query, lang });
      expectClean(v, where);
      expectLinksLand(v.doc, where);
      expectLinksLand(v.firstPaint, `${where} (first paint)`);
      expect(norm(v.doc.querySelector("h1")?.textContent), `${where}: heading`).toBe(c.tools.heading);
      expect(navGroups(v.doc).map((g) => g.label), `${where}: group labels`).toEqual([c.tools.groups.deadline, c.tools.groups.transfers, c.tools.groups.league]);
      expect(rowsIn(v.doc.querySelector("#eo")).map((r) => namesIn(r)), `${where}: same EO players`).toEqual(eoRef);
      expect(rowsIn(v.doc.querySelector("#injury-watch")).map((r) => namesIn(r.querySelector("th"))), `${where}: same injury watch`).toEqual(injRef);
      expect(norm(v.doc.querySelector("#eo h2")?.textContent), `${where}: EO title`).toBe(c.tools.eo.title);
      // the same numbers, in this language's notation
      const firstEo = cellsOf(rowsIn(v.doc.querySelector("#eo"))[0]).slice(1).map((s) => s.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
      expect(firstEo, `${where}: EO figures`).toEqual(cellsOf(rowsIn(english.doc.querySelector("#eo"))[0]).slice(1));
      if (lang.locale !== "en") {
        const base = lang.trip ? await visit(world, { query, lang: { locale: "en", trip: true } }) : english;
        expect(englishLeaks(base.html, v.html, lang.locale as "es" | "fr", { allow }), `${where}: no English left behind`).toEqual([]);
        expect(v.text, `${where}: actually translated`).not.toBe(base.text);
      }
    }
  }
}, 120_000);

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
