/**
 * Journey: the bonus page (/bonus) walked through every moment of a gameweek, rendered by the real page, service and
 * view from the shared in-memory season, and checked against answers worked out here from the world's own data.
 *
 * 1. What the page says at every moment: status, labels, legend, card states, the pause, the verdict, refreshing.
 * 2. The bonus is right: the 3-2-1 from BPS with FPL's tie rules, the race and bubble lines, odd feeds, languages.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import { CLIENT_MESSAGES } from "@/lib/domain/i18n/client";
import { clientTrip } from "@/lib/domain/i18n/client/trip";
import { INTL_LOCALE, type Locale } from "@/lib/domain/i18n/locales";
import type { Fixture } from "@/lib/domain/types";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { install, playerName, season, teams, uninstall, type PhaseName, type Routes, type World, type WorldOptions } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

// ------------------------------------------------------------------------------------------------ visiting the page

interface Lang {
  locale: Locale;
  trip: boolean;
}
const EN: Lang = { locale: "en", trip: false };
const catalog = (l: Lang): Messages => (l.trip ? tripMessagesFor(l.locale) : MESSAGES[l.locale]);
/** What client components (the refresh control) read: the I18nProvider's catalog, with the trip strings laid on in the altered view. */
const clientCatalog = (l: Lang) => (l.trip ? clientTrip(CLIENT_MESSAGES[l.locale], l.locale) : CLIENT_MESSAGES[l.locale]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

interface Visit {
  html: string;
  doc: Document;
  text: string;
  model: Awaited<ReturnType<ReturnType<typeof import("@/lib/services/bonus")["createBonusService"]>["load"]>>;
}

/** Fresh modules, the world behind fetch, the request's language, then the real page rendered as the layout would. */
async function visit(world: World, { extra = [], lang = EN, gw, at }: { extra?: Routes; lang?: Lang; gw?: string; at?: string } = {}): Promise<Visit> {
  vi.resetModules();
  uninstall();
  install(world, extra);
  if (at) vi.setSystemTime(new Date(at));
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  const page = (await import("@/app/bonus/page")).default;
  const element: ReactElement = await page({ searchParams: Promise.resolve(gw === undefined ? {} : { gw }) });
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  const html = renderToStaticMarkup(<I18nProvider locale={lang.locale} trip={lang.trip}>{element}</I18nProvider>);
  const { services } = await import("@/lib/container");
  const model = await services.bonus.load(gw);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc, text: norm(doc.body.textContent), model };
}

/** Swap the current gameweek's fixture feed for an edited copy (later routes in `extra` win over the world's). */
const editFixtures = (world: World, edit: (f: Fixture) => Fixture | Fixture[] | null): Routes => [
  [(u) => u.includes(`/fixtures/?event=${world.gw}`), world.fixtures.flatMap((f) => edit(structuredClone(f)) ?? [])],
];
const bpsStat = (h: [number, number][], a: [number, number][]) => ({ identifier: "bps", h: h.map(([element, value]) => ({ element, value })), a: a.map(([element, value]) => ({ element, value })) });
const bonusStat = (h: [number, number][], a: [number, number][]) => ({ ...bpsStat(h, a), identifier: "bonus" });

// ------------------------------------------------------------------------------------------------ the oracle

type Entry = { element: number; value: number; side: "h" | "a" };
type SourceKey = "confirmed" | "provisional" | "projected" | "projectedFt";

/** One stat of a fixture: usable entries only, each player once (the first time they appear). */
function statOf(f: Fixture, id: string): Entry[] {
  const s = f.stats.find((x) => x.identifier === id);
  const seen = new Set<number>();
  const out: Entry[] = [];
  for (const side of ["h", "a"] as const) {
    for (const v of s?.[side] ?? []) {
      if (seen.has(v.element)) continue;
      seen.add(v.element);
      out.push({ element: v.element, value: v.value, side });
    }
  }
  return out;
}

/** FPL's rule: rank = 1 + how many have strictly more BPS; ranks 1, 2, 3 get 3, 2, 1. Ties share, and the next rank is skipped. */
function award(bps: Entry[]): Map<number, number> {
  return new Map(bps.map((p) => {
    const rank = 1 + bps.filter((q) => q.value > p.value).length;
    return [p.element, rank <= 3 ? 4 - rank : 0];
  }));
}

const isOver = (f: Fixture) => f.finished || f.finished_provisional;
/** Which label the card must wear: FPL's own bonus once it is in (confirmed when the match is finished), else projected from BPS. */
function sourceOf(f: Fixture): SourceKey | null {
  if (!f.started) return null;
  if (statOf(f, "bonus").length > 0) return f.finished ? "confirmed" : "provisional";
  if (statOf(f, "bps").length > 0) return isOver(f) ? "projectedFt" : "projected";
  return null;
}
/** Bonus per player: FPL's official figure when it has published one, otherwise the projection from BPS. */
function bonusOf(f: Fixture): Map<number, number> {
  const official = statOf(f, "bonus");
  return official.length ? new Map(official.map((e) => [e.element, e.value])) : award(statOf(f, "bps"));
}
const nameOf = (world: World, id: number) => (world.bootstrap.elements.some((e) => e.id === id) ? playerName(id) : `Player ${id}`);
const clubName = (id: number) => teams.find((t) => t.id === id)!.name;
const clubShort = (id: number) => teams.find((t) => t.id === id)!.short_name;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const byKickoff = (a: Fixture, b: Fixture) => {
  const t = (f: Fixture) => (f.kickoff_time ? Date.parse(f.kickoff_time) : Infinity);
  return t(a) === t(b) ? a.id - b.id : t(a) - t(b);
};

