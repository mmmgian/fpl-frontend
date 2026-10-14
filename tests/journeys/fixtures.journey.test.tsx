/**
 * Journey: the fixtures page (/fixtures) at every moment of the season, rendered by the real page, service and views
 * from the shared in-memory season, and checked against answers worked out here from the world's own schedule.
 *
 * 1. What the page shows at every moment: the feed (gameweeks, days, scores, states, flags, links, "Today" in the
 *    reader's own time zone) and the grid's window, tabs and pager, including doubles, blanks and postponements.
 * 2. The numbers are right: every difficulty, average, rank and sentence in the grid recomputed from the schedule,
 *    for every window and start, odd addresses, and the same figures in every language.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES, tripMessagesFor, type Messages } from "@/lib/domain/i18n";
import { CLIENT_MESSAGES } from "@/lib/domain/i18n/client";
import { clientTrip } from "@/lib/domain/i18n/client/trip";
import { INTL_LOCALE, type Locale } from "@/lib/domain/i18n/locales";
import type { FplEvent, ScheduledFixture } from "@/lib/domain/types";
import { englishLeaks } from "../i18nLeaks";
import { testLanguage } from "../language";
import { install, season, teams, uninstall, type PhaseName, type Routes, type World } from "./world";

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

interface Visit {
  html: string;
  doc: Document;
  text: string;
}
type Params = { gw?: string | string[]; n?: string | string[] };

/** Fresh modules, the world behind fetch, the request's language, then the real page as the layout would render it. */
async function element(world: World, params: Params, extra: Routes, lang: Lang): Promise<ReactElement> {
  vi.resetModules();
  uninstall();
  install(world, extra);
  testLanguage.cookie = lang.locale;
  testLanguage.trip = lang.trip ? "1" : undefined;
  const page = (await import("@/app/fixtures/page")).default;
  const el: ReactElement = await page({ searchParams: Promise.resolve(params) });
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  return <I18nProvider locale={lang.locale} trip={lang.trip}>{el}</I18nProvider>;
}
/** The server's first paint (what arrives before any script runs). */
async function visit(world: World, { params = {}, extra = [], lang = EN }: { params?: Params; extra?: Routes; lang?: Lang } = {}): Promise<Visit> {
  const html = renderToStaticMarkup(await element(world, params, extra, lang));
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc, text: norm(doc.body.textContent) };
}
/** The page after hydration in a browser whose clock is set to `timeZone` (the feed regroups days and marks today). */
async function hydrate(world: World, timeZone: string, { params = {}, extra = [], lang = EN }: { params?: Params; extra?: Routes; lang?: Lang } = {}) {
  const was = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    cleanup(); // one page at a time: the previous render would otherwise still be in the document
    const { container } = render(await element(world, params, extra, lang));
    return { doc: container, root: container, text: norm(container.textContent) };
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

/** Swap FPL's season fixture list for an edited copy. */
const editSchedule = (world: World, edit: (all: ScheduledFixture[]) => ScheduledFixture[]): Routes => [[(u) => u.endsWith("/api/fixtures/"), edit(structuredClone(world.schedule))]];
const servedSchedule = (world: World, extra: Routes): ScheduledFixture[] => (extra.length ? (extra[0][1] as ScheduledFixture[]) : world.schedule);

// ------------------------------------------------------------------------------------------------ the oracle

const club = (id: number) => teams.find((t) => t.id === id)!;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const kick = (f: { kickoff_time: string | null }) => (f.kickoff_time ? Date.parse(f.kickoff_time) : Infinity);
const byKickoff = (a: ScheduledFixture, b: ScheduledFixture) => (kick(a) === kick(b) ? a.id - b.id : kick(a) - kick(b));
const rating = (d: unknown) => (typeof d === "number" && d >= 1 && d <= 5 ? d : 3);

/** The first deadline still ahead, if any: the gameweek being planned for. */
function nextDeadline(events: FplEvent[], now: number) {
  return events.filter((e) => Date.parse(e.deadline_time) > now).sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0] ?? null;
}
/** Where the grid opens: the next deadline's gameweek; with none left, the current one (or the one after, if it is over). */
function defaultStart(events: FplEvent[], now: number): number {
  const next = nextDeadline(events, now);
  if (next) return next.id;
  const i = events.findIndex((e) => e.is_current);
  if (i !== -1) return events[i].finished ? (events[i + 1]?.id ?? events[i].id) : events[i].id;
  return (events.find((e) => !e.finished) ?? events.at(-1)!).id;
}

interface OracleRow {
  team: number;
  cells: { gw: number; matches: { opp: number; home: boolean; difficulty: number }[] }[];
  score: number;
  average: number;
}
/**
 * The difficulty grid from first principles: each club's matches per gameweek; a double counts as the mean of its two,
 * a blank as 5, a gameweek nobody is scheduled in as nothing. Easiest (lowest total) first, then by short name.
 */
