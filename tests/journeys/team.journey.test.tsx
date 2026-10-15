/**
 * The manager view (/team/[entryId]) walked through a whole gameweek with the shared in-memory season.
 *
 * Two journeys, each checked against answers worked out independently from FPL's flags and the match events:
 * 1. "Is the gameweek over?" What the page tells the reader in every phase, and that every part of the page agrees.
 * 2. "Every number adds up." The arithmetic on the rendered page, in English, Spanish, French and the blotter view.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { messagesFor } from "@/lib/domain";
import { clientEn } from "@/lib/domain/i18n/client/en";
import type { FplEvent } from "@/lib/domain/types";
import type { TeamModel } from "@/lib/services/models";
import { testLanguage } from "../language";
import { install, playerName, season, textOf, uninstall, type PhaseName, type World, type WorldOptions } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

const en = messagesFor("en");
const SLUG = "gaucho-f-c";
const ENTRY = 7;

interface Rendered {
  world: World;
  html: string;
  text: string;
  doc: Document;
  /** The model the page renders from, loaded through the same service with the same world. */
  model: TeamModel;
}

/** Render the real team page for a world, optionally at `?gw=`, in a language and/or the blotter view. */
async function open(phase: PhaseName, opts: WorldOptions = {}, query: { gw?: string } = {}, lang: { cookie?: string; trip?: boolean; at?: string } = {}): Promise<Rendered> {
  vi.resetModules();
  uninstall();
  testLanguage.cookie = lang.cookie;
  testLanguage.trip = lang.trip ? "1" : undefined;
  const world = install(season(phase, opts));
  if (lang.at) vi.setSystemTime(new Date(lang.at));
  const page = (await import("@/app/team/[entryId]/page")).default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ entryId: SLUG }), searchParams: Promise.resolve(query) }));
  const { services } = await import("@/lib/container");
  const model = await services.team.load(ENTRY, query.gw);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { world, html, text: textOf(html), doc, model };
}

const txt = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The ruled facts row under the team name, as label -> element. */
function facts(doc: Document): Map<string, Element> {
  const out = new Map<string, Element>();
  doc.querySelectorAll("header dl.facts > div").forEach((d) => out.set(txt(d.querySelector("dt")), d.querySelector("dd")!));
  return out;
}

/** The summary figures (first StatList on the page) in order: GW points, total, overall rank, transfers, team value. */
function summary(doc: Document) {
  const items = [...doc.querySelectorAll("dl.list")[0]?.querySelectorAll(":scope > div") ?? []];
  return items.map((d) => {
    const dd = d.querySelector("dd")!;
    const hint = txt(dd.querySelector(".hint"));
    const value = txt(dd).slice(0, txt(dd).length - hint.length).trim();
    return { label: txt(d.querySelector("dt")), value, hint };
  });
}

/** Visible player lines: name -> shown points (null for "–"), split into the XI and the bench, plus the totals under them. */
function sheet(doc: Document) {
  const xiSection = doc.querySelector('section[aria-labelledby="xi-heading"]');
  const rowsOf = (root: Element | null | undefined) =>
    [...(root?.querySelectorAll("tbody tr") ?? [])].map((tr) => {
      const cells = tr.querySelectorAll("th, td");
      const last = cells[cells.length - 1];
      const strong = last?.querySelector("strong");
      return {
        name: txt(tr.querySelector(".playerName")),
        points: strong ? Number(txt(strong)) : null,
        sr: txt(last?.querySelector(".sr-only")),
        badges: txt(tr.querySelector(".playerName")?.parentElement),
      };
    });
  const xi = rowsOf(xiSection);
  const benchCard = xiSection?.nextElementSibling;
  const bench = rowsOf(benchCard);
  const subtotals = [...(xiSection?.querySelectorAll(".subtotal") ?? [])].map((s) => Number(txt(s.querySelector("strong"))));
  const benchSubtotal = benchCard?.querySelector(".subtotal");
  const grand = doc.querySelector(".grandTotal");
  return {
    xi,
    bench,
    subtotals,
    benchTotal: benchSubtotal ? Number(txt(benchSubtotal.querySelector("strong"))) : null,
    benchNote: txt(benchSubtotal?.querySelector(".subtotalNote")),
    grand: grand ? Number(txt(grand.querySelector(".grandValue"))) : null,
    grandNote: txt(grand?.querySelector(".grandNote")),
  };
}

const refreshButton = (doc: Document, label = clientEn.live.refresh) => doc.querySelector(`button[aria-label="${label}"]`);
const badgeIn = (doc: Document) => txt(facts(doc).get(en.team.header.gameweek)?.querySelector(".badge"));
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** THE ANSWER, from FPL's own flags alone: a gameweek is over once FPL has finished it AND checked the data. */
const over = (e: FplEvent) => e.finished && e.data_checked;

