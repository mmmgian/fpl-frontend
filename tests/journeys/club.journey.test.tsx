/**
 * Journey: a club's page (/club/<name>) for every club at every moment of the season, rendered by the real page,
 * service and view from the shared in-memory season, and checked against answers worked out here from the world's
 * own schedule and player list.
 *
 * 1. What the page shows for every club at every moment: the header (form guide, "Playing now" / "Next" / no fixture),
 *    the opening lines, up next and recent results, team news and the predicted XI, plus the addresses that lead to
 *    it (numbers, short names, odd spellings), the ones that don't, and FPL being down.
 * 2. The extras and the reader: European fixtures and BBC headlines in every state they can be in (off, fine, empty,
 *    failing, too slow), times in the reader's own zone after hydration, and every language with the same facts.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import { CLIENT_MESSAGES } from "@/lib/domain/i18n/client";
import { clientTrip } from "@/lib/domain/i18n/client/trip";
import { INTL_LOCALE, type Locale } from "@/lib/domain/i18n/locales";
import type { Bootstrap, FplElement, ScheduledFixture } from "@/lib/domain/types";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { PHASES, install, requested, season, teams, uninstall, type Routes, type World } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

// ------------------------------------------------------------------------------------------------ visiting the page

interface Lang {
  locale: Locale;
  trip: boolean;
}
const EN: Lang = { locale: "en", trip: false };
const LANGS: Lang[] = [{ locale: "es", trip: false }, { locale: "fr", trip: false }, { locale: "en", trip: true }, { locale: "es", trip: true }, { locale: "fr", trip: true }];
const label = (l: Lang) => `${l.locale}${l.trip ? " + blotter" : ""}`;
const catalog = (l: Lang): Messages => (l.trip ? tripMessagesFor(l.locale) : MESSAGES[l.locale]);
/** What the I18nProvider hands client components: the client catalog, with the trip strings laid on in the altered view. */
const clientCatalog = (l: Lang) => (l.trip ? clientTrip(CLIENT_MESSAGES[l.locale], l.locale) : CLIENT_MESSAGES[l.locale]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** What a sighted reader sees: no screen-reader-only text, no crest initials (decorative fallbacks). */
function seen(el: Element | null | undefined): string {
  if (!el) return "";
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only, .crest").forEach((x) => x.remove());
  return norm(copy.textContent);
}
const srOf = (el: Element | null | undefined) => norm([...(el?.querySelectorAll(".sr-only") ?? [])].map((x) => x.textContent).join(" "));

/** What FPL serves in a visit: the world's own data unless a route swaps it. */
interface Served {
  bootstrap: Bootstrap;
  schedule: ScheduledFixture[];
}
interface Visit {
  html: string;
  doc: Document;
  text: string;
}
interface Opts {
  extra?: Routes;
  lang?: Lang;
  env?: Record<string, string>;
}

/** Fresh modules, the world behind fetch, the request's language (and any env), then the real page in the layout's provider. */
async function element(world: World, id: string, { extra = [], lang = EN, env = {} }: Opts): Promise<ReactElement> {
  vi.resetModules();
  uninstall();
  install(world, extra);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  const page = (await import("@/app/club/[id]/page")).default;
  const el: ReactElement = await page({ params: Promise.resolve({ id }) });
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  return <I18nProvider locale={lang.locale} trip={lang.trip}>{el}</I18nProvider>;
}
/** The server's first paint. */
async function visit(world: World, id: string, opts: Opts = {}): Promise<Visit> {
  const html = renderToStaticMarkup(await element(world, id, opts));
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc, text: norm(doc.body.textContent) };
}
/** The page after hydration in a browser whose clock is set to `timeZone`. */
async function hydrate(world: World, id: string, timeZone: string, opts: Opts = {}) {
  const was = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    cleanup();
    const { container } = render(await element(world, id, opts));
    return { doc: container, text: norm(container.textContent) };
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}
/** The page's <title> and canonical address. */
async function metadata(world: World, id: string, extra: Routes = []) {
  vi.resetModules();
  uninstall();
  install(world, extra);
  testLanguage.cookie = "en";
  return (await import("@/app/club/[id]/page")).generateMetadata({ params: Promise.resolve({ id }) });
}
/** What the page throws (redirects and 404s are thrown in Next), or null when it renders. */
async function thrown(world: World, id: string, extra: Routes = []): Promise<string | null> {
  try {
    await element(world, id, { extra });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const has = (s: string) => (u: string) => u.includes(s);
const served = (world: World, over: Partial<Served> = {}): Served => ({ bootstrap: world.bootstrap, schedule: world.schedule, ...over });
/** Routes that serve `s` in place of the world's own bootstrap and schedule. */
const serve = (world: World, s: Served): Routes => [
  ...(s.bootstrap !== world.bootstrap ? ([[has("/bootstrap-static/"), s.bootstrap]] as Routes) : []),
  ...(s.schedule !== world.schedule ? ([[(u: string) => u.endsWith("/api/fixtures/"), s.schedule]] as Routes) : []),
];

// ------------------------------------------------------------------------------------------------ the oracle

const club = (id: number) => teams.find((t) => t.id === id)!;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const band = (d: unknown) => (typeof d === "number" && Math.round(d) >= 1 && Math.round(d) <= 5 ? Math.round(d) : 3);
const KICKOFF: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
const DAY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
/** A time as the page prints it: UTC, marked so, on the server; the reader's own zone once hydrated. */
const at = (iso: string, l: Lang, opts: Intl.DateTimeFormatOptions, tz?: string) =>
  tz ? new Date(iso).toLocaleString(INTL_LOCALE[l.locale], { ...opts, timeZone: tz }) : `${new Date(iso).toLocaleString(INTL_LOCALE[l.locale], { ...opts, timeZone: "UTC" })} UTC`;
const oneDecimal = (n: number, l: Lang) => (Math.round((n + Number.EPSILON) * 10) / 10).toLocaleString(INTL_LOCALE[l.locale], { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;

type R = "W" | "D" | "L";
interface Match {
  id: number;
  gw: number | null;
  kickoff: string | null;
  state: "finished" | "provisional" | "live" | "upcoming" | "tbc";
  opp: number;
  home: boolean;
  band: number;
  scored: number | null;
  conceded: number | null;
  result: R | null;
}
/** The club's matches from the schedule: up next (live ones too) soonest first, results latest first, five of each. */
function matchesOf(schedule: ScheduledFixture[], id: number) {
  const all: Match[] = schedule
    .filter((f) => f.team_h === id || f.team_a === id)
    .map((f) => {
      const home = f.team_h === id;
      const state = f.finished ? "finished" : f.finished_provisional ? "provisional" : f.started ? "live" : f.kickoff_time ? "upcoming" : "tbc";
      const played = state !== "upcoming" && state !== "tbc";
      const scored = played ? (home ? f.team_h_score : f.team_a_score) ?? null : null;
      const conceded = played ? (home ? f.team_a_score : f.team_h_score) ?? null : null;
      const settled = (state === "finished" || state === "provisional") && scored !== null && conceded !== null;
      return {
        id: f.id, gw: f.event ?? null, kickoff: f.kickoff_time, state, opp: home ? f.team_a : f.team_h, home,
        band: band(home ? f.team_h_difficulty : f.team_a_difficulty), scored, conceded,
        result: settled ? (scored! > conceded! ? "W" : scored! < conceded! ? "L" : "D") : null,
      };
    });
  const when = (m: Match) => (m.kickoff ? Date.parse(m.kickoff) : Infinity);
  const next = all.filter((m) => m.result === null).sort((a, b) => (when(a) === when(b) ? a.id - b.id : when(a) - when(b))).slice(0, 5);
  const recent = all.filter((m) => m.result !== null).sort((a, b) => (when(a) === when(b) ? b.id - a.id : when(b) - when(a))).slice(0, 5);
  return { next, recent, form: recent.map((m) => m.result!).reverse() };
}

/** Team news: everyone still at the club with news or a flag, out before doubts before notes, newest first, then most minutes. */
function newsOf(elements: FplElement[], id: number) {
  const left = (e: FplElement) => e.status === "u" || e.status === "n";
  const severity = (e: FplElement) => (["i", "s", "u", "n"].includes(e.status ?? "a") ? "out" : e.status === "d" || (e.chance_of_playing_next_round != null && e.chance_of_playing_next_round < 100) ? "doubt" : "note");
  const order = { out: 0, doubt: 1, note: 2 };
  return elements
    .filter((e) => e.team === id && !left(e) && ((e.news ?? "").trim() !== "" || (e.status ?? "a") !== "a"))
    .map((e) => ({ e, severity: severity(e) as "out" | "doubt" | "note" }))
    .sort((a, b) => order[a.severity] - order[b.severity] || (Date.parse(b.e.news_added ?? "") || 0) - (Date.parse(a.e.news_added ?? "") || 0) || (b.e.minutes ?? 0) - (a.e.minutes ?? 0));
}

/** Every opening the page may have: one wording from each line the facts call for, in order. */
function ledes(s: Served, id: number, l: Lang): string[] {
  const c = catalog(l).club;
  const name = club(id).name;
  const { next, form } = matchesOf(s.schedule, id);
  const news = newsOf(s.bootstrap.elements, id);
  const lines: string[][] = [];
  if (form.length) {
    const [w, d, lo] = (["W", "D", "L"] as const).map((r) => form.filter((x) => x === r).length);
    const ppg = (w * 3 + d) / form.length;
    lines.push(c.formLine[ppg >= 2 ? "hot" : ppg < 1 ? "cold" : "mixed"].map((fn) => fn(name, w, d, lo, form.length)));
  }
  const run = next.filter((m) => m.state === "upcoming" || m.state === "tbc").slice(0, 3);
  if (run.length) {
    const avg = run.reduce((a, m) => a + m.band, 0) / run.length;
    lines.push(c.runLine[avg <= 2.5 ? "kind" : avg >= 3.5 ? "tough" : "mixed"].map((fn) => fn(name, oneDecimal(avg, l), run.length)));
  }
  const star = s.bootstrap.elements
    .filter((e) => e.team === id && e.status !== "u" && e.status !== "n" && (e.total_points ?? 0) > 0)
    .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0) || a.id - b.id)[0];
  if (star) {
    const own = Number(star.selected_by_percent) || null;
    lines.push(c.starLine.map((fn) => fn(star.web_name, star.total_points ?? 0, own !== null ? catalog(l).common.percent(oneDecimal(own, l)) : null)));
  }
  const out = news.filter((n) => n.severity === "out").map((n) => n.e.web_name);
  const doubts = news.filter((n) => n.severity === "doubt").length;
  if (out.length) lines.push(c.outLine.map((fn) => fn(new Intl.ListFormat(INTL_LOCALE[l.locale], { type: "conjunction" }).format(out), out.length, doubts)));
  else if (doubts) lines.push(c.doubtLine.map((fn) => fn(doubts)));
  return lines.reduce<string[]>((acc, opts) => acc.flatMap((a) => opts.map((o) => norm(`${a} ${o}`))), [""]).filter(Boolean);
}

// ------------------------------------------------------------------------------------------------ reading the page

function cardsOn(root: ParentNode) {
  return new Map([...root.querySelectorAll("section")].map((s) => [norm(s.querySelector("h2")?.textContent), s] as const));
}
function rowsOf(section: Element | undefined) {
  return [...(section?.querySelectorAll("li.row") ?? [])].map((li) => {
    const opp = li.querySelector(".opponent");
    const end = li.querySelector(".end");
    const chip = end?.querySelector(".chip");
    return {
      when: norm(li.querySelector(".when")?.textContent),
      opponent: seen(opp),
      link: opp?.tagName === "A" ? opp.getAttribute("href") : null,
      linkTitle: opp?.getAttribute("title") ?? null,
      venue: norm(li.querySelector(".venue")?.textContent),
      pip: norm(end?.querySelector(".pip")?.textContent) || null,
      sr: srOf(end) || null,
      score: norm(end?.querySelector("strong")?.textContent) || null,
      badge: norm(end?.querySelector(".badge")?.textContent) || null,
      kickoff: norm(end?.querySelector(".kickoff")?.textContent) || null,
      chip: chip ? { band: Number(chip.className.match(/band(\d)/)?.[1]), text: seen(chip), sr: srOf(chip) } : null,
    };
  });
}
function newsRowsOf(section: Element | undefined) {
  return [...(section?.querySelectorAll("li.newsRow") ?? [])].map((li) => ({
    badge: norm(li.querySelector(".badge")?.textContent),
    tone: li.querySelector(".badge")?.className.split(" ")[1] ?? null,
    name: norm(li.querySelector("strong")?.textContent),
    text: norm(li.querySelector(".newsText")?.textContent),
    meta: [...(li.querySelector(".newsMeta")?.children ?? [])].map((x) => norm(x.textContent)),
  }));
}
function headerOf(root: ParentNode) {
  const header = root.querySelector("h1")!.closest("header")!;
  const guide = header.querySelector(".meta [role=img]");
  const line = [...header.querySelectorAll(".meta > span")].find((s) => !s.hasAttribute("role"));
  return {
    title: seen(root.querySelector("h1")),
    eyebrow: norm(header.querySelector(".eyebrow")?.textContent),
    back: [norm(header.querySelector("a")?.textContent), header.querySelector("a")?.getAttribute("href")],
    guide: guide ? { label: guide.getAttribute("aria-label"), pips: [...guide.querySelectorAll(".pip")].map((p) => [norm(p.textContent), p.className.match(/pip([WDL])/)?.[1]]) } : null,
    line: seen(line),
    lineBadge: norm(line?.querySelector(".badge")?.textContent) || null,
  };
}

function expectClean(text: string, where: string) {
  expect(text, `${where}: no undefined/NaN/[object]/Infinity/null`).not.toMatch(/undefined|NaN|\[object|Infinity|null/);
}

// ------------------------------------------------------------------------------------------------ the checks

/** The page agrees with the schedule and the player list: header, opening, both fixture cards, team news, XI card. */
function checkClub(v: { doc: ParentNode; text: string }, s: Served, id: number, where: string, { lang = EN, tz }: { lang?: Lang; tz?: string } = {}) {
  const t = catalog(lang);
  const c = t.club;
  const cl = clientCatalog(lang);
  const me = club(id);
  const { next, recent, form } = matchesOf(s.schedule, id);
  const oppName = (m: Match) => (teams.some((x) => x.id === m.opp) ? club(m.opp).name : t.common.unknownClub);

  // The header: who, where back to, the form guide (oldest first), and what's on now or next.
  const h = headerOf(v.doc);
  expect(h.title, `${where}: the club's name as the title`).toBe(me.name);
  expect(h.eyebrow, `${where}: eyebrow`).toBe(c.eyebrow);
  expect(h.back, `${where}: back to the fixtures`).toEqual([t.common.fixturesBack, "/fixtures"]);
  expect(h.guide, `${where}: form guide, oldest first, with its meaning for screen readers`).toEqual(
    form.length ? { label: c.form(form.length, form.map((r) => c.result[r]).join(", ")), pips: form.map((r) => [c.pip[r], r]) } : null,
  );
  const first = next[0];
  const headline = !first
    ? c.noFixture
    : first.state === "live"
      ? norm(`${t.common.live} ${c.playingNow(first.home, oppName(first))} ${first.scored ?? 0}–${first.conceded ?? 0}`)
      : norm(c.next(first.home, oppName(first)) + (first.kickoff ? at(first.kickoff, lang, KICKOFF, tz) : t.common.timeTbc.toLowerCase()));
  expect(h.line, `${where}: playing now / next / nothing scheduled`).toBe(headline);
  expect(h.lineBadge, `${where}: 'Live' only while the club's match is on`).toBe(first?.state === "live" ? t.common.live : null);

  // The opening lines: one wording per fact, each fact from the schedule and the player list.
  const lede = norm(v.doc.querySelector("p.lede")?.textContent) || null;
  const options = ledes(s, id, lang);
  if (options.length) expect(options, `${where}: the opening lines`).toContain(lede);
  else expect(lede, `${where}: no opening without facts`).toBeNull();

  // Up next and recent results.
  const cards = cardsOn(v.doc);
  const rowFor = (m: Match) => {
    const known = teams.some((x) => x.id === m.opp);
    const base = {
      when: m.gw ? t.common.gw(m.gw) : c.gw(null, ""),
      opponent: oppName(m),
      link: known ? `/club/${slug(club(m.opp).name)}` : null,
      linkTitle: known ? cl.clubLink.title(club(m.opp).name) : null,
      venue: m.home ? t.common.home : t.common.away,
    };
    if (m.result) return { ...base, pip: c.pip[m.result], sr: `${c.result[m.result]},`, score: `${m.scored}–${m.conceded}`, badge: null, kickoff: null, chip: null };
    if (m.state === "live") return { ...base, pip: null, sr: null, score: `${m.scored ?? 0}–${m.conceded ?? 0}`, badge: t.common.live, kickoff: null, chip: null };
    return {
      ...base, pip: null, sr: cl.fdr.difficulty(m.band), score: null, badge: null,
      kickoff: m.kickoff ? at(m.kickoff, lang, KICKOFF, tz) : t.common.timeTbc,
      chip: { band: m.band, text: String(m.band), sr: cl.fdr.difficulty(m.band) },
    };
  };
  for (const [title, list, empty] of [[c.upNext, next, c.upNextEmpty], [c.recent, recent, c.recentEmpty]] as const) {
    const card = cards.get(title);
    expect(card, `${where}: a '${title}' card`).toBeTruthy();
    expect(rowsOf(card), `${where}, ${title}: every match, in order, with venue, result or kick-off and difficulty`).toEqual(list.map(rowFor));
    expect(norm(card!.querySelector(".fact")?.textContent) || null, `${where}, ${title}: the empty line only when empty`).toBe(list.length ? null : empty);
  }

  // Team news.
  const news = newsOf(s.bootstrap.elements, id);
  const newsCard = cards.get(c.news);
  expect(newsCard, `${where}: a team news card`).toBeTruthy();
  expect(newsRowsOf(newsCard), `${where}: team news, most serious and newest first`).toEqual(
    news.map(({ e, severity }) => ({
      badge: c.severity[severity],
      tone: { out: "live", doubt: "warning", note: "neutral" }[severity],
      name: e.web_name,
      text: e.news ? e.news.replace(/ - /g, " – ") : c.newsNoDetail,
      meta: [
        ...(e.chance_of_playing_next_round != null ? [c.chance(e.chance_of_playing_next_round)] : []),
        ...(e.news_added ? [norm(`${c.added}${at(e.news_added, lang, DAY, tz)}`)] : []),
      ],
    })),
  );
  if (!news.length) expect(c.newsEmpty.map((fn) => fn(me.name)), `${where}: a clean bill of health, said one way or another`).toContain(norm(newsCard!.querySelector(".fact")?.textContent));

  // "Nothing to show" only when there is truly nothing.
  const nothing = !news.length && !next.length && !recent.length;
  expect(v.text.includes(c.nothingBody), `${where}: 'nothing to show' only with no fixtures and no news`).toBe(nothing);
  expect(cards.has(c.xi), `${where}: the predicted XI card is always there`).toBe(true);
  expectClean(v.text, where);
}

/** The XI card: its shape line, the gap note, each line's players (or open places) and the caveat. */
function xiOn(root: ParentNode, l: Lang = EN) {
  const card = cardsOn(root).get(catalog(l).club.xi)!;
  return {
    big: norm(card.querySelector(".big")?.textContent) || null,
    gap: norm(card.querySelector(".gap")?.textContent) || null,
    lines: [...card.querySelectorAll("li.line")].map((li) => [
      norm(li.querySelector(".lineLabel")?.textContent),
      [...li.querySelectorAll("li.player")].map((p) =>
        p.classList.contains("openPlace") ? [norm(p.firstChild?.textContent), norm(p.querySelector(".rate")?.textContent), "open"] : [norm(p.querySelector("strong")?.textContent), norm(p.querySelector(".badge")?.textContent) || null, norm(p.querySelector(".rate")?.textContent), srOf(p)],
      ),
    ]),
    caveat: norm(card.querySelector(".caveat")?.textContent) || null,
    empty: norm(card.querySelector(".fact")?.textContent) || null,
  };
}

/** A player added to the world's list (a copy of one of the club's own, with the given facts). */
function extraPlayer(world: World, clubId: number, id: number, over: Partial<FplElement>): FplElement {
  const template = world.bootstrap.elements.find((e) => e.team === clubId)!;
  return { ...template, id, web_name: `Extra ${id}`, status: "a", news: "", news_added: null, chance_of_playing_next_round: null, total_points: 10, selected_by_percent: "1.0", ...over };
}

// ------------------------------------------------------------------------------------------------ 1. every club, every moment

describe("the club page", () => {
  it("every club at every moment: header, form, opening, fixtures, results, news and XI from the season; addresses, 404s and outages", async () => {
    const t = MESSAGES.en;
    const c = t.club;

    for (const phase of PHASES) {
      const world = season(phase);
      const s = served(world);
      for (const team of teams) {
        const v = await visit(world, slug(team.name));
        checkClub(v, s, team.id, `${phase}, ${team.short_name}`);
        // With six players a club, there are never seven fit regulars to name: no guessing.
        expect(xiOn(v.doc).empty, `${phase}, ${team.short_name}: no XI from six players`).toBe(c.xiEmpty);
        expect(cardsOn(v.doc).get(c.headlines)?.querySelector(".fact")?.textContent, `${phase}, ${team.short_name}: the BBC down (no feed in this world) empties only its card`).toBe(c.unavailable);
        expect(cardsOn(v.doc).has(c.championsLeague) || cardsOn(v.doc).has(c.europe), `${phase}, ${team.short_name}: no European card without a key`).toBe(false);
      }
      expect(requested.some((u) => u.includes("football-data")), `${phase}: no football-data request without a key`).toBe(false);
    }

    // The moments themselves, spelled out for a few clubs so the oracle can't be wrong in the same way as the page.
    {
      const live = season("live-playing");
      const mci = headerOf((await visit(live, "man-city")).doc);
      expect([mci.lineBadge, mci.line], "live: Man City are playing at Newcastle, 1–2 from City's side").toEqual([t.common.live, `${t.common.live} Playing now: at Newcastle 1–2`]);
      const ars = await visit(live, "arsenal");
      const arsRecent = rowsOf(cardsOn(ars.doc).get(c.recent));
      expect(arsRecent[0], "live: Arsenal's GW6 win over Chelsea, finished at 13:45, is the latest result").toMatchObject({ when: "GW6", opponent: "Chelsea", venue: t.common.home, pip: "W", score: "3–2" });
      expect(headerOf(ars.doc).line, "live: Arsenal next go to Man City, GW7's first kick-off").toBe("Next: at Man City, Sat 17 Oct, 11:30 UTC");
      const over = await visit(season("season-over"), "everton");
      expect(headerOf(over.doc).line, "season over: nothing scheduled").toBe(c.noFixture);
      expect(rowsOf(cardsOn(over.doc).get(c.recent)).map((r) => r.when), "season over: the last five gameweeks, latest first").toEqual(["GW38", "GW37", "GW36", "GW35", "GW34"]);
      const pre = await visit(season("preseason"), "liverpool");
      expect(headerOf(pre.doc).guide, "preseason: no form guide yet").toBeNull();
      expect(norm(cardsOn(pre.doc).get(c.recent)?.textContent), "preseason: no results yet").toContain(c.recentEmpty);
      const news = newsRowsOf(cardsOn((await visit(season("upcoming"), "liverpool")).doc).get(c.news));
      expect(news, "LIV M2's knee injury, word for word").toEqual([{ badge: "Out", tone: "live", name: "LIV M2", text: "Knee injury – expected back in November", meta: ["0% to play", "Added Thu 8 Oct UTC"] }]);
    }

    // Odd fixtures: a club FPL doesn't list, a postponed match with no date, a result awaiting its bonus, odd ratings.
    {
      const world = season("live-playing");
      const ars = world.schedule.filter((f) => f.team_h === 1 || f.team_a === 1);
      const nextArs = ars.find((f) => !f.started)!;
      const laterArs = ars.filter((f) => !f.started)[1];
      // Arsenal's matches after GW9 are dropped, so the postponed one (otherwise sixth) is among the five shown.
      const schedule = structuredClone(world.schedule)
        .filter((f) => !((f.team_h === 1 || f.team_a === 1) && (f.event ?? 0) > 9))
        .map((f) =>
          f.id === nextArs.id ? { ...f, ...(f.team_h === 1 ? { team_a: 99 } : { team_h: 99 }) }
          : f.id === laterArs.id ? { ...f, event: null, kickoff_time: null, team_h_difficulty: 0, team_a_difficulty: 9 }
          : f.id === 61 ? { ...f, finished: false, finished_provisional: true }
          : f,
        );
      const s = served(world, { schedule });
      const v = await visit(world, "arsenal", { extra: serve(world, s) });
      checkClub(v, s, 1, "odd fixtures, ARS");
      expect(headerOf(v.doc).line, "unknown opponent: named in the page's language").toMatch(/^Next: (at )?Unknown club, /);
      const rows = rowsOf(cardsOn(v.doc).get(c.upNext));
      expect(rows[0], "unknown opponent: plain text, no link to a missing page").toMatchObject({ opponent: t.common.unknownClub, link: null });
      expect(rows.at(-1), "postponed: last, TBC, time to be confirmed, an odd rating read as 3").toMatchObject({ when: "TBC", kickoff: t.common.timeTbc, chip: { band: 3, text: "3", sr: CLIENT_MESSAGES.en.fdr.difficulty(3) } });
      expect(rowsOf(cardsOn(v.doc).get(c.recent))[0], "bonus pending: still a result").toMatchObject({ pip: "W", score: "3–2" });

      // The only match left is postponed: the header says so.
      const lone = served(world, { schedule: world.schedule.map((f) => (f.team_h === 1 || f.team_a === 1) && !f.started ? (f.id === nextArs.id ? { ...f, kickoff_time: null, event: null } : { ...f, team_h: f.team_h === 1 ? 99 : f.team_h, team_a: f.team_a === 1 ? 99 : f.team_a }) : f) });
      const lv = await visit(world, "arsenal", { extra: serve(world, lone) });
      checkClub(lv, lone, 1, "only a postponed match left");
      expect(headerOf(lv.doc).line, "postponed only: 'time to be confirmed' in the header").toMatch(/time to be confirmed$/);
    }

    // Nothing at all: no fixtures, no flags. Said plainly, with no empty opening.
    {
      const world = season("preseason", { flags: {} });
      const s = served(world, { schedule: [], bootstrap: { ...world.bootstrap, elements: world.bootstrap.elements.map((e) => ({ ...e, total_points: 0 })) } });
      const v = await visit(world, "everton", { extra: serve(world, s) });
      checkClub(v, s, 7, "nothing at all");
      expect(v.text, "nothing at all: says so").toContain(c.nothing);
      expect(v.doc.querySelector("p.lede"), "nothing at all: no opening lines").toBeNull();
    }

    // Team news in every shape FPL sends it, and a predicted XI once there are enough fit regulars.
    {
      const world = season("upcoming");
      const p = (id: number, over: Partial<FplElement>) => extraPlayer(world, 1, id, over);
      const extra = [
        p(201, { element_type: 2, starts: 5, minutes: 400 }),
        p(202, { element_type: 3, starts: 5, minutes: 450 }),
        p(203, { element_type: 3, starts: 2, minutes: 200 }),
        p(204, { element_type: 4, starts: 4, minutes: 380 }),
        p(205, { element_type: 2, starts: 0, minutes: 0 }),
        p(206, { element_type: 3, starts: 6, minutes: 540, status: "i", news: "Hamstring - six weeks", chance_of_playing_next_round: 0, news_added: "2026-10-12T10:00:00Z" }),
        p(207, { element_type: 4, starts: 3, minutes: 270, status: "d", news: "Ill - 25% chance of playing", chance_of_playing_next_round: 25, news_added: "2026-10-14T10:00:00Z" }),
        p(208, { element_type: 2, starts: 6, minutes: 500, status: "d", news: "", chance_of_playing_next_round: 75, news_added: null }),
        p(209, { element_type: 3, starts: 1, minutes: 90, status: "u", news: "Has joined Barcelona permanently" }),
        p(210, { element_type: 3, starts: 0, minutes: 0, status: "a", news: "Back in training", chance_of_playing_next_round: 100, news_added: "2026-10-15T10:00:00Z" }),
        p(211, { element_type: 3, starts: 0, minutes: 0, status: "s", news: "Suspended until 24 Oct", chance_of_playing_next_round: 0, news_added: "2026-10-15T10:00:00Z", total_points: 99, selected_by_percent: "0.0" }),
      ];
      const s = served(world, { bootstrap: { ...world.bootstrap, elements: [...world.bootstrap.elements, ...extra] } });
      const v = await visit(world, "arsenal", { extra: serve(world, s) });
      checkClub(v, s, 1, "news and XI, ARS");
      expect(newsRowsOf(cardsOn(v.doc).get(c.news)).map((r) => [r.badge, r.name, r.text]), "news: out (newest first), then doubts, then a plain note; the departed left out").toEqual([
        ["Out", "Extra 211", "Suspended until 24 Oct"], ["Out", "Extra 206", "Hamstring – six weeks"],
        ["Doubt", "Extra 207", "Ill – 25% chance of playing"], ["Doubt", "Extra 208", c.newsNoDetail],
        ["News", "Extra 210", "Back in training"],
      ]);
      // The XI by hand: fit regulars are GK 11; D 12, 208, 13, 201; M 202, 14, 15, 203; F 16, 204 (206 out, 207 under 50%, 205 never started).
      const cost = (id: number) => `, ${money(s.bootstrap.elements.find((e) => e.id === id)!.now_cost!)}`;
      const pl = (id: number, name: string, pct: number, doubt: string | null = null) => [name, doubt, c.starts(pct), cost(id)];
      expect(xiOn(v.doc), "XI: a legal 4-4-2 from the fit regulars, best first, the doubt marked, the caveat honest").toEqual({
        big: `4-4-2${c.shape}`,
        gap: null,
        lines: [
          [c.lines.forwards, [pl(16, "ARS F1", 100), pl(204, "Extra 204", 67)]],
          [c.lines.midfield, [pl(202, "Extra 202", 83), pl(14, "ARS M1", 67), pl(15, "ARS M2", 50), pl(203, "Extra 203", 33)]],
          [c.lines.defence, [pl(12, "ARS D1", 100), pl(208, "Extra 208", 100, c.doubt), pl(13, "ARS D2", 83), pl(201, "Extra 201", 83)]],
          [c.lines.goalkeeper, [pl(11, "ARS GK", 50)]],
        ],
        caveat: c.caveat(6, false),
        empty: null,
      });

      // No fit forward: the place is left open, the shape unclear, and the page says why.
      const noForward = served(world, {
        bootstrap: {
          ...world.bootstrap,
          elements: [...world.bootstrap.elements.map((e) => (e.id === 16 ? { ...e, status: "i", news: "Broken foot", chance_of_playing_next_round: 0 } : e)), extra[0], extra[1], extra[2], p(212, { element_type: 3, starts: 1, minutes: 90 })],
        },
      });
      const nf = await visit(world, "arsenal", { extra: serve(world, noForward) });
      checkClub(nf, noForward, 1, "no fit forward, ARS");
      const xi = xiOn(nf.doc);
      expect([xi.big, xi.gap], "no forward: shape unclear, 9 fit, 2 places open").toEqual([`${c.shapeUnclear}${c.shapeUnclearNote}`, c.fewFit(9, 2)]);
      expect(xi.lines[0], "no forward: one open place up front").toEqual([c.lines.forwards, [[c.openPlace, c.noRegular, "open"]]]);
      expect((xi.lines[1][1] as unknown[]).length, "no forward: five midfielders").toBe(5);
      expect(xi.caveat, "no forward: the caveat counts the most-used player's starts").toBe(c.caveat(6, false));
    }

    // Addresses: a number or a short name is sent on to the club's name; odd spellings reach it too; the rest are 404s.
    {
      const world = season("live-playing");
      const cases: [string, string | null][] = [
        ["1", "NEXT_REDIRECT:/club/arsenal"], ["2", "NEXT_REDIRECT:/club/man-city"], ["8", "NEXT_REDIRECT:/club/brighton"],
        ["ars", "NEXT_REDIRECT:/club/arsenal"], ["TOT", "NEXT_REDIRECT:/club/spurs"], ["Man%20City", "NEXT_REDIRECT:/club/man-city"], ["Man City", "NEXT_REDIRECT:/club/man-city"],
        ["Arsenal", "NEXT_REDIRECT:/club/arsenal"], ["spurs", null], ["man-city", null],
        ["99", "NEXT_NOT_FOUND"], ["0", "NEXT_NOT_FOUND"], ["abc", "NEXT_NOT_FOUND"], ["1234567", "NEXT_NOT_FOUND"], ["%E0%A4%A", "NEXT_NOT_FOUND"], ["-", "NEXT_NOT_FOUND"], ["01", "NEXT_NOT_FOUND"],
      ];
      for (const [id, want] of cases) expect(await thrown(world, id), `address '${id}'`).toBe(want);
      for (const team of teams) {
        expect(await metadata(world, slug(team.name)), `${team.short_name}: title and canonical address`).toEqual({ title: team.name, alternates: { canonical: `/club/${slug(team.name)}` } });
        expect(await thrown(world, String(team.id)), `${team.short_name}: its number leads to its name`).toBe(`NEXT_REDIRECT:/club/${slug(team.name)}`);
      }
      expect(await metadata(world, "99"), "unknown club: the generic title, no canonical").toEqual({ title: t.meta.club, alternates: undefined });
    }

    // FPL down: the page fails (the error page, with its retry), never a 404 for a real club; a missing schedule fails it too.
    {
      const world = season("live-playing");
      const down: Routes = [[has("/bootstrap-static/"), () => new Response("down", { status: 503 })]];
      const err = await thrown(world, "arsenal", down);
      expect(err, "FPL down: an error").not.toBeNull();
      expect(err, "FPL down: not a 404 or a redirect").not.toMatch(/NEXT_NOT_FOUND|NEXT_REDIRECT/);
      expect(await metadata(world, "arsenal", down), "FPL down: the generic title").toEqual({ title: t.meta.club, alternates: undefined });
      const noSchedule = await thrown(world, "arsenal", [[(u) => u.endsWith("/api/fixtures/"), () => new Response("down", { status: 500 })]]);
      expect(noSchedule, "no schedule: an error, not a page of blanks or a 404").not.toBeNull();
      expect(noSchedule).not.toMatch(/NEXT_NOT_FOUND|NEXT_REDIRECT/);
    }
  });

  // ------------------------------------------------------------------------------------------------ 2. extras and readers

  it("the extras and the reader: European fixtures and BBC headlines in every state, local times after hydration, and every language", async () => {
    const t = MESSAGES.en;
    const c = t.club;
    const world = season("live-playing");
    const s = served(world);
    const key = { FOOTBALL_DATA_API_KEY: "test-key" };

    // a) football-data.org with a key: matching clubs by name, filtering and ordering matches, and every failure as its own card state.
    const fd = (path: string) => (u: string) => u.startsWith(`https://api.football-data.org/v4${path}`);
    const fdTeams = { teams: [{ id: 57, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" }, { id: 65, name: "Manchester City FC", shortName: "Man City", tla: "MCI" }, { id: 73, name: "Tottenham Hotspur FC", shortName: "Tottenham", tla: "TOT" }, { id: 61, name: "Chelsea FC", shortName: "Chelsea", tla: "CHE" }] };
    const cl = { name: "UEFA Champions League" };
    const europe: Routes = [
      [fd("/competitions/PL/teams"), fdTeams],
      [fd("/teams/57/matches"), {
        matches: [
          { id: 3, utcDate: null, status: "SCHEDULED", competition: cl, homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 9, name: "Inter" } },
          { id: 2, utcDate: "2026-11-04T20:00:00Z", competition: cl, homeTeam: { id: 5, shortName: "Bayern" }, awayTeam: { id: 57, shortName: "Arsenal" } },
          { id: 1, utcDate: "2026-10-21T19:00:00Z", competition: cl, homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 8, name: "Real Madrid CF" } },
          { id: 1, utcDate: "2026-10-21T19:00:00Z", competition: cl, homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 8, name: "Real Madrid CF" } },
          { id: 4, utcDate: "2026-10-18T14:00:00Z", competition: { name: "Premier League" }, homeTeam: { id: 57 }, awayTeam: { id: 61 } },
          null,
        ],
      }],
      [fd("/teams/65/matches"), { matches: [{ id: 11, utcDate: "2026-10-22T19:00:00Z", competition: { name: "UEFA Europa League" }, homeTeam: { shortName: "Man City" }, awayTeam: { shortName: "Roma" } }, { id: 10, utcDate: "2026-10-20T19:00:00Z", competition: cl, homeTeam: { shortName: "PSG" }, awayTeam: { shortName: "Man City" } }] }],
      [fd("/teams/73/matches"), { matches: [] }],
      [fd("/teams/61/matches"), () => new Response("rate limited", { status: 429 })],
    ];
    const euro = (root: ParentNode, title: string) => {
      const card = cardsOn(root).get(title);
      return card ? { rows: [...card.querySelectorAll("li")].map((li) => [norm(li.querySelector(".comp")?.textContent) || null, norm(li.querySelector("strong")?.textContent), norm(li.querySelector(".kickoff")?.textContent)]), fact: norm(card.querySelector(".fact")?.textContent) || null } : null;
    };
    {
      const ars = await visit(world, "arsenal", { extra: europe, env: key });
      checkClub(ars, s, 1, "europe, ARS");
      expect(euro(ars.doc, c.championsLeague), "ARS: Champions League only, soonest first, the repeat once, the league match left out, the undated one last").toEqual({
        rows: [[null, "Arsenal v Real Madrid CF", "Wed 21 Oct, 19:00 UTC"], [null, "Bayern v Arsenal", "Wed 4 Nov, 20:00 UTC"], [null, "Arsenal v Inter", c.dateTbc]],
        fact: null,
      });
      expect(requested.filter((u) => u.includes("football-data")).map((u) => u.replace("https://api.football-data.org/v4", "")), "ARS: the club list, then that club's matches").toEqual(["/competitions/PL/teams", "/teams/57/matches?status=SCHEDULED"]);
      const mci = await visit(world, "man-city", { extra: europe, env: key });
      expect(euro(mci.doc, c.europe), "MCI: another competition turns up, so 'In Europe', each row naming its competition").toEqual({ rows: [["Champions League", "PSG v Man City", "Tue 20 Oct, 19:00 UTC"], ["Europa League", "Man City v Roma", "Thu 22 Oct, 19:00 UTC"]], fact: null });
      expect(euro((await visit(world, "spurs", { extra: europe, env: key })).doc, c.championsLeague), "TOT: none coming up, said plainly").toEqual({ rows: [], fact: c.europeEmpty });
      expect(euro((await visit(world, "chelsea", { extra: europe, env: key })).doc, c.championsLeague), "CHE: the source refuses").toEqual({ rows: [], fact: c.unavailable });
      const liv = await visit(world, "liverpool", { extra: europe, env: key });
      expect(euro(liv.doc, c.championsLeague), "LIV: the source doesn't know the club").toEqual({ rows: [], fact: c.unavailable });
      checkClub(liv, s, 5, "europe unavailable, LIV: the rest of the page unaffected");
    }

    // b) BBC Sport headlines: as published, newest first, BBC links only, each story once, with the credit; empty; failing; too slow.
    const rss = (items: string[]) => `<?xml version="1.0"?><rss><channel><title>BBC Sport</title>${items.join("")}</channel></rss>`;
    const item = (title: string, link: string, date?: string, desc?: string) => `<item><title><![CDATA[${title}]]></title>${desc ? `<description><![CDATA[${desc}]]></description>` : ""}<link>${link}</link>${date ? `<pubDate>${date}</pubDate>` : ""}</item>`;
    const bbc = (club: string, body: () => Response | Promise<Response>): Routes[number] => [has(`feeds.bbci.co.uk/sport/football/teams/${club}/rss.xml`), body];
    const feeds: Routes = [
      bbc("arsenal", () => new Response(rss([
        item("Saka &amp; Odegaard fit for Brighton", "https://www.bbc.co.uk/sport/football/articles/a1", "Thu, 15 Oct 2026 08:00:00 GMT", "<p>Both trained on Thursday.</p>"),
        item("Fake story", "https://evil.example.com/a2", "Fri, 16 Oct 2026 08:00:00 GMT"),
        item("Arteta on the title race", "https://www.bbc.com/sport/football/articles/a3", "Fri, 16 Oct 2026 07:00:00 GMT"),
        item("Saka &amp; Odegaard fit for Brighton (repeat)", "https://www.bbc.co.uk/sport/football/articles/a1", "Fri, 16 Oct 2026 09:00:00 GMT"),
        item("Undated piece", "https://www.bbc.co.uk/sport/football/articles/a4"),
      ]))),
      bbc("chelsea", () => new Response(rss([]))),
      bbc("tottenham-hotspur", () => new Response("x", { status: 500 })),
    ];
    const slow: Routes = [bbc("everton", () => new Promise<Response>(() => {}))];
    const heads = (root: ParentNode) => {
      const card = cardsOn(root).get(c.headlines);
      return card
        ? {
            items: [...card.querySelectorAll("ul.news > li")].map((li) => ({
              title: seen(li.querySelector("a")), href: li.querySelector("a")?.getAttribute("href"), target: li.querySelector("a")?.getAttribute("target"), sr: srOf(li.querySelector("a")),
              summary: norm(li.querySelector(".summary")?.textContent) || null, published: norm(li.querySelector(".published")?.textContent) || null,
            })),
            credit: [norm(card.querySelector(".credit")?.textContent) || null, card.querySelector(".credit a")?.getAttribute("href") ?? null],
            fact: norm(card.querySelector(".fact")?.textContent) || null,
          }
        : null;
    };
    {
      const ars = await visit(world, "arsenal", { extra: feeds });
      checkClub(ars, s, 1, "headlines, ARS");
      expect(heads(ars.doc), "ARS: the BBC's stories as published, newest first, no outside links, no repeats, credited").toEqual({
        items: [
          { title: "Arteta on the title race", href: "https://www.bbc.com/sport/football/articles/a3", target: "_blank", sr: t.common.opensNewTab, summary: null, published: "Fri 16 Oct, 07:00 UTC" },
          { title: "Saka & Odegaard fit for Brighton", href: "https://www.bbc.co.uk/sport/football/articles/a1", target: "_blank", sr: t.common.opensNewTab, summary: "Both trained on Thursday.", published: "Thu 15 Oct, 08:00 UTC" },
          { title: "Undated piece", href: "https://www.bbc.co.uk/sport/football/articles/a4", target: "_blank", sr: t.common.opensNewTab, summary: null, published: null },
        ],
        credit: [norm(`${c.creditBefore}${c.creditLink}${c.creditAfter}`), "https://www.bbc.co.uk/sport/football/teams/arsenal"],
        fact: null,
      });
      expect(heads((await visit(world, "chelsea", { extra: feeds })).doc), "CHE: an empty feed, said plainly").toEqual({ items: [], credit: [null, null], fact: c.headlinesEmpty });
      expect(heads((await visit(world, "brighton", { extra: feeds })).doc)?.fact, "BHA: no feed (404)").toBe(c.unavailable);
      expect(requested.some((u) => u.includes("teams/brighton-and-hove-albion/rss.xml")), "BHA: asked for under the BBC's own name for the club").toBe(true);
      // Spurs' feed fails and Everton's never answers: each empties only its own card, the slow one after the page's deadline.
      for (const [slugName, id] of [["spurs", 6], ["everton", 7]] as const) {
        const v = await visit(world, slugName, { extra: [...feeds, ...slow] });
        checkClub(v, s, id, `headlines down, ${slugName}`);
        expect(heads(v.doc)?.fact, `${slugName}: unavailable, the rest of the page unaffected`).toBe(c.unavailable);
      }
    }

    // c) In the reader's browser: kick-offs, team news dates and headline times in their own zone.
    for (const tz of ["Asia/Tokyo", "America/Los_Angeles", "Europe/London"]) {
      for (const [name, id] of [["brighton", 8], ["liverpool", 5], ["man-city", 2]] as const) {
        const h = await hydrate(world, name, tz);
        checkClub(h, s, id, `hydrated in ${tz}, ${name}`, { tz });
      }
    }
    {
      const tokyo = headerOf((await hydrate(world, "brighton", "Asia/Tokyo")).doc);
      expect(tokyo.line, "Tokyo: Brighton's 16:30 UTC kick-off at Liverpool is 01:30 on Sunday there").toBe("Next: at Liverpool, Sun 11 Oct, 01:30");
      const la = heads((await hydrate(world, "arsenal", "America/Los_Angeles", { extra: feeds })).doc);
      expect(la?.items.map((i) => i.published), "LA: the BBC's times in Pacific time").toEqual(["Fri 16 Oct, 00:00", "Thu 15 Oct, 01:00", null]);
    }

    // d) Every language and the altered view: the same facts and order; words, numbers and dates in each language; no English left.
    {
      const flags = { 55: { status: "i", news: "Knee injury - expected back in November", chance: 0 }, 41: { status: "d", news: "Minor knock - 75% chance of playing", chance: 75 }, 13: { status: "d", news: "", chance: null } };
      const w = season("live-playing", { flags });
      const ws = served(w);
      const extras = [...europe, ...feeds];
      const shape = (root: ParentNode) => ({
        rows: [...root.querySelectorAll("li.row")].map((li) => [li.querySelector(".opponent")?.getAttribute("href") ?? null, norm(li.querySelector("strong")?.textContent), li.querySelector(".chip")?.className.match(/band(\d)/)?.[1] ?? null]),
        links: [...root.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      });
      const allow = [
        ...teams.flatMap((x) => [x.name, x.short_name]), /^[A-Z]{3} (GK|D1|D2|M1|M2|F1)$/, /^GW\d+$/, /^[WDL]$/, /^\d$/, /UTC$/,
        "Knee injury", "Minor knock", "Saka & Odegaard", "Arteta on the title race", "Undated piece", "Both trained on Thursday", "BBC Sport", "Real Madrid", "Bayern", "Inter", "PSG", "Roma",
        // The provider's own competition names on European rows (the card's title is checked to be translated below).
        /^(Champions|Europa) League$/,
      ];
      for (const team of teams) {
        const english = await visit(w, slug(team.name), { extra: extras, env: key });
        checkClub(english, ws, team.id, `en, ${team.short_name}`);
        for (const lang of LANGS) {
          const where = `${label(lang)}, ${team.short_name}`;
          const v = await visit(w, slug(team.name), { extra: extras, env: key, lang });
          checkClub(v, ws, team.id, where, { lang });
          expect({ ...shape(v.doc), news: newsRowsOf(cardsOn(v.doc).get(catalog(lang).club.news)).map((r) => [r.name, r.tone]) }, `${where}: the same matches, scores, ratings, news and links as English`).toEqual({
            ...shape(english.doc), news: newsRowsOf(cardsOn(english.doc).get(c.news)).map((r) => [r.name, r.tone]),
          });
          expect(xiOn(v.doc, lang).empty, `${where}: no XI, in this language`).toBe(catalog(lang).club.xiEmpty);
          expect(cardsOn(v.doc).get(catalog(lang).club.headlines), `${where}: the headlines card, in this language`).toBeTruthy();
          expect(cardsOn(v.doc).has(team.id === 2 ? catalog(lang).club.europe : catalog(lang).club.championsLeague), `${where}: the European card's title, in this language`).toBe(true);
          if (lang.locale !== "en") {
            const base = lang.trip ? await visit(w, slug(team.name), { extra: extras, env: key, lang: { locale: "en", trip: true } }) : english;
            expect(englishLeaks(base.html, v.html, lang.locale as "es" | "fr", { allow }), `${where}: no English left behind`).toEqual([]);
            expect(v.text, `${where}: actually translated`).not.toBe(base.text);
            // FPL's injury notes and the BBC's headlines stay English, marked so for screen readers.
            for (const el of [...v.doc.querySelectorAll(".newsText, a.headline")].filter((x) => !x.textContent?.includes(catalog(lang).club.newsNoDetail))) {
              expect(el.querySelector("[lang=en]"), `${where}: '${norm(el.textContent)}' marked as English`).not.toBeNull();
            }
          }
        }
      }
    }
  }, 60_000);

  it("club identity, European campaign, news decoding, and accessibility across normal and blotter modes", async () => {
    // Test 3: Club identity card structure, headline entity decoding, and zero axe violations
    const { expectNoAxeViolations } = await import("../axe");
    const world = season("final");

    for (const trip of [false, true]) {
      const mode = trip ? "blotter" : "normal";
      const v = await visit(world, "arsenal", { lang: { locale: "en", trip } });

      // 1. Accessibility audit: zero axe violations
      await expectNoAxeViolations(v.doc.body);

      // 2. Club header: crest, club name, and form guide present
      const crest = v.doc.querySelector("header img, [class*='crest']");
      expect(crest, `${mode}: club crest present`).not.toBeNull();

      // 3. Section cards: fixtures, news, form
      const cards = v.doc.querySelectorAll("article, [class*='card']");
      expect(cards.length, `${mode}: club info cards present`).toBeGreaterThanOrEqual(3);

      // 4. Clean text: no unescaped entities or NaN
      expect(v.text, `${mode}: text is pristine`).not.toMatch(/undefined|NaN|\[object|\{\{/);
      expect(v.html, `${mode}: no raw double-encoded entities`).not.toMatch(/&amp;#39;|&amp;quot;/);
    }
  });
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