function grid(events: FplEvent[], schedule: ScheduledFixture[], start: number, n: number) {
  const from = events.findIndex((e) => e.id === start);
  const gws = events.slice(from, from + n).map((e) => e.id);
  const scheduled = gws.filter((g) => schedule.some((f) => f.event === g));
  const rows: OracleRow[] = teams.map((t) => {
    const cells = gws.map((gw) => ({
      gw,
      matches: schedule
        .filter((f) => f.event === gw && (f.team_h === t.id || f.team_a === t.id))
        .map((f) => (f.team_h === t.id ? { opp: f.team_a, home: true, difficulty: rating(f.team_h_difficulty) } : { opp: f.team_h, home: false, difficulty: rating(f.team_a_difficulty) })),
    }));
    const weekly = cells.filter((c) => scheduled.includes(c.gw)).map((c) => (c.matches.length ? c.matches.reduce((s, m) => s + m.difficulty, 0) / c.matches.length : 5));
    const score = weekly.reduce((a, b) => a + b, 0);
    return { team: t.id, cells, score, average: weekly.length ? score / weekly.length : 3 };
  });
  rows.sort((a, b) => a.score - b.score || club(a.team).short_name.localeCompare(club(b.team).short_name));
  return { gws, rows, scheduled };
}

/** The facts the intro may mention, worked out from the grid: best and worst run, the biggest swing, the first double and blank. */
function highlights({ gws, rows, scheduled }: ReturnType<typeof grid>) {
  const weekly = (c: OracleRow["cells"][number]) => (c.matches.length ? c.matches.reduce((s, m) => s + m.difficulty, 0) / c.matches.length : 5);
  const split = Math.floor(gws.length / 2);
  const half = (r: OracleRow, a: number, b: number) => {
    const cs = r.cells.slice(a, b).filter((c) => scheduled.includes(c.gw));
    return cs.length ? cs.reduce((s, c) => s + weekly(c), 0) / cs.length : null;
  };
  let swing: { team: number; before: number; after: number; from: number } | null = null;
  for (const r of split > 0 ? rows : []) {
    const before = half(r, 0, split);
    const after = half(r, split, gws.length);
    if (before !== null && after !== null && before - after >= 1 && (!swing || before - after > swing.before - swing.after)) swing = { team: r.team, before, after, from: gws[split] };
  }
  const first = (pick: (c: OracleRow["cells"][number]) => boolean) => {
    for (let i = 0; i < gws.length; i++) {
      const who = rows.filter((r) => pick(r.cells[i])).map((r) => r.team);
      if (who.length > 0 && who.length < rows.length) return { gw: gws[i], teams: who };
    }
    return null;
  };
  return { from: gws[0], to: gws.at(-1)!, easiest: rows[0], toughest: rows.at(-1)!, swing, double: first((c) => c.matches.length >= 2), blank: first((c) => c.matches.length === 0) };
}