/** BPS highest first; equal BPS keep the feed's order (home list, then away). */
const ranking = (f: Fixture) => statOf(f, "bps").sort((a, b) => b.value - a.value);

/** The rows a side should show: everyone with bonus, topped up to three with the next best BPS, at most five shown. */
function expectedSide(world: World, f: Fixture, side: "h" | "a") {
  const bonus = bonusOf(f);
  const ranked = ranking(f).filter((e) => e.side === side);
  const awarded = ranked.filter((e) => (bonus.get(e.element) ?? 0) > 0);
  const rest = ranked.filter((e) => !((bonus.get(e.element) ?? 0) > 0)).slice(0, Math.max(0, 3 - awarded.length));
  const all = [...awarded, ...rest];
  return {
    lines: all.slice(0, 5).map((e) => ({ name: nameOf(world, e.element), bonus: bonus.get(e.element) ?? 0, bps: e.value })),
    hidden: Math.max(0, all.length - 5),
    hiddenBonus: all.slice(5).reduce((sum, e) => sum + (bonus.get(e.element) ?? 0), 0),
  };
}

/** Every sentence the race paragraph may be: who leads (or the dead heat), then the bonus line when it is close. */
function raceCandidates(world: World, f: Fixture, t: Messages): string[] | null {
  const key = sourceOf(f);
  if (!key) return null;
  const source = key === "projectedFt" ? "projected" : key;
  const ranked = ranking(f);
  const bonus = bonusOf(f);
  const [leader, runner] = ranked;
  if (!leader) return null;
  const firsts = !runner ? [""] : leader.value === runner.value
    ? t.bonus.race.level.map((fn) => fn(nameOf(world, leader.element), nameOf(world, runner.element), leader.value))
    : t.bonus.race[source].map((fn) => fn(nameOf(world, leader.element), leader.value, leader.value - runner.value, nameOf(world, runner.element)));
  const inside = ranked.filter((e) => (bonus.get(e.element) ?? 0) > 0).at(-1);
  const outside = ranked.find((e) => !((bonus.get(e.element) ?? 0) > 0));
  // A bonus line exists only where FPL's tie rule leaves someone out: strictly fewer BPS than the last one in.
  const gap = inside && outside ? inside.value - outside.value : null;
  const seconds = gap !== null && gap > 0 && gap <= 3
    ? (source === "projected" ? t.bonus.race.bubbleOpen : t.bonus.race.bubbleShut).map((fn) => fn(nameOf(world, inside!.element), nameOf(world, outside!.element), gap))
    : [""];
  const out = firsts.flatMap((a) => seconds.map((b) => norm(`${a} ${b}`))).filter(Boolean);
  return out.length ? out : null;
}

// ------------------------------------------------------------------------------------------------ reading the page

interface CardOnPage {
  heading: string;
  /** The two club names in the heading, home then away. */
  clubs: string[];
  clubLinks: string[];
  meta: string;
  badges: { text: string; title: string | null }[];
  muted: string[];
  race: string | null;
  sides: { title: string; lines: { name: string; bonus: number; bps: number }[]; hidden: number; empty: boolean }[];
  events: string;
}
/** Text of an element without the decorative crests (their initials are aria-hidden fallbacks, not words on the page). */
function textWithoutCrests(el: Element | null): string {
  if (!el) return "";
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".crest").forEach((c) => c.remove());
  return norm(copy.textContent);
}
function cardsOf(doc: Document): CardOnPage[] {
  return [...doc.querySelectorAll("article")].map((a) => ({
    heading: textWithoutCrests(a.querySelector("h2")),
    clubs: [...a.querySelectorAll("h2 .titleSide")].map((s) => textWithoutCrests(s)),
    clubLinks: [...a.querySelectorAll("h2 a")].map((x) => x.getAttribute("href") ?? ""),
    meta: norm(a.querySelector("header .meta")?.textContent),
    badges: [...a.querySelectorAll("header .meta .badge")].map((b) => ({ text: norm(b.textContent), title: b.getAttribute("title") })),
    muted: [...a.querySelectorAll(":scope > p.muted")].map((p) => norm(p.textContent)),
    race: a.querySelector("p.race") ? norm(a.querySelector("p.race")!.textContent) : null,
    sides: [...a.querySelectorAll(".side")].map((s) => ({
      title: norm(s.querySelector("h3")?.textContent),
      empty: !!s.querySelector("p.muted"),
      hidden: Number(norm(s.querySelector("p.more")?.textContent).match(/\d+/)?.[0] ?? 0),
      lines: [...s.querySelectorAll("li")].map((li) => {
        const pts = norm(li.querySelector(".pts [aria-hidden]")?.textContent);
        return { name: norm(li.querySelector(".name")?.textContent), bonus: pts.startsWith("+") ? Number(pts.slice(1)) : pts === "–" ? 0 : Number.NaN, bps: Number(norm(li.querySelector(".bps")?.textContent)) };
      }),
    })),
    events: norm(a.querySelector("dl")?.textContent),
  }));
}
const headerMeta = (doc: Document) => doc.querySelector("h1")!.parentElement!.querySelector(".meta")!;
const legendOf = (doc: Document) => [...doc.querySelectorAll(".legend > span")].map((s) => ({ label: norm(s.querySelector(".badge")?.textContent), text: norm(s.textContent) }));