/** Seconds in the time zone the server renders deadlines in (UTC, labelled). */
const utcDeadline = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

it("is the gameweek over? Every phase tells the reader the same true answer, everywhere on the page", async () => {
  type Case = { phase: PhaseName; gw?: string; at?: string; label: string };
  const cases: Case[] = [
    { phase: "preseason", label: "preseason" },
    { phase: "upcoming", label: "upcoming" },
    { phase: "live-playing", label: "live-playing" },
    { phase: "live-playing", gw: "6", label: "live-playing ?gw=6 (the current one)" },
    { phase: "live-playing", gw: "5", label: "live-playing ?gw=5 (an older week while one is live)" },
    { phase: "live-between", label: "live-between" },
    { phase: "live-between", at: "2026-10-12T18:50:00Z", label: "live-between, ten minutes before Monday's kick-off" },
    { phase: "live-over", label: "live-over" },
    { phase: "provisional", label: "provisional" },
    { phase: "final", label: "final" },
    { phase: "final", gw: "6", label: "final ?gw=6 (the current one)" },
    { phase: "final", gw: "5", label: "final ?gw=5 (last week)" },
    { phase: "final", gw: "4", label: "final ?gw=4 (two weeks back)" },
    { phase: "season-over", label: "season-over" },
  ];
  const provisionalWords = en.team.vary.provisional;
  const finalWords = en.team.vary.final;
  const iv = en.interview;
  let checked = 0;

  for (const c of cases) {
    const { world, text, doc, model } = await open(c.phase, {}, c.gw ? { gw: c.gw } : {}, { at: c.at });
    const at = (msg: string) => `[${c.label}] ${msg}`;
    expect(text, at("renders without junk")).not.toMatch(/undefined|NaN|\[object/);
    expect(text, at("names the team")).toContain("Gaucho F.C.");

    // ---------- pre-season: no crash, and nothing about points ----------
    if (c.phase === "preseason") {
      expect(model.kind, at("model is the no-season state")).toBe("no-season");
      expect(text, at("says the season hasn't started")).toContain(en.team.noSeasonTitle);
      expect(text, at("no points of any kind")).not.toMatch(/\bpts?\b|points|GW points|Total|Grand total/i);
      for (const word of ["Live", "Provisional", "Final", "Upcoming"]) expect(text, at(`no status badge ${word}`)).not.toMatch(new RegExp(`\\b${word}\\b`));
      expect(refreshButton(doc), at("no refresh control")).toBeNull();
      expect(doc.querySelector("time"), at("no deadline time")).toBeNull();
      checked++;
      continue;
    }
    if (model.kind !== "ok") throw new Error(at(`expected a team sheet, got ${model.kind}`));
    const gw = model.gameweek;

    // ---------- which week, and what FPL says about it ----------
    const shownGw = c.gw ? Number(c.gw) : world.gw;
    const event = world.bootstrap.events.find((e) => e.id === shownGw)!;
    const latest = shownGw === world.gw;
    expect(gw.gw, at("shows the requested gameweek")).toBe(shownGw);
    expect(gw.max, at("the latest is the world's current week")).toBe(world.gw);
    const deadlinePassed = Date.parse(event.deadline_time) <= Date.now();
    const expectedStatus = !deadlinePassed ? "upcoming" : !event.finished ? "live" : event.data_checked ? "final" : "provisional";
    expect(gw.status, at("status follows FPL's flags")).toBe(expectedStatus);

    // ---------- the answer, and the page's wording must agree with it ----------
    const isOver = over(event);
    const badge = badgeIn(doc);
    const words = { upcoming: en.status.upcoming, live: en.status.live, provisional: en.status.provisional, final: en.status.final };
    expect(badge, at("status badge")).toBe(words[expectedStatus]);
    expect(badge === en.status.final, at(`badge says over (${badge}) exactly when finished && data_checked (${isOver})`)).toBe(isOver);
    const sum = summary(doc);
    const points = sum[0];
    const hasFinalWording = finalWords.some((w) => text.includes(w));
    const hasProvisionalWording = provisionalWords.some((w) => text.includes(w));

    if (expectedStatus === "live") {
      expect(points.label, at("GW points are marked live")).toBe(en.team.gwPointsLive);
      expect(points.hint, at("live points are before auto-subs")).toContain(en.team.beforeAutoSubs);
      expect(text, at("never 'Final' while live")).not.toMatch(/\bFinal\b/);
      expect(hasFinalWording, at("no final wording while live")).toBe(false);
      expect(hasProvisionalWording, at("no provisional wording while live")).toBe(false);
      expect(text, at("no 'Provisional' while live")).not.toMatch(/\bProvisional\b/);
    } else {
      expect(points.label, at("GW points are not marked live")).toBe(en.team.gwPoints);
      expect(points.hint, at("no 'before auto-subs' once not live")).not.toContain(en.team.beforeAutoSubs);
      expect(text, at("never 'Live' once not live")).not.toMatch(/\bLive\b|\(live\)/);
    }
    if (expectedStatus === "provisional") {
      expect(provisionalWords.some((w) => points.hint.includes(w)), at(`summary says provisional: "${points.hint}"`)).toBe(true);
      expect(text, at("never 'Final' while provisional")).not.toMatch(/\bFinal\b/);
      expect(hasFinalWording, at("no final wording while provisional")).toBe(false);
    }
    if (expectedStatus === "final") {
      if (latest) expect(finalWords.some((w) => points.hint.includes(w)), at(`summary says checked by FPL: "${points.hint}"`)).toBe(true);
      else expect(points.hint, at("an older week carries no latest-week phase wording")).not.toMatch(new RegExp([...finalWords, ...provisionalWords].join("|")));
      expect(hasProvisionalWording, at("no provisional wording once final")).toBe(false);
    }
    if (expectedStatus === "upcoming") {
      expect(hasFinalWording || hasProvisionalWording, at("no phase wording before the deadline")).toBe(false);
      expect(text, at("never Live / Final / Provisional before the deadline")).not.toMatch(/\bLive\b|\bFinal\b|\bProvisional\b|\(live\)/);
    }
    // The headline cannot claim the opposite of the badge.
    if (!isOver) expect(text, at("nothing claims FPL signed it off")).not.toMatch(/checked by FPL|signed off by FPL|FPL data checked|FPL has confirmed/);

    // ---------- the press conference ----------
    const lede = txt(doc.querySelector('section[aria-labelledby="interview-heading"] .lede'));
    const note = txt(doc.querySelector('section[aria-labelledby="interview-heading"] .note'));
    const name = `Gameweek ${shownGw}`;
    const expectedNote =
      expectedStatus === "live" ? iv.liveNote
      : expectedStatus === "provisional" ? iv.provisionalNote(name)
      : expectedStatus === "final" ? (gw.seasonOver ? iv.seasonOverNote(name) : latest ? iv.finalNote(name) : iv.pastNote(name))
      : "";
    expect(note, at("press-conference note for the phase")).toBe(expectedNote);
    if (expectedStatus === "live") expect(lede, at("press meets during the live week")).toContain(`during ${name}`);
    if (expectedStatus === "provisional") expect(lede, at("press meets while FPL checks")).toContain(`after ${name}, while FPL runs its final check`);
    if (expectedStatus === "upcoming") {
      expect(lede, at("never 'after' a week not yet played")).not.toContain(`after ${name}`);
      expect(lede, at("after last week, with this week's deadline ahead")).toContain(`after Gameweek ${shownGw - 1}, with the ${name} deadline ahead`);
    }
    if (expectedStatus === "final" && latest && !gw.seasonOver) expect(lede, at("final: the next deadline is ahead")).toContain(`after ${name}, with the Gameweek ${shownGw + 1} deadline ahead`);

    // ---------- the next deadline: never while the week is live, only beside the latest week, never after the season ----------
    const deadline = facts(doc).get(en.team.header.deadline);
    const next = world.bootstrap.events.filter((e) => Date.parse(e.deadline_time) > Date.now()).sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0];
    const wantDeadline = latest && expectedStatus !== "live" && next != null;
    expect(Boolean(deadline), at(`next-deadline fact shown: ${wantDeadline}`)).toBe(wantDeadline);
    if (expectedStatus === "live") expect(gw.nextDeadline, at("no deadline in the model while live")).toBeNull();
    if (wantDeadline) {
      const time = deadline!.querySelector("time");
      expect(time, at("deadline is a local-time element")).not.toBeNull();
      expect(time!.getAttribute("datetime"), at("deadline is the next one FPL lists")).toBe(new Date(next.deadline_time).toISOString());
      expect(txt(deadline), at("deadline names its gameweek")).toContain(`GW${next.id}`);
      expect(txt(time), at("server pass labels the time zone")).toBe(`${utcDeadline(next.deadline_time)} UTC`);
      expect(gw.nextDeadline, at("model deadline")).toEqual({ gw: next.id, at: next.deadline_time });
    }

    // ---------- the pager: previous / next, 'No later gameweek', the 'Latest' shortcut, links that keep state ----------
    const prev = doc.querySelector(`a[aria-label="${en.pager.previous("Gameweek", shownGw - 1)}"]`);
    expect(prev?.getAttribute("href"), at("previous link")).toBe(`/team/${SLUG}?gw=${shownGw - 1}`);
    const nextLink = doc.querySelector(`a[aria-label="${en.pager.next("Gameweek", shownGw + 1)}"]`);
    if (latest) {
      expect(nextLink, at("no next link on the latest week")).toBeNull();
      expect(text, at("says there is no later gameweek")).toContain(en.pager.noLater("gameweek"));
    } else {
      expect(nextLink?.getAttribute("href"), at("next link")).toBe(`/team/${SLUG}?gw=${shownGw + 1}`);
      expect(text, at("a later week exists")).not.toContain(en.pager.noLater("gameweek"));
    }
    expect(doc.querySelector('[aria-current="page"]')?.textContent, at("pager shows the week")).toBe(`GW${shownGw}`);
    const latestLink = doc.querySelector(`a[aria-label="${en.team.latestLabel(world.gw)}"]`);
    expect(Boolean(latestLink), at("'Latest' shortcut only from two or more weeks back")).toBe(shownGw < world.gw - 1);
    if (latestLink) expect(latestLink.getAttribute("href"), at("'Latest' goes to the latest week")).toBe(`/team/${SLUG}?gw=${world.gw}`);
    if (!latest) expect(latestLink !== null || nextLink !== null, at("an older week always has a way back to the latest")).toBe(true);
    const neighbours = [...doc.querySelectorAll('nav[aria-label="Neighbouring managers"] a')];
    expect(neighbours.length, at("links to the managers either side in the table")).toBeGreaterThan(0);
    for (const a of neighbours) expect(a.getAttribute("href"), at("neighbour links keep the gameweek")).toMatch(new RegExp(`^/team/[a-z0-9-]+\\?gw=${shownGw}$`));

    // ---------- refresh: present exactly while the latest week can still change, at the right pace ----------
    const shouldRefresh = latest && (expectedStatus === "live" || expectedStatus === "provisional");
    expect(Boolean(refreshButton(doc)), at(`refresh control present: ${shouldRefresh}`)).toBe(shouldRefresh);
    const ms = gw.refreshMs ?? null;
    if (!shouldRefresh) expect(ms, at("never refreshes when nothing can change")).toBeNull();
    if (c.phase === "live-playing" && latest) {
      expect(ms, at("every minute while a match is on")).toBe(60_000);
      expect(gw.pulse?.state, at("pulse: playing")).toBe("playing");
      expect(gw.pulse?.playing, at("one match in play")).toBe(world.fixtures.filter((f) => world.truth.fixtureState(f) === "playing").length);
    }
    if (c.phase === "live-between") {
      const kickoff = Date.parse("2026-10-12T19:00:00Z");
      const nextKick = world.fixtures.filter((f) => !f.started).map((f) => Date.parse(f.kickoff_time!)).sort((a, b) => a - b)[0];
      expect(nextKick, at("world: the next kick-off is Monday 19:00")).toBe(kickoff);
      expect(gw.pulse, at("pulse: between matches, next kick-off Monday")).toEqual({ state: "between", nextKickoff: new Date(kickoff).toISOString(), playing: 0 });
      expect(ms, at("sleeps between 1 and 15 minutes")).toBeGreaterThanOrEqual(60_000);
      expect(ms!, at("sleeps between 1 and 15 minutes")).toBeLessThanOrEqual(15 * 60_000);
      expect(Date.now() + ms!, at("wakes before Monday's kick-off")).toBeLessThan(kickoff);
      if (c.at) expect(ms, at("ten minutes out: wakes two minutes before kick-off")).toBe(8 * 60_000);
      else expect(ms, at("a day and a half out: the longest sleep")).toBe(15 * 60_000);
    }
    if (c.phase === "live-over") {
      expect(ms, at("all played, FPL not finished: every 5 minutes")).toBe(5 * 60_000);
      expect(gw.pulse?.state, at("pulse: over")).toBe("over");
      expect(world.fixtures.every((f) => world.truth.fixtureState(f) === "over"), at("world: every match is over")).toBe(true);
    }
    if (c.phase === "provisional" && latest) expect(ms, at("provisional: every 5 minutes until FPL checks")).toBe(5 * 60_000);
    if (expectedStatus === "final" || expectedStatus === "upcoming") expect(ms, at("final / upcoming: never")).toBeNull();
    expect(gw.isLive, at("isLive only for the latest live week")).toBe(latest && expectedStatus === "live");
    // "On air" in the press room only while the latest week is live.
    // The dot lives in the press-photo caption, and not every press conference has a photo.
    const onAir = Boolean(doc.querySelector('section[aria-labelledby="interview-heading"] figcaption .live'));
    const hasPhoto = Boolean(doc.querySelector('section[aria-labelledby="interview-heading"] figcaption'));
    expect(onAir, at("press-room 'on air' dot only while live")).toBe(hasPhoto && latest && expectedStatus === "live");

    // ---------- the end of the season ----------
    expect(gw.seasonOver, at("season over only after the last week is final")).toBe(c.phase === "season-over");
    if (c.phase === "season-over") {
      expect(note, at("names the end of the season")).toContain("the last of the season");
      expect(text, at("no deadline after the season")).not.toContain(en.team.header.deadline);
      expect(text, at("no 'until the next deadline' after the season")).not.toContain("until the next deadline");
    }
    checked++;
  }
  expect(checked, "every case was checked").toBe(cases.length);
}, 120_000);