const oneDecimal = (n: number, l: Lang) => (Math.round((n + Number.EPSILON) * 10) / 10).toLocaleString(INTL_LOCALE[l.locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Every intro the page may open with: the deadline (or the season's end), then the double, the blank, and two different runs. */
function ledes(events: FplEvent[], schedule: ScheduledFixture[], now: number, hl: ReturnType<typeof highlights> | null, l: Lang): string[] {
  const f = catalog(l).fixtures;
  const list = (ids: number[]) => new Intl.ListFormat(INTL_LOCALE[l.locale], { type: "conjunction" }).format(ids.map((id) => club(id).name));
  const next = nextDeadline(events, now);
  const opening = next
    ? f.deadline.map((fn) => fn(next.id, f.until(Math.floor((Date.parse(next.deadline_time) - now) / 3_600_000)), schedule.filter((x) => x.event === next.id).length))
    : [f.seasonOver];
  if (!hl) return opening;
  const d = hl.double ? f.double.map((fn) => fn(hl.double!.gw, list(hl.double!.teams))) : [""];
  const b = hl.blank ? f.blank.map((fn) => fn(hl.blank!.gw, list(hl.blank!.teams))) : [""];
  const runs: string[][] = [
    f.easiest.map((fn) => fn(club(hl.easiest.team).name, oneDecimal(hl.easiest.average, l), hl.from, hl.to)),
    f.toughest.map((fn) => fn(club(hl.toughest.team).name, oneDecimal(hl.toughest.average, l), hl.from, hl.to)),
    ...(hl.swing ? [f.swing.map((fn) => fn(club(hl.swing!.team).name, oneDecimal(hl.swing!.before, l), oneDecimal(hl.swing!.after, l), hl.swing!.from))] : []),
  ];
  const out: string[] = [];
  for (const o of opening) for (const dd of d) for (const bb of b)
    runs.forEach((r1, i) => { for (const a of r1) for (const c of runs[(i + 1) % runs.length]) out.push(norm([o, dd, bb, a, c].join(" "))); });
  return out;
}

/** The feed's gameweeks, as FPL's schedule and calendar say they are. */
function feedOf(events: FplEvent[], schedule: ScheduledFixture[]) {
  const gws = [...new Set(schedule.map((f) => f.event).filter((g): g is number => g !== null))].sort((a, b) => a - b);
  const out = gws.map((gw) => {
    const ev = events.find((e) => e.id === gw);
    const matches = schedule.filter((f) => f.event === gw).sort(byKickoff);
    const plays = new Map<number, number>();
    for (const m of matches) for (const t of [m.team_h, m.team_a]) plays.set(t, (plays.get(t) ?? 0) + 1);
    return {
      gw: gw as number | null, matches, deadline: ev?.deadline_time ?? null,
      status: ev?.finished ? "finished" : ev?.is_current ? "live" : "upcoming",
      doubles: [...plays].filter(([, k]) => k >= 2).map(([t]) => t).sort((a, b) => a - b),
      blanks: teams.filter((t) => !plays.has(t.id)).map((t) => t.id),
    };
  });
  const loose = schedule.filter((f) => f.event === null).sort(byKickoff);
  if (loose.length) out.push({ gw: null, matches: loose, deadline: null, status: "upcoming", doubles: [], blanks: [] });
  return out;
}
const dateIn = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayHeading = (date: string, l: Lang) => new Intl.DateTimeFormat(INTL_LOCALE[l.locale], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const clock = (iso: string, l: Lang, timeZone?: string) => new Date(iso).toLocaleString(INTL_LOCALE[l.locale], { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
const KICKOFF: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" };
const utc = (iso: string, l: Lang, opts: Intl.DateTimeFormatOptions = KICKOFF) => `${new Date(iso).toLocaleString(INTL_LOCALE[l.locale], opts)} UTC`;

// ------------------------------------------------------------------------------------------------ reading the page

function feedOnPage(root: ParentNode) {
  return [...root.querySelectorAll("section[id^='gw-']")].map((s) => ({
    id: s.id,
    title: norm(s.querySelector("h2")?.textContent),
    badge: norm(s.querySelector("header .badge")?.textContent) || null,
    bonusLink: s.querySelector("header a")?.getAttribute("href") ?? null,
    deadline: norm(s.querySelector("header .deadline")?.textContent) || null,
    flags: [...s.querySelectorAll(".flags > span")].map((x) => norm(x.textContent)).join(" ") || null,
    days: [...s.querySelectorAll(".day")].map((d) => ({
      heading: norm(d.querySelector("h3 time")?.textContent),
      datetime: d.querySelector("h3 time")?.getAttribute("datetime") ?? null,
      today: norm(d.querySelector("h3 .badge")?.textContent) || null,
      matches: [...d.querySelectorAll("li")].map((li) => {
        const sides = [...li.querySelectorAll(":scope > .side")];
        const middle = li.querySelector(":scope > .middle");
        return {
          home: seen(sides[0]?.querySelector(".short")),
          away: seen(sides[1]?.querySelector(".short")),
          clubLinks: sides.map((x) => x.getAttribute("href")),
          chips: sides.map((x) => {
            const c = x.querySelector(".chip");
            return c ? { band: Number(c.className.match(/band(\d)/)?.[1]), text: seen(c), sr: srOf(c) } : null;
          }),
          score: seen(middle?.querySelector(".score")) || null,
          state: seen(middle?.querySelector(".state, .pending")) || null,
          time: seen(middle?.querySelector(".time")) || null,
          scoreLink: middle?.tagName === "A" ? middle.getAttribute("href") : null,
          scoreSr: srOf(middle),
        };
      }),
    })),
  }));
}

function gridOnPage(doc: Document) {
  return {
    columns: [...doc.querySelectorAll("thead th.gw")].map((th) => ({ gw: norm(th.querySelector(".gwNumber")?.textContent), date: norm(th.querySelector(".gwDate")?.textContent) })),
    rows: [...doc.querySelectorAll("tbody tr")].map((tr) => ({
      rank: norm(tr.querySelector(".rank")?.textContent),
      short: norm(tr.querySelector(".teamName")?.textContent),
      avg: norm(tr.querySelector(".avg")?.textContent),
      sr: srOf(tr.querySelector("th")),
      link: tr.querySelector("th a")?.getAttribute("href") ?? null,
      cells: [...tr.querySelectorAll("td")].map((td) =>
        td.querySelector(".blank")
          ? { blank: seen(td), sr: srOf(td) }
          : [...td.querySelectorAll(".chip")].map((c) => ({
              opponent: seen(c.firstElementChild),
              link: c.querySelector("a")?.getAttribute("href") ?? null,
              difficulty: norm(c.querySelector(".diff")?.textContent),
              band: Number(c.className.match(/band(\d)/)?.[1]),
              sr: srOf(c),
            })),
      ),
    })),
    legend: { label: doc.querySelector("[role=img]")?.getAttribute("aria-label") ?? null, chips: [...doc.querySelectorAll("[role=img] .chip")].map((c) => srOf(c)) },
    lede: norm(doc.querySelector("p.lede")?.textContent),
  };
}

/** No placeholders or broken numbers anywhere. */
function expectClean(text: string, where: string) {
  expect(text, `${where}: no undefined/NaN/[object]/Infinity`).not.toMatch(/undefined|NaN|\[object|Infinity|null/);
}

// ------------------------------------------------------------------------------------------------ the checks

/** The server-rendered feed agrees with the schedule: which gameweeks, their headers, days, matches, states and links. */
function checkFeed(v: { doc: ParentNode; text: string }, world: World, schedule: ScheduledFixture[], where: string, opts: { gw?: number; lang?: Lang; timeZone?: string; today?: string } = {}) {
  const l = opts.lang ?? EN;
  const t = catalog(l);
  const c = clientCatalog(l).feed;
  const events = world.bootstrap.events;
  const feed = feedOf(events, schedule);
  const now = world.now.getTime();
  const tz = opts.timeZone ?? "Europe/London";

  // Header, intro and tabs.
  expect(norm(v.doc.querySelector("h1")?.textContent), `${where}: title`).toBe(t.meta.fixtures);
  expect(v.text, `${where}: eyebrow`).toContain(t.fixtures.feedEyebrow);
  expect(t.fixtures.feedIntro.some((s) => v.text.includes(s)), `${where}: one of the feed intros`).toBe(true);
  const tabs = [...v.doc.querySelectorAll("nav[aria-label] a")].filter((a) => a.closest("nav")!.getAttribute("aria-label") === t.fixtures.tabsLabel);
  expect(tabs.map((a) => [norm(a.textContent), a.getAttribute("href"), a.getAttribute("aria-current")]), `${where}: tabs, 'All fixtures' current`).toEqual([
    [t.fixtures.all, "/fixtures", "true"], [t.fixtures.next(3), "/fixtures?n=3", null], [t.fixtures.next(5), "/fixtures?n=5", null], [t.fixtures.next(10), "/fixtures?n=10", null],
  ]);
  const next = nextDeadline(events, now);
  const hl = next ? highlights(grid(events, schedule, next.id, 5)) : null;
  expect(ledes(events, schedule, now, hl, l), `${where}: the intro (deadline, doubles/blanks, two runs over the next 5)`).toContain(norm(v.doc.querySelector("p.lede")?.textContent));

  // Jump menu: every gameweek with fixtures, then the postponed ones.
  const options = [...v.doc.querySelectorAll("select option")].map((o) => norm(o.textContent));
  expect(options, `${where}: jump menu`).toEqual(feed.map((g) => (g.gw === null ? c.postponed : c.gw(g.gw))));

  // Which three gameweeks open: the one asked for, else the first not finished, else the last.
  const asked = opts.gw !== undefined ? feed.findIndex((g) => g.gw === opts.gw) : -1;
  const open = feed.findIndex((g) => g.gw !== null && g.status !== "finished");
  const start = asked !== -1 ? asked : open !== -1 ? open : feed.length - 1;
  const shown = feed.slice(start, start + 3);
  const sections = feedOnPage(v.doc);
  expect(sections.map((s) => s.title), `${where}: the gameweeks shown`).toEqual(shown.map((g) => (g.gw === null ? c.postponedHeading : c.gameweek(g.gw))));
  expect(!![...v.doc.querySelectorAll("button")].find((b) => norm(b.textContent) === c.earlier), `${where}: 'Earlier gameweeks' iff there are any`).toBe(start > 0);
  const more = start + 3 < feed.length;
  expect(!![...v.doc.querySelectorAll("button")].find((b) => norm(b.textContent) === c.showMore), `${where}: 'Show more' while there is more`).toBe(more);
  expect(v.text.includes(c.end), `${where}: the end-of-season line only at the end`).toBe(!more);

  shown.forEach((g, i) => {
    const s = sections[i];
    const here = `${where}, ${s.title}`;
    expect(s.badge, `${here}: badge`).toBe(g.status === "live" ? c.thisWeek : g.status === "finished" ? c.played : null);
    expect(s.bonusLink, `${here}: bonus link only once the gameweek is under way`).toBe(g.gw !== null && g.status !== "upcoming" ? `/bonus?gw=${g.gw}` : null);
    expect(s.deadline, `${here}: deadline`).toBe(g.deadline ? `${c.deadline} ${opts.timeZone ? new Date(g.deadline).toLocaleString(INTL_LOCALE[l.locale], { ...KICKOFF, timeZone: tz }) : utc(g.deadline, l)}` : null);
    const flags = [g.doubles.length ? `${c.double} ${g.doubles.map((x) => club(x).short_name).join(", ")}` : "", g.blanks.length ? `${c.blank} ${g.blanks.map((x) => club(x).short_name).join(", ")}` : ""].filter(Boolean).join(" ");
    expect(s.flags, `${here}: double and blank flags`).toBe(flags || null);

    // Days in the reader's calendar (UK on the server), kick-off order inside each, postponed ones under "to be confirmed".
    const days: { date: string; ms: ScheduledFixture[] }[] = [];
    for (const m of g.matches) {
      const date = m.kickoff_time ? dateIn(m.kickoff_time, tz) : "tbc";
      (days.find((d) => d.date === date) ?? days[days.push({ date, ms: [] }) - 1]).ms.push(m);
    }
    expect(s.days.map((d) => d.heading), `${here}: day headings`).toEqual(days.map((d) => (d.date === "tbc" ? c.kickoffTbc : dayHeading(d.date, l))));
    expect(s.days.map((d) => d.datetime), `${here}: day datetimes`).toEqual(days.map((d) => (d.date === "tbc" ? null : d.date)));
    expect(s.days.map((d) => d.today), `${here}: 'Today' only on today's date, and only once the reader's clock is known`).toEqual(days.map((d) => (opts.today && d.date === opts.today ? c.today : null)));
    days.forEach((d, j) =>
      d.ms.forEach((m, k) => {
        const got = s.days[j].matches[k];
        const at = `${here}, ${club(m.team_h).short_name} v ${club(m.team_a).short_name}`;
        expect([got.home, got.away], `${at}: home then away`).toEqual([club(m.team_h).short_name, club(m.team_a).short_name]);
        expect(got.clubLinks, `${at}: club links`).toEqual([`/club/${slug(club(m.team_h).name)}`, `/club/${slug(club(m.team_a).name)}`]);
        const played = m.started || m.finished || m.finished_provisional;
        if (!played) {
          expect(got.score, `${at}: no score before kick-off`).toBeNull();
          expect(got.time, `${at}: kick-off time`).toBe(m.kickoff_time ? (opts.timeZone ? clock(m.kickoff_time, l, tz) : `${clock(m.kickoff_time, l, "UTC")} UTC`) : c.tbc);
          const bands = [rating(m.team_h_difficulty), rating(m.team_a_difficulty)];
          expect(got.chips, `${at}: each side's difficulty, as a number and for screen readers`).toEqual(bands.map((b) => ({ band: b, text: String(b), sr: clientCatalog(l).fdr.difficulty(b) })));
          expect(got.scoreLink, `${at}: nothing to link to yet`).toBeNull();
        } else {
          expect(got.score, `${at}: score`).toBe(`${m.team_h_score}–${m.team_a_score}`);
          expect(got.state, `${at}: Live while on, 'Bonus pending' at full time until FPL confirms, nothing once final`).toBe(m.finished ? null : m.finished_provisional ? c.provisional : c.live);
          expect(got.chips, `${at}: difficulty no longer shown once started`).toEqual([null, null]);
          if (g.gw !== null) {
            expect(got.scoreLink, `${at}: the score leads to that gameweek's bonus`).toBe(`/bonus?gw=${g.gw}`);
            expect(got.scoreSr, `${at}: the link says what it is`).toContain(c.bonusFor(club(m.team_h).name, club(m.team_a).name));
          }
          if (m.finished || m.finished_provisional) expect(got.scoreSr, `${at}: full time for screen readers`).toContain(c.fullTime);
        }
      }),
    );
  });
  expectClean(v.text, where);
}

/** The grid agrees with the oracle: columns, every row's rank, average and chips, legend, tabs, pager, intro. */
function checkGrid(v: Visit, world: World, schedule: ScheduledFixture[], start: number, n: number, where: string, l: Lang = EN) {
  const t = catalog(l);
  const f = t.fixtures;
  const cl = clientCatalog(l);
  const events = world.bootstrap.events;
  const want = grid(events, schedule, start, n);
  const page = gridOnPage(v.doc);
  const last = events.at(-1)!.id;
  expect(norm(v.doc.querySelector("h1")?.textContent), `${where}: title`).toBe(t.meta.fixtures);
  expect(v.text, `${where}: which gameweeks`).toContain(f.gridIntro(want.gws[0], want.gws.at(-1)!));
  expect(norm(v.doc.querySelector("caption")?.textContent), `${where}: caption`).toBe(f.gridCaption(want.gws[0], want.gws.at(-1)!));
  expect(page.columns, `${where}: columns`).toEqual(
    want.gws.map((gw) => ({ gw: t.common.gw(gw), date: new Date(events.find((e) => e.id === gw)!.deadline_time).toLocaleDateString(INTL_LOCALE[l.locale], { day: "numeric", month: "short", timeZone: "UTC" }) })),
  );
  expect(page.legend, `${where}: the 1-5 legend, in this language`).toEqual({ label: cl.fdr.scale, chips: [1, 2, 3, 4, 5].map((d) => cl.fdr.difficulty(d)) });
  expect(v.text, `${where}: how a blank is scored`).toContain(f.blankNote);

  // Tabs keep the start; the pager keeps the window.
  const tabs = [...v.doc.querySelectorAll("nav[aria-label] a")].filter((a) => a.closest("nav")!.getAttribute("aria-label") === f.tabsLabel);
  expect(tabs.map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]), `${where}: tabs`).toEqual([
    ["/fixtures", null], [`/fixtures?gw=${start}&n=3`, n === 3 ? "true" : null], [`/fixtures?gw=${start}&n=5`, n === 5 ? "true" : null], [`/fixtures?gw=${start}&n=10`, n === 10 ? "true" : null],
  ]);
  const pager = v.doc.querySelector(`nav[aria-label="${t.pager.nav(t.pager.startGameweekLabel)}"]`)!;
  expect(norm(pager.querySelector("[aria-current=page]")?.textContent), `${where}: pager shows the start`).toBe(t.common.gw(start));
  expect([...pager.querySelectorAll("a")].map((a) => a.getAttribute("href")), `${where}: pager links`).toEqual([...(start > 1 ? [`/fixtures?gw=${start - 1}&n=${n}`] : []), ...(start < last ? [`/fixtures?gw=${start + 1}&n=${n}`] : [])]);

  // Every row: rank, club, average, and each gameweek's opponents.
  expect(page.rows.length, `${where}: every club`).toBe(teams.length);
  want.rows.forEach((r, i) => {
    const got = page.rows[i];
    const name = club(r.team).name;
    const here = `${where}, row ${i + 1}`;
    expect([got.rank, got.short], `${here}: rank and club (easiest run first)`).toEqual([String(i + 1), club(r.team).short_name]);
    expect(got.avg, `${here}: average difficulty`).toBe(f.avg(oneDecimal(r.average, l)));
    expect(got.sr, `${here}: rank for screen readers`).toBe(f.rankSr(i + 1, name));
    expect(got.link, `${here}: club page`).toBe(`/club/${slug(name)}`);
    r.cells.forEach((cell, j) => {
      const at = `${here}, ${t.common.gw(cell.gw)}`;
      if (cell.matches.length === 0) {
        expect(got.cells[j], `${at}: no fixture`).toEqual({ blank: "–", sr: f.noFixture });
        return;
      }
      expect(got.cells[j], `${at}: opponents, venue and difficulty`).toEqual(
        cell.matches.map((m) => ({
          opponent: `${club(m.opp).short_name} (${m.home ? f.homeShort : f.awayShort})`, link: `/club/${slug(club(m.opp).name)}`,
          difficulty: String(m.difficulty), band: Math.round(m.difficulty), sr: cl.fdr.difficulty(Math.round(m.difficulty)),
        })),
      );
    });
  });
  // The averages shown run easiest to hardest, so the order is visibly the ranking.
  const avgs = want.rows.map((r) => r.average);
  expect(avgs, `${where}: averages never go down the table`).toEqual([...avgs].sort((a, b) => a - b));
  expect(ledes(events, schedule, world.now.getTime(), highlights(want), l), `${where}: the intro`).toContain(page.lede);
  expectClean(v.text, where);
}

// ------------------------------------------------------------------------------------------------ 1. every moment

describe("the fixtures page", () => {
  it("what the page shows at every moment: the feed's gameweeks, days, scores and flags, Today in the reader's zone, and the grid's window", async () => {
    const t = MESSAGES.en;
    const c = CLIENT_MESSAGES.en.feed;
    const PHASES_: PhaseName[] = ["preseason", "upcoming", "live-playing", "live-between", "live-over", "provisional", "final", "season-over"];

    for (const phase of PHASES_) {
      const world = season(phase);
      // The feed, as the server first paints it (UK days, UTC times, no "Today" yet).
      const v = await visit(world);
      checkFeed(v, world, world.schedule, `${phase} feed`);

      // The grid opens on the next deadline's gameweek (the last one once the season is done), five wide.
      const start = defaultStart(world.bootstrap.events, world.now.getTime());
      if (phase === "season-over") expect(start, "season-over: the grid stays on GW38").toBe(38);
      else expect(start, `${phase}: the grid starts at the next deadline`).toBe(nextDeadline(world.bootstrap.events, world.now.getTime())!.id);
      const g = await visit(world, { params: { n: "5" } });
      checkGrid(g, world, world.schedule, start, 5, `${phase} grid`);
    }

    // A feed opened at a chosen gameweek, and at the start of the season (no earlier button).
    {
      const world = season("live-playing");
      checkFeed(await visit(world, { params: { gw: "3" } }), world, world.schedule, "feed ?gw=3", { gw: 3 });
      checkFeed(await visit(world, { params: { gw: "1" } }), world, world.schedule, "feed ?gw=1", { gw: 1 });
      checkFeed(await visit(world, { params: { gw: "12" } }), world, world.schedule, "feed ?gw=12 (the end)", { gw: 12 });
      checkFeed(await visit(world, { params: { gw: "99" } }), world, world.schedule, "feed ?gw=99 (no such gameweek: opens where it would)");
      checkFeed(await visit(world, { params: { gw: "6abc" } }), world, world.schedule, "feed ?gw=6abc (not a number)");
    }

    // FPL's odd weeks: a double, a blank, a postponement and a match at full time with its bonus still to come.
    {
      const world = season("live-playing");
      const gw8 = world.schedule.filter((f) => f.event === 8);
      const postponedId = gw8[3].id;
      const postponedClubs = [gw8[3].team_h, gw8[3].team_a];
      const moved = world.schedule.find((f) => f.event === 9 && !postponedClubs.includes(f.team_h) && !postponedClubs.includes(f.team_a))!;
      const extra = editSchedule(world, (all) =>
        all.map((f) =>
          f.id === moved.id ? { ...f, event: 8 }
          : f.id === postponedId ? { ...f, event: null, kickoff_time: null }
          : f.id === 61 ? { ...f, finished: false, finished_provisional: true }
          : f,
        ),
      );
      const schedule = servedSchedule(world, extra);
      const doubled = [moved.team_h, moved.team_a].sort((a, b) => a - b);
      const blanked = [...postponedClubs].sort((a, b) => a - b);

      const now = await visit(world, { extra });
      checkFeed(now, world, schedule, "odd weeks, GW6");
      const gw6 = feedOnPage(now.doc)[0];
      const f61 = gw6.days[0].matches[0];
      expect([f61.score, f61.state], "odd weeks: full time, bonus pending").toEqual(["3–2", c.provisional]);
      const f62 = gw6.days[0].matches[1];
      expect([f62.score, f62.state], "odd weeks: still live").toEqual(["2–1", c.live]);

      const later = await visit(world, { extra, params: { gw: "8" } });
      checkFeed(later, world, schedule, "odd weeks, GW8–10", { gw: 8 });
      const [s8, s9] = feedOnPage(later.doc);
      expect(s8.flags, "GW8: the double and the blank, by name").toBe(`${c.double} ${doubled.map((x) => club(x).short_name).join(", ")} ${c.blank} ${blanked.map((x) => club(x).short_name).join(", ")}`);
      expect(s9.flags, "GW9: the clubs whose match moved forward blank").toBe(`${c.blank} ${doubled.map((x) => club(x).short_name).join(", ")}`);
      expect(s8.days.flatMap((d) => d.matches).length, "GW8: four matches with one gone and one come in").toBe(4);

      const end = await visit(world, { extra, params: { gw: "11" } });
      checkFeed(end, world, schedule, "odd weeks, GW11 to the end", { gw: 11 });
      const tail = feedOnPage(end.doc).at(-1)!;
      expect(tail.title, "postponed: last, under its own heading").toBe(c.postponedHeading);
      expect([tail.badge, tail.bonusLink, tail.deadline], "postponed: no badge, bonus link or deadline").toEqual([null, null, null]);
      expect(tail.days.map((d) => d.heading), "postponed: 'Kick-off time to be confirmed'").toEqual([c.kickoffTbc]);
      expect(tail.days[0].matches[0].time, "postponed: TBC").toBe(c.tbc);
      expect([...end.doc.querySelectorAll("select option")].at(-1)?.textContent, "postponed: last in the jump menu").toBe(c.postponed);

      // The grid over the same weeks: two chips for the double (difficulty their mean), "–" counted as 5 for the blank.
      const g = await visit(world, { extra, params: { gw: "7", n: "3" } });
      checkGrid(g, world, schedule, 7, 3, "odd weeks grid GW7–9");
      const rows = gridOnPage(g.doc).rows;
      for (const id of doubled) expect(rows.find((r) => r.short === club(id).short_name)!.cells[1], `grid: ${club(id).short_name} has two GW8 matches`).toHaveLength(2);
      for (const id of blanked) expect(rows.find((r) => r.short === club(id).short_name)!.cells[1], `grid: ${club(id).short_name} blank in GW8`).toEqual({ blank: "–", sr: t.fixtures.noFixture });
    }

    // In the browser: days regroup under the reader's own dates and today is marked. At 15:00 UK time on the Saturday,
    // a reader in London is on Saturday 10 October; one in Tokyo is already on Sunday 11th, where the 16:30 UK kick-off
    // (01:30 there) now sits, and the Monday night match moves to Tuesday.
    {
      const world = season("live-playing");
      for (const timeZone of ["Europe/London", "Asia/Tokyo", "America/Los_Angeles"]) {
        const today = dateIn(world.now.toISOString(), timeZone);
        const h = await hydrate(world, timeZone);
        checkFeed(h, world, world.schedule, `hydrated in ${timeZone}`, { timeZone, today });
        const marked = [...h.root.querySelectorAll(".day")].filter((d) => d.querySelector("h3 .badge"));
        expect(marked.length, `${timeZone}: exactly one day is today`).toBe(1);
      }
      const tokyo = feedOnPage((await hydrate(world, "Asia/Tokyo")).root)[0];
      expect(tokyo.days.map((d) => [d.datetime, d.today]), "Tokyo: GW6 over Saturday, Sunday (today) and Tuesday").toEqual([["2026-10-10", null], ["2026-10-11", c.today], ["2026-10-13", null]]);
      expect(tokyo.days[1].matches.map((m) => [m.home, m.away, m.time]), "Tokyo: LIV v BHA at 01:30 on Sunday").toEqual([["LIV", "BHA", "01:30"]]);
      const london = feedOnPage((await hydrate(world, "Europe/London")).root)[0];
      expect(london.days.map((d) => [d.datetime, d.today]), "London: Saturday is today").toEqual([["2026-10-10", c.today], ["2026-10-12", null]]);
    }

    // Nothing at all from FPL yet: said plainly, on both views.
    {
      const world = season("preseason");
      const empty: Routes = [[(u) => u.includes("/bootstrap-static/"), { ...world.bootstrap, events: [] }], [(u) => u.endsWith("/api/fixtures/"), []]];
      for (const params of [{}, { n: "5" }] as Params[]) {
        const v = await visit(world, { extra: empty, params });
        expect(v.text, `no season (${JSON.stringify(params)}): says so`).toContain(t.fixtures.none);
        expect(v.text, `no season (${JSON.stringify(params)}): and why`).toContain(t.fixtures.noneBody);
        expect(v.doc.querySelectorAll("section, table").length, `no season (${JSON.stringify(params)}): no feed or grid`).toBe(0);
      }
    }
  });

  // ------------------------------------------------------------------------------------------------ 2. the numbers

  it("the numbers are right: every difficulty, average, rank and sentence, for every window and start, odd addresses, and every language", async () => {
    // a) Every window from every start the pager can reach, in a live week and once the season is over.
    for (const phase of ["live-playing", "season-over"] as const) {
      const world = season(phase);
      const last = world.bootstrap.events.at(-1)!.id;
      const starts = phase === "season-over" ? [1, 19, 30, 36, 38] : Array.from({ length: last }, (_, i) => i + 1);
      for (const n of [3, 5, 10]) {
        for (const start of starts) {
          const v = await visit(world, { params: { gw: String(start), n: String(n) } });
          checkGrid(v, world, world.schedule, start, n, `${phase} GW${start} next ${n}`);
          expect(gridOnPage(v.doc).columns.length, `${phase} GW${start} next ${n}: the window runs out at the last gameweek`).toBe(Math.min(n, last - start + 1));
        }
      }
    }

    // b) FPL's odd difficulty data: missing, zero and out-of-range ratings read as the middle (3), never NaN.
    {
      const world = season("upcoming");
      const extra = editSchedule(world, (all) =>
        all.map((f) =>
          f.id === 71 ? { ...f, team_h_difficulty: null as unknown as number, team_a_difficulty: 0 }
          : f.id === 72 ? { ...f, team_h_difficulty: 9, team_a_difficulty: -1 }
          : f.id === 81 ? { ...f, team_h_difficulty: undefined as unknown as number }
          : f,
        ),
      );
      const schedule = servedSchedule(world, extra);
      const v = await visit(world, { extra, params: { n: "3" } });
      checkGrid(v, world, schedule, 7, 3, "odd ratings");
      const f71 = schedule.find((f) => f.id === 71)!;
      const row = gridOnPage(v.doc).rows.find((r) => r.short === club(f71.team_h).short_name)!;
      expect(row.cells[0], "odd ratings: a missing rating shows as 3").toEqual([expect.objectContaining({ difficulty: "3", band: 3 })]);
      checkFeed(await visit(world, { extra }), world, schedule, "odd ratings feed");
    }

    // c) A club FPL's team list doesn't have (a fixture against id 99): text, not a link to a missing page, and still counted.
    {
      const world = season("upcoming");
      const extra = editSchedule(world, (all) => all.map((f) => (f.id === 71 ? { ...f, team_a: 99 } : f)));
      const v = await visit(world, { extra, params: { n: "3" } });
      const f71 = servedSchedule(world, extra).find((f) => f.id === 71)!;
      const row = gridOnPage(v.doc).rows.find((r) => r.short === club(f71.team_h).short_name)!;
      expect(row.cells[0], "unknown opponent: shown as '?', not linked").toEqual([expect.objectContaining({ opponent: `? (${MESSAGES.en.fixtures.homeShort})`, link: null })]);
      expect(srOf(v.doc.querySelector("tbody")), "unknown opponent: screen readers hear 'Unknown club'").toContain(MESSAGES.en.common.unknownClub);
      expectClean(v.text, "unknown opponent");
    }

    // d) Odd addresses: an unknown window means five, a list takes its first, a bad or out-of-range start means the default.
    {
      const world = season("live-playing");
      const start = defaultStart(world.bootstrap.events, world.now.getTime());
      const cases: [Params, number, number][] = [
        [{ n: "7" }, start, 5], [{ n: "" }, start, 5], [{ n: "ten" }, start, 5], [{ n: ["10", "3"] }, start, 10], [{ n: "03" }, start, 3],
        [{ gw: "0", n: "3" }, start, 3], [{ gw: "13", n: "3" }, start, 3], [{ gw: "-2", n: "3" }, start, 3], [{ gw: "4.5", n: "3" }, start, 3], [{ gw: " 4", n: "3" }, start, 3],
        [{ gw: ["2", "9"], n: "3" }, 2, 3], [{ gw: "12", n: "10" }, 12, 10],
      ];
      for (const [params, s, n] of cases) {
        const v = await visit(world, { params });
        checkGrid(v, world, world.schedule, s, n, `address ${JSON.stringify(params)}`);
      }
    }

    // e) Every language and the altered view: the same ranking, figures and opponents; words, numbers and dates in each language; no English left.
    {
      const world = season("live-playing");
      const english = await visit(world, { params: { n: "5" } });
      const englishFeed = await visit(world);
      const shape = (v: Visit) => gridOnPage(v.doc).rows.map((r) => [r.rank, r.short, r.cells.map((c) => (Array.isArray(c) ? c.map((m) => [m.difficulty, m.band, m.link]) : "–"))]);
      const allow = [...teams.flatMap((x) => [x.name, x.short_name]), /^GW\d+$/, /^[A-Z]{3}( \([A-Z]\))?$/, /^\?$/, /^\d$/, /^(LIV|BHA|TOT|EVE|ARS|MCI|CHE|NEW)(, [A-Z]{3})*$/];
      for (const lang of LANGS) {
        const where = label(lang);
        const start = defaultStart(world.bootstrap.events, world.now.getTime());
        const v = await visit(world, { params: { n: "5" }, lang });
        checkGrid(v, world, world.schedule, start, 5, `${where} grid`, lang);
        expect(shape(v), `${where}: the same ranking and opponents as English`).toEqual(shape(english));
        const f = await visit(world, { lang });
        checkFeed(f, world, world.schedule, `${where} feed`, { lang });
        if (lang.locale !== "en") {
          const base = lang.trip ? { grid: await visit(world, { params: { n: "5" }, lang: { locale: "en", trip: true } }), feed: await visit(world, { lang: { locale: "en", trip: true } }) } : { grid: english, feed: englishFeed };
          expect(englishLeaks(base.grid.html, v.html, lang.locale as "es" | "fr", { allow }), `${where} grid: no English left behind`).toEqual([]);
          expect(englishLeaks(base.feed.html, f.html, lang.locale as "es" | "fr", { allow }), `${where} feed: no English left behind`).toEqual([]);
          expect(v.text, `${where}: actually translated`).not.toBe(base.grid.text);
        }
      }
    }
  });
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