/** The page must never leak a placeholder or a broken number. */
function expectClean(v: Visit, where: string) {
  expect(v.text, `${where}: no undefined/NaN/[object] on the page`).not.toMatch(/undefined|NaN|\[object|\uE000/);
  expect(v.text, `${where}: no negative bonus or BPS gap`).not.toMatch(/-\d+ BPS|−\d+ BPS| -\d+ short/);
}

/** How long the page should wait before refreshing itself: the rule, stated from FPL's facts and the clock. */
function expectedRefresh(world: World, now: number): number | null {
  const ev = world.bootstrap.events.find((e) => e.id === world.gw)!;
  if (Date.parse(ev.deadline_time) > now) return null; // upcoming: nothing can change
  if (ev.finished) return ev.data_checked ? null : 5 * 60_000;
  const MATCH = 135 * 60_000;
  const kicks = world.fixtures.filter((f) => f.kickoff_time).map((f) => ({ k: Date.parse(f.kickoff_time!), over: isOver(f) }));
  const playing = world.fixtures.some((f) => f.started && !isOver(f)) || kicks.some((x) => x.k <= now && !x.over && now < x.k + MATCH);
  if (playing) return 60_000;
  const next = kicks.filter((x) => x.k > now).map((x) => x.k).sort((a, b) => a - b)[0];
  if (next === undefined) return 5 * 60_000;
  return Math.min(15 * 60_000, Math.max(60_000, next - now - 2 * 60_000));
}

/** The week's headline facts for the lede: the highest BPS (first in kick-off order on a tie) and the club with most bonus. */
function summaryOf(world: World, fixtures: Fixture[]) {
  let top: { element: number; bps: number; team: number } | null = null;
  const byClub = new Map<number, number>();
  for (const f of fixtures) {
    const lead = ranking(f)[0];
    if (lead && (!top || lead.value > top.bps)) top = { element: lead.element, bps: lead.value, team: lead.side === "h" ? f.team_h : f.team_a };
    if (!sourceOf(f)) continue;
    const bonus = bonusOf(f);
    for (const e of [...statOf(f, "bonus"), ...statOf(f, "bps")]) {
      const team = e.side === "h" ? f.team_h : f.team_a;
      if (!byClub.has(team)) byClub.set(team, 0);
      void e;
    }
    for (const [element, b] of bonus) {
      if (b <= 0) continue;
      const e = [...statOf(f, "bonus"), ...statOf(f, "bps")].find((x) => x.element === element)!;
      const team = e.side === "h" ? f.team_h : f.team_a;
      byClub.set(team, (byClub.get(team) ?? 0) + b);
    }
  }
  if (!top) return null;
  const [best, bonus] = [...byClub].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [top.team, 0];
  return { player: nameOf(world, top.element), club: clubName(top.team), bps: top.bps, bestClub: clubName(best), bonus };
}

const timeText = (iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions) => `${new Date(iso).toLocaleString(INTL_LOCALE[lang.locale], { ...opts, timeZone: "UTC" })} UTC`;
const DAY_CLOCK: Intl.DateTimeFormatOptions = { weekday: "long", hour: "2-digit", minute: "2-digit" };
const KICKOFF: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

// ------------------------------------------------------------------------------------------------ 1. every moment

describe("the bonus page", () => {
  it("what the page says at every moment: status, labels, legend, card states, pause, verdict, refreshing", async () => {
    const t = MESSAGES.en;
    const b = t.bonus;

    // Pre-season: no gameweek to show, said plainly, and nothing polls.
    {
      const v = await visit(season("preseason"));
      expect(v.model.kind, "preseason: the service says there is no season yet").toBe("no-season");
      expect(v.text, "preseason: the not-started title").toContain(b.notStartedTitle);
      expect(v.text, "preseason: the not-started body").toContain(b.notStartedBody);
      expect(v.doc.querySelectorAll("article").length, "preseason: no fixture cards").toBe(0);
      expect(v.doc.querySelector(`[aria-label="${t.client.live.refresh}"]`), "preseason: no refresh control").toBeNull();
      for (const s of Object.values(b.sources)) expect(v.text, `preseason: no '${s.label}' label`).not.toContain(s.label);
      expectClean(v, "preseason");
    }

    type Moment = { name: string; phase: PhaseName; opts?: WorldOptions; edit?: (w: World) => Routes; gw?: string; at?: string; header: string; lede: "upcoming" | "live" | "paused" | "provisional" | "final" };
    const moments: Moment[] = [
      { name: "upcoming", phase: "upcoming", header: t.status.upcoming, lede: "upcoming" },
      { name: "live-playing", phase: "live-playing", header: t.status.live, lede: "live" },
      { name: "live-between", phase: "live-between", header: b.paused, lede: "paused" },
      { name: "live-between, ten minutes before Monday's kick-off", phase: "live-between", at: "2026-10-12T18:50:00Z", header: b.paused, lede: "paused" },
      { name: "live-between, ninety seconds before kick-off", phase: "live-between", at: "2026-10-12T18:58:30Z", header: b.paused, lede: "paused" },
      { name: "live-over", phase: "live-over", header: t.status.provisional, lede: "provisional" },
      { name: "provisional", phase: "provisional", header: t.status.provisional, lede: "provisional" },
      { name: "final", phase: "final", header: t.status.final, lede: "final" },
      { name: "season-over", phase: "season-over", header: t.status.final, lede: "final" },
      { name: "final, looking back at GW5", phase: "final", gw: "5", header: t.status.final, lede: "final" },
      {
        // FPL's flags vary per match: one finished with bonus confirmed, one at full time with provisional bonus, one at full time before FPL adds any.
        name: "live-over with mixed FPL flags", phase: "live-over", header: t.status.provisional, lede: "provisional",
        edit: (w) => editFixtures(w, (f) => (f.id === 63 ? { ...f, finished: false } : f.id === 64 ? { ...f, finished: false, stats: f.stats.filter((s) => s.identifier !== "bonus") } : f)),
      },
      {
        // A match under way whose BPS feed hasn't arrived: no label for it, so the legend can't explain one.
        name: "live-playing, BPS not in yet", phase: "live-playing", header: t.status.live, lede: "live",
        edit: (w) => editFixtures(w, (f) => (f.id === 62 ? { ...f, stats: [] } : f)),
      },
    ];

    for (const m of moments) {
      const world = season(m.phase, m.opts);
      const extra = m.edit ? m.edit(world) : [];
      const v = await visit(world, { extra, gw: m.gw, at: m.at });
      const where = m.name;
      const gw = m.gw ? Number(m.gw) : world.gw;
      // What the page is showing, as FPL would serve it (the edited feed if there is one, otherwise the world's).
      const served: Fixture[] = (extra.length ? (extra[0][1] as Fixture[]) : world.truth.fixturesFor(gw)).slice().sort(byKickoff);
      const ev = world.bootstrap.events.find((e) => e.id === gw)!;
      const now = Date.parse(m.at ?? world.now.toISOString());
      expect(v.model.kind, `${where}: a season is on`).toBe("ok");
      if (v.model.kind !== "ok") continue;

      // The heading and the status badge.
      expect(norm(v.doc.querySelector("h1")?.textContent), `${where}: the title is the gameweek`).toBe(t.common.gameweek(gw));
      const meta = headerMeta(v.doc);
      expect(norm(meta.querySelector(".badge")?.textContent), `${where}: the status badge`).toBe(m.header);
      if (m.header !== b.paused) expect(norm(meta.textContent), `${where}: 'Between matches' only on a quiet live day`).not.toContain(b.paused);
      const finished = served.filter(isOver).length;
      expect(norm(meta.textContent), `${where}: matches finished`).toContain(b.finishedOf(finished, served.length));

      // The pager: earlier gameweeks link back, nothing beyond the latest.
      const pagerLinks = [...v.doc.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));
      if (gw > 1) expect(pagerLinks, `${where}: a link to the previous gameweek`).toContain(`/bonus?gw=${gw - 1}`);
      const latest = world.gw;
      if (gw < latest) expect(pagerLinks, `${where}: a link to the next gameweek`).toContain(`/bonus?gw=${gw + 1}`);
      else expect(pagerLinks, `${where}: no link past the latest gameweek`).not.toContain(`/bonus?gw=${gw + 1}`);

      // Each card: in kick-off order, with exactly the state and label its fixture has.
      const cards = cardsOf(v.doc);
      expect(cards.length, `${where}: one card per fixture`).toBe(served.length);
      const labelsOnScreen: SourceKey[] = [];
      served.forEach((f, i) => {
        const c = cards[i];
        const here = `${where}, card ${i + 1} (${clubShort(f.team_h)} v ${clubShort(f.team_a)})`;
        const state = world.truth.fixtureState(f);
        expect(c.clubs, `${here}: home club first, away club last`).toEqual([clubShort(f.team_h), clubShort(f.team_a)]);
        expect(c.heading.startsWith(clubShort(f.team_h)) && c.heading.endsWith(clubShort(f.team_a)), `${here}: the heading reads home … away`).toBe(true);
        expect(c.clubLinks, `${here}: both clubs link to their pages`).toEqual([`/club/${slug(clubName(f.team_h))}`, `/club/${slug(clubName(f.team_a))}`]);
        if (state === "upcoming") {
          expect(c.heading, `${here}: no score before kick-off`).toContain(b.versus(clubName(f.team_h), clubName(f.team_a)));
          expect(c.meta, `${here}: kick-off time`).toContain(`${b.kickoff} ${f.kickoff_time ? timeText(f.kickoff_time, EN, KICKOFF) : t.client.feed.tbc}`);
          expect(c.badges, `${here}: no FT, Live or bonus label before kick-off`).toEqual([]);
          expect(b.upcomingNote.map((fn) => fn(clubName(f.team_h), clubName(f.team_a))), `${here}: says bonus starts at kick-off`).toContain(c.muted[0]);
          expect(c.sides, `${here}: no bonus lists before kick-off`).toEqual([]);
          return;
        }
        expect(c.heading, `${here}: the score`).toContain(`${f.team_h_score}–${f.team_a_score}`);
        expect(c.heading, `${here}: the score for screen readers`).toContain(b.scoreSr(clubName(f.team_h), f.team_h_score!, clubName(f.team_a), f.team_a_score!));
        const stateBadge = state === "playing" ? `${b.state.live} ${f.minutes}′` : b.state.ft;
        expect(c.badges[0]?.text, `${here}: ${state === "playing" ? "live with the minute" : "full time"}`).toBe(stateBadge);
        expect(c.meta, `${here}: no kick-off line once started`).not.toContain(b.kickoff);
        const key = sourceOf(f);
        if (key) {
          labelsOnScreen.push(key);
          expect(c.badges[1], `${here}: wears the '${key}' label with its explanation`).toEqual({ text: b.sources[key].label, title: b.sources[key].help });
          expect(c.badges.length, `${here}: just the state and the label`).toBe(2);
        } else {
          expect(c.badges.length, `${here}: no bonus label without bonus data`).toBe(1);
          expect(c.muted, `${here}: says there is no bonus data yet`).toEqual([b.noData]);
        }
        if (state === "playing") expect(key === "confirmed" || key === "provisional", `${here}: bonus is only ever projected while the ball is rolling`).toBe(false);
        if (state === "over" && key) expect(key, `${here}: a full-time card never says 'projected' as if it could still move`).not.toBe("projected");
      });
      // The legend explains exactly the labels on screen, in the order they first appear.
      const legendKeys = [...new Set(labelsOnScreen)];
      const legend = legendOf(v.doc);
      expect(legend.map((l) => l.label), `${where}: the legend lists only labels on screen, in order`).toEqual(legendKeys.map((k) => b.sources[k].label));
      legendKeys.forEach((k, i) => expect(legend[i].text, `${where}: legend explains '${k}'`).toBe(`${b.sources[k].label} ${b.sources[k].help}`));
      for (const k of ["confirmed", "provisional", "projected"] as const) {
        const onScreen = labelsOnScreen.some((x) => x === k || (k === "projected" && x === "projectedFt"));
        // Card and legend badges only: the page header's status badge can share the word ("Provisional") as a gameweek status.
        const sourceBadges = [...v.doc.querySelectorAll("article .badge, .legend .badge")].map((x) => norm(x.textContent));
        if (!onScreen) expect(sourceBadges, `${where}: no '${b.sources[k].label}' bonus label anywhere`).not.toContain(b.sources[k].label);
      }

      // The opening line, by moment: what's coming, who leads, the pause until the next kick-off, or the verdict.
      const lede = norm(v.doc.querySelector("p.lede")?.textContent);
      const name = t.common.gameweek(gw);
      const sum = summaryOf(world, served);
      if (m.lede === "upcoming") expect(b.lede.upcoming.map((fn) => fn(name, served.length)), `${where}: upcoming lede`).toContain(lede);
      else if (m.lede === "paused") {
        const next = served.filter((f) => f.kickoff_time && Date.parse(f.kickoff_time) > now).map((f) => f.kickoff_time!).sort()[0];
        expect(next, `${where}: there is a kick-off to come`).toBeTruthy();
        expect(b.lede.paused.map((fn) => norm(fn(name, timeText(next, EN, DAY_CLOCK)))), `${where}: paused until the next kick-off, in the reader's time`).toContain(lede);
        expect(v.doc.querySelector(`p.lede time[datetime="${new Date(next).toISOString()}"]`), `${where}: the next kick-off is a <time>`).not.toBeNull();
      } else {
        expect(sum, `${where}: there is a week to sum up`).not.toBeNull();
        expect(b.lede[m.lede].map((fn) => fn(name, sum!.player, sum!.club, sum!.bps, sum!.bestClub, sum!.bonus)), `${where}: ${m.lede} lede with the week's top BPS and best club`).toContain(lede);
      }
      if (m.lede === "final") expect(ev.data_checked, `${where}: the final verdict only once FPL has checked the data`).toBe(true);
      else expect(lede, `${where}: no final verdict before data_checked`).not.toMatch(/Final verdict|checked and final|Confirmed: .*settled/);

      // Refreshing: a minute while a match is on, waking before the next kick-off in a gap, five minutes while FPL checks, never once final.
      const refresh = expectedRefresh({ ...world, fixtures: served, gw }, now);
      expect(v.model.refreshMs, `${where}: refresh interval`).toBe(refresh);
      expect(!!v.doc.querySelector(`[aria-label="${t.client.live.refresh}"]`), `${where}: refresh control shown iff the page can change`).toBe(refresh !== null);
      expectClean(v, where);
    }

    // The specific intervals the rule above produces, spelled out so a change in the rule is a visible failure too.
    const intervals: [PhaseName, string | undefined, number | null][] = [
      ["upcoming", undefined, null], ["live-playing", undefined, 60_000], ["live-between", undefined, 15 * 60_000], ["live-between", "2026-10-12T18:50:00Z", 8 * 60_000],
      ["live-between", "2026-10-12T18:58:30Z", 60_000], ["live-over", undefined, 5 * 60_000], ["provisional", undefined, 5 * 60_000], ["final", undefined, null], ["season-over", undefined, null],
    ];
    for (const [phase, at, ms] of intervals) {
      const v = await visit(season(phase), { at });
      expect(v.model.kind === "ok" && v.model.refreshMs, `${phase}${at ? ` at ${at}` : ""}: refreshMs`).toBe(ms);
    }
  });

  // ------------------------------------------------------------------------------------------------ 2. the numbers

  it("the bonus is right: 3-2-1 from BPS with FPL's tie rules, race lines, odd feeds, and the same in every language", async () => {
    /** Every started card on the page agrees with the oracle: who is listed, their bonus and BPS, what's hidden, and the race line. */
    const checkCards = (world: World, v: Visit, served: Fixture[], where: string, t: Messages = MESSAGES.en) => {
      const cards = cardsOf(v.doc);
      expect(cards.length, `${where}: one card per fixture`).toBe(served.length);
      served.forEach((f, i) => {
        const here = `${where}, card ${i + 1} (fixture ${f.id})`;
        const c = cards[i];
        if (!f.started || !sourceOf(f)) {
          expect(c.sides, `${here}: no bonus lists without BPS`).toEqual([]);
          expect(c.race, `${here}: no race line without BPS`).toBeNull();
          return;
        }
        (["h", "a"] as const).forEach((side, s) => {
          const want = expectedSide(world, f, side);
          const got = c.sides[s];
          expect(got.title, `${here}: side ${s + 1} is ${side === "h" ? "home" : "away"}`).toBe(clubShort(side === "h" ? f.team_h : f.team_a));
          expect(got.lines, `${here}: ${side} players, bonus and BPS`).toEqual(want.lines);
          expect(got.hidden, `${here}: ${side} players not shown`).toBe(want.hidden);
          for (const line of got.lines) expect(line.bonus, `${here}: ${line.name}'s bonus is 0-3`).toBeGreaterThanOrEqual(0);
        });
        // The bonus adds up to what FPL's rule hands out across the match (ties share, the next place is skipped): every point
        // is either on a row or belongs to a player counted in "+N more".
        const shown = c.sides.flatMap((s) => s.lines).reduce((sum, l) => sum + l.bonus, 0);
        const inMore = expectedSide(world, f, "h").hiddenBonus + expectedSide(world, f, "a").hiddenBonus;
        const total = [...bonusOf(f).values()].reduce((a, x) => a + x, 0);
        expect(shown + inMore, `${here}: every bonus point awarded is on the card or in '+N more'`).toBe(total);
        const race = raceCandidates(world, f, t);
        if (race) expect(race, `${here}: the race line names the leader, the margin and (only if close) the bonus line`).toContain(c.race);
        else expect(c.race, `${here}: no race line`).toBeNull();
        expect(c.race ?? "", `${here}: never '0 BPS short' or a negative gap`).not.toMatch(/\b0 BPS (short|behind)|by 0 BPS|-\d/);
      });
    };

    // a) Every phase of the real world: whatever FPL has published (official bonus, or BPS while a match is on) is what the page shows.
    for (const phase of ["live-playing", "live-between", "live-over", "provisional", "final", "season-over"] as const) {
      const world = season(phase);
      const v = await visit(world);
      checkCards(world, v, world.fixtures.slice().sort(byKickoff), phase);
      // While a match is on, its bonus is the projection from live BPS with the tie rules, never the world's (unset) official one.
      for (const f of world.fixtures.filter((x) => world.truth.fixtureState(x) === "playing")) {
        expect(statOf(f, "bonus").length, `${phase}: fixture ${f.id} has no official bonus while playing`).toBe(0);
        expect(sourceOf(f), `${phase}: fixture ${f.id} is projected`).toBe("projected");
      }
      expectClean(v, phase);
    }

    // b) FPL's confirmed bonus is shown as FPL published it, even where its feed disagrees with the BPS order (GW6 fixture 61: a
    //    tie on 19 BPS for third where FPL's data gives the point to one of them). The page must not invent a "0 BPS short" bubble.
    {
      const world = season("final");
      const v = await visit(world);
      const f61 = world.fixtures.find((f) => f.id === 61)!;
      const card = cardsOf(v.doc)[0];
      const ars = card.sides[0].lines;
      expect(ars.find((l) => l.name === "ARS M1"), "fixture 61: ARS M1 shown with FPL's official 1").toEqual({ name: "ARS M1", bonus: bonusOf(f61).get(14) ?? 0, bps: 19 });
      expect(card.race, "fixture 61: no bubble sentence for a tie FPL's own data decided").not.toMatch(/CHE M1.*(short|missed|squeezed)|squeezed|missed the bonus by 0/);
    }

    // c) Ties, injected into the match being played (GW6 fixture 62, NEW v MCI): FPL's rules, spelled out by hand as well as by the oracle.
    const NEW = (s: number) => 40 + s;
    const MCI = (s: number) => 20 + s;
    const ties: { name: string; h: [number, number][]; a: [number, number][]; want: Record<number, number>; offCard?: number[] }[] = [
      { name: "tie for first: both get 3, the next gets 1", h: [[NEW(6), 30], [NEW(4), 30]], a: [[MCI(6), 20], [MCI(4), 10]], want: { [NEW(6)]: 3, [NEW(4)]: 3, [MCI(6)]: 1 } },
      { name: "three-way tie for first: three 3s, nobody else", h: [[NEW(6), 25], [NEW(4), 25]], a: [[MCI(6), 25], [MCI(4), 20]], want: { [NEW(6)]: 3, [NEW(4)]: 3, [MCI(6)]: 3 } },
      { name: "tie for second: 3, then two 2s, then nobody", h: [[NEW(6), 40], [NEW(4), 30]], a: [[MCI(6), 30], [MCI(4), 10]], want: { [NEW(6)]: 3, [NEW(4)]: 2, [MCI(6)]: 2 } },
      { name: "tie for third: 3, 2, then two 1s", h: [[NEW(6), 40], [NEW(4), 20], [NEW(3), 5]], a: [[MCI(6), 30], [MCI(4), 20]], want: { [NEW(6)]: 3, [MCI(6)]: 2, [NEW(4)]: 1, [MCI(4)]: 1 } },
      { name: "a player listed twice counts once (the first entry)", h: [[NEW(6), 30], [NEW(6), 90], [NEW(4), 20]], a: [[MCI(6), 25], [NEW(6), 99]], want: { [NEW(6)]: 3, [MCI(6)]: 2, [NEW(4)]: 1 } },
      { name: "an id FPL's player list doesn't have is still listed, by number", h: [[999, 40], [NEW(6), 30]], a: [[MCI(6), 20], [MCI(4), 2]], want: { 999: 3, [NEW(6)]: 2, [MCI(6)]: 1 } },
      { name: "everyone level early on: all share 3, at most five rows a side", h: [1, 2, 3, 4, 5, 6].map((s) => [NEW(s), 3] as [number, number]), a: [[MCI(6), 3], [MCI(4), 1]], want: { [NEW(1)]: 3, [NEW(2)]: 3, [NEW(3)]: 3, [NEW(4)]: 3, [NEW(5)]: 3, [NEW(6)]: 3, [MCI(6)]: 3 }, offCard: [NEW(6)] },
    ];
    for (const tie of ties) {
      const world = season("live-playing");
      const extra = editFixtures(world, (f) => (f.id === 62 ? { ...f, stats: [f.stats.find((s) => s.identifier === "goals_scored")!, bpsStat(tie.h, tie.a)] } : f));
      const served = (extra[0][1] as Fixture[]).slice().sort(byKickoff);
      const f62 = served.find((f) => f.id === 62)!;
      expect(Object.fromEntries([...bonusOf(f62)].filter(([, x]) => x > 0)), `${tie.name}: the oracle agrees with the rule written out`).toEqual(tie.want);
      const v = await visit(world, { extra });
      checkCards(world, v, served, tie.name);
      const card = cardsOf(v.doc)[1];
      const shown = Object.fromEntries(card.sides.flatMap((s) => s.lines).filter((l) => l.bonus > 0).map((l) => [l.name, l.bonus]));
      // Everyone with bonus has a row, except past five a side: equal BPS keep the feed's order, so the last listed goes to "+N more".
      const onCard = Object.entries(tie.want).filter(([id]) => !(tie.offCard ?? []).includes(Number(id)));
      expect(shown, `${tie.name}: the page's bonus`).toEqual(Object.fromEntries(onCard.map(([id, x]) => [nameOf(world, Number(id)), x])));
      expect(card.sides.reduce((n, s) => n + s.hidden, 0), `${tie.name}: players counted in '+N more'`).toBe((tie.offCard ?? []).length);
      expect(card.badges[1]?.text, `${tie.name}: still projected`).toBe(MESSAGES.en.bonus.sources.projected.label);
      const names = card.sides.flatMap((s) => s.lines.map((l) => l.name));
      expect(new Set(names).size, `${tie.name}: nobody listed twice`).toBe(names.length);
      expectClean(v, tie.name);
    }
    {
      // Six home players level: five shown and one counted as "+1 more".
      const world = season("live-playing");
      const extra = editFixtures(world, (f) => (f.id === 62 ? { ...f, stats: [bpsStat(ties[6].h, ties[6].a)] } : f));
      const v = await visit(world, { extra });
      const home = cardsOf(v.doc)[1].sides[0];
      expect(home.lines.length, "level field: five rows shown").toBe(5);
      expect(home.hidden, "level field: one more counted").toBe(1);
      expect(v.text, "level field: '+1 more' line").toContain(MESSAGES.en.bonus.more(1));
    }

    // d) Provisional bonus that FPL published with a tie: shown as published, labelled provisional.
    {
      const world = season("live-over");
      const extra = editFixtures(world, (f) => (f.id === 64 ? { ...f, finished: false, stats: [bpsStat([[61, 30], [62, 30]], [[71, 12], [72, 4]]), bonusStat([[61, 3], [62, 3]], [[71, 1]])] } : f));
      const served = (extra[0][1] as Fixture[]).slice().sort(byKickoff);
      const v = await visit(world, { extra });
      checkCards(world, v, served, "provisional tie");
      const card = cardsOf(v.doc)[3];
      expect(card.badges.map((x) => x.text), "provisional tie: FT and Provisional").toEqual([MESSAGES.en.bonus.state.ft, MESSAGES.en.bonus.sources.provisional.label]);
      expect(card.sides[0].lines.slice(0, 2), "provisional tie: both TOT players on 3").toEqual([{ name: "TOT GK", bonus: 3, bps: 30 }, { name: "TOT D1", bonus: 3, bps: 30 }]);
      expect(MESSAGES.en.bonus.race.level.map((fn) => fn("TOT GK", "TOT D1", 30)), "provisional tie: the dead heat is named").toContain(card.race);
    }

    // e) Players who didn't play have no BPS and no place on the card; their club's bonus goes to those who did.
    {
      const world = season("live-playing", { zeroMinutes: [16, 46] });
      const v = await visit(world);
      checkCards(world, v, world.fixtures.slice().sort(byKickoff), "zero minutes");
      for (const id of [16, 46]) {
        const names = cardsOf(v.doc).flatMap((c) => c.sides.flatMap((s) => s.lines.map((l) => l.name)));
        expect(names, `zero minutes: ${playerName(id)} isn't listed`).not.toContain(playerName(id));
        expect(cardsOf(v.doc).map((c) => c.events).join(" "), `zero minutes: ${playerName(id)} has no goals`).not.toContain(playerName(id));
      }
    }

    // f) A postponed match (no kick-off time): last on the page, "TBC", no bonus, and counted in the total but not as finished.
    {
      const world = season("live-playing");
      const postponed: Fixture = { ...world.fixtures[0], id: 65, team_h: 1, team_a: 4, kickoff_time: null, started: false, finished: false, finished_provisional: false, minutes: 0, team_h_score: null, team_a_score: null, stats: [] };
      const extra = editFixtures(world, (f) => (f.id === 61 ? [f, postponed] : f));
      const served = (extra[0][1] as Fixture[]).slice().sort(byKickoff);
      const v = await visit(world, { extra });
      checkCards(world, v, served, "postponed");
      const cards = cardsOf(v.doc);
      expect(cards.length, "postponed: five cards").toBe(5);
      expect(cards[4].clubs, "postponed: the undated match is last").toEqual(["ARS", "NEW"]);
      expect(cards[4].meta, "postponed: kick-off TBC").toBe(`${MESSAGES.en.bonus.kickoff} ${MESSAGES.en.client.feed.tbc}`);
      expect(norm(headerMeta(v.doc).textContent), "postponed: 1 of 5 finished").toContain(MESSAGES.en.bonus.finishedOf(1, 5));
      expect(v.model.kind === "ok" && v.model.refreshMs, "postponed: still a minute while a match is on").toBe(60_000);
    }

    // g) Languages and the altered view: the same players, bonus and BPS everywhere, labels from each catalog, no English left behind.
    {
      const world = season("live-playing");
      const extra = editFixtures(world, (f) => (f.id === 62 ? { ...f, stats: [f.stats.find((s) => s.identifier === "goals_scored")!, bpsStat(ties[0].h, ties[0].a)] } : f));
      const served = (extra[0][1] as Fixture[]).slice().sort(byKickoff);
      const english = await visit(world, { extra });
      const reference = cardsOf(english.doc).map((c) => c.sides);
      const allow = [...teams.flatMap((x) => [x.name, x.short_name]), /^[A-Z]{3} (GK|D1|D2|M1|M2|F1)( ×\d)?$/, "The Lobster League"];
      for (const lang of [{ locale: "es", trip: false }, { locale: "fr", trip: false }, { locale: "en", trip: true }, { locale: "es", trip: true }, { locale: "fr", trip: true }] as Lang[]) {
        const where = `${lang.locale}${lang.trip ? " + blotter" : ""}`;
        const t = catalog(lang);
        const v = await visit(world, { extra, lang });
        const cards = cardsOf(v.doc);
        expect(cards.map((c) => c.sides), `${where}: the same players, bonus and BPS as English`).toEqual(reference);
        expect(cards.map((c) => c.badges[1]?.text ?? null), `${where}: the labels from this catalog`).toEqual(served.map((f) => (sourceOf(f) ? t.bonus.sources[sourceOf(f)!].label : null)));
        expect(norm(headerMeta(v.doc).querySelector(".badge")?.textContent), `${where}: live badge`).toBe(t.status.live);
        expect(legendOf(v.doc).map((l) => l.label), `${where}: legend`).toEqual([t.bonus.sources.confirmed.label, t.bonus.sources.projected.label]);
        served.forEach((f, i) => {
          const race = raceCandidates(world, f, t);
          if (race) expect(race, `${where}: race line for fixture ${f.id} from this catalog`).toContain(cards[i].race);
        });
        expect(!!v.doc.querySelector(`[aria-label="${clientCatalog(lang).live.refresh}"]`), `${where}: refresh control in this language`).toBe(true);
        if (lang.locale !== "en") {
          const base = lang.trip ? await visit(world, { extra, lang: { locale: "en", trip: true } }) : english;
          expect(englishLeaks(base.html, v.html, lang.locale as "es" | "fr", { allow }), `${where}: no English left behind`).toEqual([]);
          expect(v.text, `${where}: actually translated`).not.toBe(base.text);
        }
        expectClean(v, where);
      }
    }
  });
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