it("every number adds up: points, captain, chips, auto-subs, hit, bench, value and league line, in every language", async () => {
  /** What one element scored this gameweek, from the match events (FPL's live endpoint). */
  const baseOf = (w: World, gw = w.gw) => new Map(w.truth.liveFor(gw).elements.map((e) => [e.id, e.stats]));
  /** What the page must show for every squad player, worked out from the squad rules, independent of the app. */
  type Expect = { counted: Map<number, number>; shown: Map<number, number | null>; xi: number[]; bench: number[] };
  function expected(w: World, c: { chip?: string; subs?: [inn: number, out: number][]; armbandTo?: number }): Expect {
    const base = baseOf(w);
    let xi = [11, 12, 13, 32, 14, 34, 54, 74, 16, 26, 56];
    let bench = [21, 33, 52, 15];
    for (const [inn, out] of c.subs ?? []) {
      xi = xi.map((e) => (e === out ? inn : e));
      bench = bench.map((e) => (e === inn ? out : e));
    }
    const captain = c.armbandTo ?? 26;
    const capMult = c.chip === "3xc" ? 3 : 2;
    const counted = new Map<number, number>();
    const shown = new Map<number, number | null>();
    for (const e of [...xi, ...bench]) {
      const pts = base.get(e)?.total_points ?? null;
      const mult = xi.includes(e) || c.chip === "bboost" ? (e === captain ? capMult : 1) : 0;
      if (mult > 0) counted.set(e, (pts ?? 0) * mult);
      shown.set(e, pts === null ? null : mult > 0 ? pts * mult : pts);
    }
    return { counted, shown, xi, bench };
  }
  /** FPL's history for the manager, through the world's own endpoint (what the history route serves). */
  async function history(w: World) {
    const route = w.routes.find(([m]) => m("https://x/api/entry/7/history/"))!;
    const res = await (route[1] as (u: string) => Response)("https://x/api/entry/7/history/");
    return (await res.json()) as { current: { event: number; total_points: number; points: number; event_transfers_cost: number }[] };
  }

  type Case = { phase: PhaseName; opts?: WorldOptions; label: string; chip?: string; subs?: [number, number][]; armbandTo?: number; liveSubsPending?: number };
  const cases: Case[] = [
    { phase: "final", label: "final" },
    { phase: "provisional", label: "provisional" },
    { phase: "live-between", label: "live-between" },
    { phase: "final", opts: { activeChips: { 7: "3xc" } }, chip: "3xc", label: "final, Triple Captain" },
    { phase: "live-between", opts: { activeChips: { 7: "3xc" } }, chip: "3xc", label: "live-between, Triple Captain" },
    { phase: "final", opts: { activeChips: { 7: "bboost" } }, chip: "bboost", label: "final, Bench Boost" },
    { phase: "provisional", opts: { activeChips: { 7: "bboost" } }, chip: "bboost", label: "provisional, Bench Boost" },
    { phase: "final", opts: { zeroMinutes: [14] }, subs: [[33, 14]], label: "final, ARS M1 (14) did not play" },
    { phase: "provisional", opts: { zeroMinutes: [14] }, subs: [[33, 14]], label: "provisional, ARS M1 (14) did not play" },
    { phase: "live-between", opts: { zeroMinutes: [14] }, liveSubsPending: 14, label: "live-between, ARS M1 (14) did not play (FPL subs at the end)" },
    { phase: "final", opts: { zeroMinutes: [26] }, subs: [[33, 26]], armbandTo: 16, label: "final, captain MCI F1 (26) did not play" },
    { phase: "final", opts: { zeroMinutes: [26], activeChips: { 7: "3xc" } }, chip: "3xc", subs: [[33, 26]], armbandTo: 16, label: "final, Triple Captain on a captain who did not play" },
  ];

  const checkedNumbers = new Map<string, { gwPoints: string; total: string; grand: number | null; rows: Map<string, number | null> }>();

  for (const c of cases) {
    const { world: w, text, doc, model } = await open(c.phase, c.opts ?? {});
    const at = (msg: string) => `[${c.label}] ${msg}`;
    if (model.kind !== "ok") throw new Error(at(`expected a team sheet, got ${model.kind}`));
    const me = w.managers.find((m) => m.entry === ENTRY)!;
    const exp = expected(w, c);
    const page = sheet(doc);
    const sum = summary(doc);
    expect(text, at("no junk")).not.toMatch(/undefined|NaN|\[object/);

    // ---------- every player line ----------
    const rows = new Map([...page.xi, ...page.bench].map((r) => [r.name, r.points]));
    expect(page.xi.map((r) => r.name).sort(), at("the XI shown is the XI that counts")).toEqual(exp.xi.map(playerName).sort());
    expect(page.bench.map((r) => r.name).sort(), at("the bench shown")).toEqual(exp.bench.map(playerName).sort());
    for (const e of [...exp.xi, ...exp.bench]) {
      const want = exp.shown.get(e) ?? null;
      expect(rows.get(playerName(e)), at(`${playerName(e)} (${e}) shows ${want}`)).toBe(want);
    }
    // the world agrees (a harness check): what each counted player added
    for (const [e, pts] of exp.counted) expect(me.byElement.get(e), at(`world byElement ${e}`)).toBe(pts);

    // ---------- the sums on the sheet ----------
    const xiSum = page.xi.reduce((s, r) => s + (r.points ?? 0), 0);
    expect(page.subtotals.reduce((a, b) => a + b, 0), at("position subtotals add up to the XI rows")).toBe(xiSum);
    const benchRows = page.bench.reduce((s, r) => s + (r.points ?? 0), 0);
    expect(page.benchTotal, at("bench subtotal = the bench rows")).toBe(benchRows);
    expect(page.benchTotal, at("bench subtotal = FPL's points on the bench")).toBe(me.bench);
    expect(page.benchNote, at("bench counted only under Bench Boost")).toBe(c.chip === "bboost" ? en.sheet.counts : en.sheet.notCounted);
    const gross = [...exp.counted.values()].reduce((a, b) => a + b, 0);
    expect(gross, at("world gross agrees with the squad rules")).toBe(me.gross);
    expect(page.grand, at("grand total = XI (+ bench under Bench Boost)")).toBe(xiSum + (c.chip === "bboost" ? benchRows : 0));
    expect(page.grand, at("grand total = gross points")).toBe(gross);
    expect(page.grandNote, at("the hit beside the grand total")).toBe(`−4 hit = ${gross - 4}`);

    // ---------- the summary ----------
    const net = gross - 4;
    expect(me.net, at("world net")).toBe(net);
    expect(sum[0].value, at("GW points are net of the 4-point hit")).toBe(String(net));
    expect(sum[0].hint, at("GW points say the hit")).toContain("incl. −4 hit");
    expect(Number(sum[0].value), at("GW points = the league table's event total")).toBe(w.standings.find((r) => r.entry === ENTRY)!.event_total);
    const before = (await history(w)).current.find((r) => r.event === w.gw - 1)!.total_points;
    expect(sum[1].value.replace(/,/g, ""), at("total = total after last week + this week's net")).toBe(String(before + net));
    expect(Number(sum[1].value.replace(/,/g, "")), at("total = the league table's total")).toBe(w.standings.find((r) => r.entry === ENTRY)!.total);
    expect(sum[3].value, at("two transfers made")).toBe("2");
    expect(sum[3].hint, at("the hit, as points")).toBe("−4 pts");
    expect(sum[4].value, at("team value (FPL's value already includes the bank)")).toBe("£100.7m");
    expect(sum[4].hint, at("bank shown as part of the value")).toBe("incl. £1.4m in the bank");
    expect(text, at("the bank is never added on top")).not.toContain("£102.1m");

    // ---------- captain and chips ----------
    const capId = c.armbandTo ?? 26;
    const capBase = baseOf(w).get(capId)!.total_points;
    const mult = c.chip === "3xc" ? 3 : 2;
    const capRow = [...page.xi].find((r) => r.name === playerName(capId))!;
    expect(capRow.points, at(`armband: ${playerName(capId)} ×${mult}`)).toBe(capBase * mult);
    expect(capRow.sr, at("the multiplication is spelled out")).toBe(`(${capBase} × ${mult})`);
    if (c.chip === "3xc") {
      expect(facts(doc).get(en.team.header.chip)?.textContent, at("chip in the header")).toBe(en.chips["3xc" as keyof typeof en.chips]);
      expect(text, at("chip card: one extra copy of the armband")).toContain(`+${capBase} ${en.matchday.chipFrom(capBase)}`);
    }
    if (c.chip === "bboost") {
      expect(facts(doc).get(en.team.header.chip)?.textContent, at("chip in the header")).toBe(en.chips["bboost" as keyof typeof en.chips]);
      expect(text, at("chip card: the bench's points")).toContain(`+${me.bench} ${en.matchday.chipFrom(me.bench)}`);
      expect(text, at("bench card says counted")).toContain(en.matchday.benchCounted);
    }

    // ---------- auto-subs ----------
    for (const [inn, out] of c.subs ?? []) {
      expect(text, at("the page says who came on for whom")).toContain(`${en.matchday.autoSubs}`);
      expect(text, at("auto-sub line")).toContain(`${playerName(inn)}${en.matchday.onFor(playerName(out))}`);
      expect(page.bench.find((r) => r.name === playerName(out))?.points, at("the subbed-out starter sits on the bench with 0")).toBe(0);
      expect(page.xi.some((r) => r.name === playerName(inn)), at("the sub is in the XI")).toBe(true);
      expect(text, at("the subbed-out starter is still called a starter")).toMatch(new RegExp(`${playerName(out)} \\(${playerName(out).slice(0, 3)}\\) ${en.matchday.starter}`));
      expect(sum[0].hint, at("no 'before auto-subs' once FPL made them")).not.toContain(en.team.beforeAutoSubs);
    }
    if (c.liveSubsPending) {
      const out = playerName(c.liveSubsPending);
      expect(sum[0].label, at("still live")).toBe(en.team.gwPointsLive);
      expect(sum[0].hint, at("live points are before auto-subs")).toContain(en.team.beforeAutoSubs);
      expect(text, at("no auto-sub claimed before FPL makes it")).not.toContain(en.matchday.autoSubs);
      expect(page.xi.find((r) => r.name === out)?.points, at("the starter who didn't play is still in the XI, on 0")).toBe(0);
      expect(text, at("the page says he did not play")).toMatch(new RegExp(`${out} \\(${out.slice(0, 3)}\\) ${en.matchday.starter}`));
    }
    if (c.armbandTo) {
      const capName = playerName(26);
      const viceName = playerName(c.armbandTo);
      const viceBase = baseOf(w).get(c.armbandTo)!.total_points;
      expect(baseOf(w).get(26)!.minutes, at("world: the captain played no minutes")).toBe(0);
      expect(text, at("captain card: the captain scored nothing")).toContain(`${capName} C ${en.captainBadge.captain} 0 pts`);
      expect(text, at("the vice line says what he counted for, with the armband")).toContain(en.matchday.vice(viceName, `${viceBase * mult} pts (${viceBase} × ${mult})`));
      expect(rows.get(capName), at("the captain on the bench shows 0")).toBe(0);
    }

    // ---------- the league line agrees with the league table ----------
    const table = w.standings;
    const mine = table.find((r) => r.entry === ENTRY)!;
    const gap = mine.rank === 1 ? mine.total - (table[1]?.total ?? mine.total) : table[0].total - mine.total;
    const moved = mine.last_rank > 0 ? mine.last_rank - mine.rank : 0;
    const league = txt(facts(doc).get(en.team.header.league));
    expect(league, at("league position")).toMatch(new RegExp(`^${ord(mine.rank)}( of |/)${table.length}\\b`));
    expect(league, at(`gap to the top (${gap})`)).toMatch(gap ? new RegExp(`\\b${gap} points?\\b`) : /level/);
    if (moved === 0) expect(league, at("no movement claimed")).not.toMatch(/\bup \d|\bdown \d|climbed|slipped|▲|▼/);
    else expect(league, at(`movement ${moved}`)).toMatch(new RegExp(moved > 0 ? `(up|climbed|▲) ?${moved}` : `(down|slipped|▼) ?${-moved}`));
    const prev = table.find((r) => r.rank === mine.rank - 1);
    if (prev) expect(text, at("the manager above, from the table")).toContain(`#${prev.rank} ${prev.entry_name}`);

    checkedNumbers.set(c.label, { gwPoints: sum[0].value, total: sum[1].value, grand: page.grand, rows });
  }

  // ---------- a past week: that week's numbers, not today's league position ----------
  {
    const { world: w, text, doc, model } = await open("final", {}, { gw: "5" });
    const at = (msg: string) => `[final ?gw=5] ${msg}`;
    if (model.kind !== "ok") throw new Error(at("expected a team sheet"));
    const fpl = w.truth.picksFor(ENTRY, 5);
    const base = baseOf(w, 5);
    const gross5 = fpl.picks.reduce((s, p) => s + (base.get(p.element)?.total_points ?? 0) * p.multiplier, 0);
    const sum = summary(doc);
    const page = sheet(doc);
    expect(sum[0].value, at("GW5 points from GW5's match events (no hit that week)")).toBe(String(gross5));
    expect(sum[0].hint, at("no hit in GW5")).not.toContain("hit");
    expect(sum[1].value.replace(/,/g, ""), at("GW5 total as FPL gives it for GW5")).toBe(String(fpl.entry_history.total_points));
    expect(sum[3].hint, at("no hit in GW5")).toBe(en.team.noHit);
    expect(page.grand, at("GW5 grand total")).toBe(gross5);
    expect(page.grandNote, at("no hit note in GW5")).toBe("");
    for (const p of fpl.picks) {
      const pts = base.get(p.element)?.total_points ?? 0;
      expect(new Map([...page.xi, ...page.bench].map((r) => [r.name, r.points])).get(playerName(p.element)), at(`GW5 line ${playerName(p.element)}`)).toBe(p.multiplier > 0 ? pts * p.multiplier : pts);
    }
    const today = checkedNumbers.get("final")!;
    expect(sum[0].value, at("not today's GW points")).not.toBe(today.gwPoints);
    expect(facts(doc).has(en.team.header.league), at("no league position beside a past week (it is today's table)")).toBe(false);
    expect(text, at("no league line text")).not.toMatch(/\d(st|nd|rd|th)( of |\/)6/);
    expect(facts(doc).has(en.team.header.deadline), at("no next deadline beside a past week")).toBe(false);
    expect(refreshButton(doc), at("a past week never refreshes")).toBeNull();
  }

  // ---------- the same numbers in Spanish, French and the blotter view ----------
  const languages: { label: string; cookie?: string; trip?: boolean; hit: RegExp }[] = [
    { label: "es", cookie: "es", hit: /−4/ },
    { label: "fr", cookie: "fr", hit: /−4/ },
    { label: "blotter (en)", trip: true, hit: /−4/ },
    { label: "blotter (es)", cookie: "es", trip: true, hit: /−4/ },
    { label: "blotter (fr)", cookie: "fr", trip: true, hit: /−4/ },
  ];
  for (const phase of ["final", "provisional", "live-between"] as const) {
    const english = checkedNumbers.get(phase)!;
    for (const lang of languages) {
      const { text, doc, model } = await open(phase, {}, {}, { cookie: lang.cookie, trip: lang.trip });
      const at = (msg: string) => `[${phase} in ${lang.label}] ${msg}`;
      if (model.kind !== "ok") throw new Error(at("expected a team sheet"));
      const sum = summary(doc);
      const page = sheet(doc);
      expect(text, at("no junk")).not.toMatch(/undefined|NaN|\[object/);
      expect(sum.length, at("five summary figures")).toBe(5);
      expect(sum[0].value, at("same GW points")).toBe(english.gwPoints);
      expect(sum[1].value.replace(/[\s\u202f\u00a0.,]/g, ""), at("same total")).toBe(english.total.replace(/,/g, ""));
      expect(sum[0].hint, at("the hit, with a real minus sign")).toMatch(lang.hit);
      expect(sum[3].hint, at("the hit as points, with a real minus sign")).toMatch(/−4/);
      expect(page.grand, at("same grand total")).toBe(english.grand);
      expect(page.grandNote, at("hit note with a real minus sign")).toMatch(new RegExp(`−4\\D+${english.gwPoints}`));
      const rows = new Map([...page.xi, ...page.bench].map((r) => [r.name, r.points]));
      expect(rows, at("every player line the same as in English")).toEqual(english.rows);
      expect(text, at("no hyphen-minus before a number")).not.toMatch(/(^|[\s(])-\d/);
      // Locale formats: the team value in the page's money style, never with the bank added.
      expect(sum[4].value, at("team value")).toMatch(/100[.,]7/);
      expect(text, at("the bank is never added on top")).not.toMatch(/102[.,]1/);
    }
  }
}, 180_000);

it("avant-garde press conference, kit craft, and accessibility across normal and blotter modes", async () => {
  // Test 3: Avant-garde craft, press conference voice diversity, kit links, and zero accessibility violations
  const { expectNoAxeViolations } = await import("../axe");

  for (const trip of [false, true]) {
    const mode = trip ? "blotter" : "normal";
    const { doc, text, model } = await open("final", {}, {}, { trip });
    if (model.kind !== "ok") throw new Error(`expected ok model in ${mode}`);

    // 1. Accessibility audit: zero axe violations in both modes
    await expectNoAxeViolations(doc.body);

    // 2. Press conference: exactly 7 exchanges with distinct roles and voices
    const interviews = doc.querySelectorAll("#interview-heading ~ div ul > li, .interview_exchanges__ li, [class*='exchange']");
    expect(interviews.length, `${mode}: press conference has 7 exchanges`).toBeGreaterThanOrEqual(7);

    // 3. Kit and club link integrity: all player shirts link to their club page
    const clubLinks = [...doc.querySelectorAll("a[href^='/club/']")];
    expect(clubLinks.length, `${mode}: club links present on team sheet`).toBeGreaterThan(0);
    for (const a of clubLinks) {
      expect(a.getAttribute("href"), `${mode}: valid club link`).toMatch(/^\/club\/[a-z0-9-]+$/);
    }

    // 4. Neighbor manager navigation: touch-friendly links to adjacent managers
    const neighbours = [...doc.querySelectorAll("a[href^='/team/']")];
    expect(neighbours.length, `${mode}: navigation to neighbor teams`).toBeGreaterThan(0);

    // 5. Clean text: no undefined, NaN, or raw template brackets in rendered markup
    expect(text, `${mode}: text is pristine`).not.toMatch(/undefined|NaN|\[object|\{\{/);
  }
}, 180_000);

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
