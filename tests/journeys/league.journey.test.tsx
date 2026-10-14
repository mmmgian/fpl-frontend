/**
 * The league page (app/page.tsx), walked through a whole season and then through the awkward leagues and failures
 * real FPL serves: right-to-left and emoji names, a second standings page, ties, a missing name, hits, a game file
 * that won't load, a league that doesn't exist, and the per-manager extras streaming in late.
 *
 * Expected values come from the world (its standings and the managers' FPL histories), never from the app's own model.
 */
import { cloneElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { formatNumber, messagesFor } from "@/lib/domain";
import { testLanguage } from "../language";
import { LEAGUE_ID, PHASES, install, requested, season, textOf, uninstall, type PhaseName, type Routes, type World } from "./world";

beforeEach(() => vi.resetModules());
afterEach(uninstall);

const en = messagesFor("en");

// ---------- helpers ----------

async function renderLeague(): Promise<{ markup: string; text: string; el: ReactElement }> {
  const LeaguePage = (await import("@/app/page")).default;
  const el = (await LeaguePage()) as ReactElement;
  const markup = renderToStaticMarkup(el);
  return { markup, text: textOf(markup), el };
}

interface Row {
  raw: string;
  text: string;
  tone: string | null;
  href: string | null;
}

/** The standings table's manager rows (the ones with a row header), in document order. */
function tableRows(markup: string): Row[] {
  const start = markup.lastIndexOf("<tbody");
  const body = markup.slice(start, markup.indexOf("</tbody>", start));
  return body
    .split(/<tr\b/)
    .slice(1)
    .filter((c) => c.includes('scope="row"'))
    .map((c) => ({ raw: c, text: textOf(`<tr${c}`), tone: c.match(/^[^>]*data-tone="(\w+)"/)?.[1] ?? null, href: c.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null }));
}

/** Asserts the text contains one of the wordings, and says which were tried when none matches. */
function expectOneOf(text: string, variants: string[], what: string) {
  const hit = variants.some((v) => text.includes(v));
  expect(hit, `${what}: none of the ${variants.length} wordings found.\nTried:\n  ${variants.join("\n  ")}\nIn:\n  ${text.slice(0, 1200)}`).toBe(true);
}
function expectNoneOf(text: string, variants: string[], what: string) {
  const found = variants.filter((v) => text.includes(v));
  expect(found, `${what}: should not appear`).toEqual([]);
}

/** A manager's FPL history as the world serves it. */
async function historyOf(world: World, entry: number): Promise<{ current: { event: number; points: number; event_transfers_cost: number }[] }> {
  const url = `https://fantasy.premierleague.com/api/entry/${entry}/history/`;
  const route = world.routes.find(([match]) => match(url))!;
  const res = await (route[1] as (u: string) => Response | Promise<Response>)(url);
  return res.json();
}

/** The status the gameweek is in at each phase, as FPL's flags and the clock say. */
const STATUS: Record<PhaseName, "upcoming" | "live" | "provisional" | "final" | null> = {
  preseason: null, upcoming: "upcoming", "live-playing": "live", "live-between": "live", "live-over": "live", provisional: "provisional", final: "final", "season-over": "final",
};
/** How often the page should ask for fresh numbers: every minute in play, up to the next kick-off between matches (capped at 15 minutes), 5 minutes while FPL closes the week, never once it's settled. */
const REFRESH: Record<PhaseName, number | null> = {
  preseason: null, upcoming: null, "live-playing": 60_000, "live-between": 15 * 60_000, "live-over": 5 * 60_000, provisional: 5 * 60_000, final: null, "season-over": null,
};
/** The next deadline sentence (UTC, as the server renders LocalTime), or null when the page shouldn't show one. */
const DEADLINE: Record<PhaseName, string | null> = {
  preseason: "GW1 deadline: Fri 14 Aug, 17:30 UTC",
  upcoming: "GW7 deadline: Sat 17 Oct, 10:00 UTC",
  "live-playing": null, "live-between": null, "live-over": null,
  provisional: "GW7 deadline: Sat 17 Oct, 10:00 UTC",
  final: "GW7 deadline: Sat 17 Oct, 10:00 UTC",
  "season-over": null,
};

function phaseLines(phase: PhaseName, gw: number): string[] | null {
  const l = en.league;
  switch (phase) {
    case "preseason": return null;
    case "upcoming": return l.phase.upcoming.map((f) => f(gw));
    case "live-playing": return l.phase.live.map((f) => f(gw));
    // The next kick-off is Monday night's match, 19:00 UTC (the <time> element leaves a space before the full stop).
    case "live-between": return l.phasePaused.map((p) => `${p.before(gw)}Mon 12 Oct, 19:00 UTC ${p.after}`);
    case "live-over": return l.phaseAllPlayed.map((f) => f(gw));
    case "provisional": return l.phase.provisional.map((f) => f(gw));
    case "final": return l.phase.final.map((f) => f(gw));
    case "season-over": return l.phaseOver.map((f) => f(gw));
  }
}

const allPhaseLines = (gw: number) => [
  ...Object.values(en.league.phase).flatMap((list) => list.map((f) => f(gw))),
  ...en.league.phaseAllPlayed.map((f) => f(gw)),
  ...en.league.phaseOver.map((f) => f(gw)),
  ...en.league.phasePaused.map((p) => p.before(gw)),
];

// ---------- 1. the season ----------

it("shows the right table, numbers, phase, refresh and awards at every moment of the season", async () => {
  for (const phase of PHASES) {
    const world = install(season(phase));
    const { markup, text, el } = await renderLeague();
    const p = `[${phase}]`;
    const standings = world.standings;
    const status = STATUS[phase];

    // The page is rendered in one pass in tests: the extras are already in, nothing is left to stream.
    expect((el.props as { extras?: unknown }).extras, `${p} extras should be rendered in place, not streamed`).toBeUndefined();

    // Header: league name, the gameweek and its status (or pre-season), the refresh button only while numbers move.
    expect(text.startsWith("The Lobster League"), `${p} page should open with the league name`).toBe(true);
    if (status) {
      expect(text, `${p} gameweek name in header`).toContain(`Gameweek ${world.gw}`);
      expect(text, `${p} status badge`).toContain(en.status[status]);
      expect(text, `${p} must not say pre-season`).not.toContain(en.league.preSeason);
    } else {
      expect(text, `${p} pre-season label`).toContain(en.league.preSeason);
      for (const s of Object.values(en.status)) expect(text, `${p} no status badge "${s}" before the season`).not.toContain(` ${s} `);
    }
    expect(markup.includes('aria-label="Refresh"'), `${p} refresh control present iff the numbers can still move`).toBe(REFRESH[phase] !== null);
    const { services } = await import("@/lib/container");
    const model = await services.league.load(LEAGUE_ID);
    expect(model.kind, `${p} model kind`).toBe("ok");
    if (model.kind !== "ok") continue;
    expect(model.refreshMs, `${p} refresh interval`).toBe(REFRESH[phase]);

    // The table: every manager, in rank order, with their name, manager, GW points and total, linked to their team.
    const rows = tableRows(markup);
    expect(rows.length, `${p} one row per manager`).toBe(standings.length);
    const slugs: Record<number, string> = { 7: "gaucho-f-c", 1: "barts-team", 2: "dang-football-club", 3: "saka-la-bolsita", 4: "papoy", 5: "fc-rtw" };
    standings.forEach((s, i) => {
      const r = rows[i];
      const who = `${p} row ${i + 1} (${s.entry_name})`;
      expect(r.text, `${who}: team name`).toContain(s.entry_name);
      expect(r.text, `${who}: manager`).toContain(s.player_name);
      expect(r.text.startsWith(`${s.rank} `), `${who}: rank ${s.rank} first, got "${r.text.slice(0, 20)}"`).toBe(true);
      expect(r.text.endsWith(`${formatNumber(s.event_total)} ${formatNumber(s.total)}`), `${who}: should end "GW total" = "${s.event_total} ${s.total}", got "…${r.text.slice(-24)}"`).toBe(true);
      expect(r.href, `${who}: team link`).toBe(`/team/${slugs[s.entry]}`);
      // Six managers is too few for promotion/relegation zones.
      expect(r.tone, `${who}: no zone tint in a 6-team league`).toBeNull();
      const movement = s.last_rank === 0 ? en.movement.newEntry : s.last_rank === s.rank ? en.movement.noChange : s.last_rank > s.rank ? en.movement.up(s.last_rank - s.rank) : en.movement.down(s.rank - s.last_rank);
      expect(r.text, `${who}: movement "${movement}"`).toContain(movement);
    });
    for (let i = 1; i < standings.length; i++) expect(standings[i - 1].total, `${p} world table sorted by total`).toBeGreaterThanOrEqual(standings[i].total);
    expect(markup, `${p} no zones key in a 6-team league`).not.toContain(`aria-label="${en.table.zonesLabel}"`);
    expect(text, `${p} never truncated`).not.toContain(en.league.truncated);

    // Summary: the leader with their margin, the managers count, and the best GW score only once the gameweek has points.
    const leader = standings[0];
    const gap = leader.total - standings[1].total;
    expect(text, `${p} "Leader <total>"`).toContain(`${en.league.leader} ${formatNumber(leader.total)} ${leader.entry_name}`);
    if (gap > 0) expectOneOf(text, en.league.leaderHint.map((f) => f(leader.entry_name, en.common.points(gap))), `${p} leader hint`);
    expect(text, `${p} managers count`).toContain(`${en.league.managers} ${standings.length}`);
    const best = Math.max(...standings.map((s) => s.event_total));
    const bestNames = standings.filter((s) => s.event_total === best).map((s) => s.entry_name);
    const bestLabel = en.league.best(`GW${world.gw}`);
    if (status === "live" || status === "provisional" || status === "final") {
      expect(best, `${p} someone has scored`).toBeGreaterThan(0);
      const hints = bestNames.map((n) => (status === "live" ? en.league.bestLive(n) : n));
      expectOneOf(text, hints.map((h) => `${bestLabel} ${formatNumber(best)} ${h}`), `${p} best GW score`);
    } else {
      // Before a deadline every GW score is 0: there's no "best" to report.
      expect(text, `${p} no "Best GW" before the gameweek has started`).not.toContain(bestLabel);
    }

    // The storyline opens with where the gameweek stands, and the next deadline once nothing is in play.
    const lines = phaseLines(phase, world.gw);
    if (lines) expectOneOf(text, lines, `${p} phase line`);
    else for (const l of allPhaseLines(1)) expect(text, `${p} no phase line before the season`).not.toContain(l);
    if (phase !== "live-between") expectNoneOf(text, en.league.phasePaused.map((x) => x.before(world.gw)), `${p} paused wording outside a pause`);
    const deadline = DEADLINE[phase];
    if (deadline) expect(text, `${p} next deadline`).toContain(deadline);
    else expect(text, `${p} no deadline sentence`).not.toMatch(/GW\d+ deadline: /);
    if (phase === "season-over") {
      const [first, second] = standings;
      const champ = en.league.story.champion.map((f) => f({ name: first.entry_name, other: second.entry_name, figure: en.common.points(first.total - second.total), n: first.total - second.total } as never));
      expectOneOf(text, champ, `${p} champion line`);
    }

    // Awards: for the latest finished gameweek in the managers' histories, worked out from those histories.
    const histories = new Map<number, Awaited<ReturnType<typeof historyOf>>>();
    for (const s of standings) histories.set(s.entry, await historyOf(world, s.entry));
    const statsGw = Math.max(0, ...[...histories.values()].flatMap((h) => h.current.map((r) => r.event)));
    if (statsGw === 0) {
      expect(text, `${p} no awards before anyone has played`).not.toContain(en.league.awardsHeading);
    } else {
      expect(text, `${p} awards heading`).toContain(en.league.awardsHeading);
      const net = standings.map((s) => {
        const r = histories.get(s.entry)!.current.find((x) => x.event === statsGw)!;
        return { name: s.entry_name, net: r.points - r.event_transfers_cost };
      });
      const top = Math.max(...net.map((x) => x.net));
      const bottom = Math.min(...net.map((x) => x.net));
      expectOneOf(text, net.filter((x) => x.net === top).map(() => `${en.awards.titles.weekWinner} ${top} `), `${p} week winner figure (GW${statsGw})`);
      expectOneOf(text, net.filter((x) => x.net === top).map((x) => x.name), `${p} week winner name`);
      expect(text, `${p} wooden spoon figure`).toContain(`${en.awards.titles.woodenSpoon} ${bottom} `);
      const spoon = net.filter((x) => x.net === bottom).map((x) => x.name);
      expectOneOf(text.slice(text.indexOf(en.awards.titles.woodenSpoon)), spoon, `${p} wooden spoon name`);
      // Which week the awards are for, and how settled it is.
      const awardsPhase = status === "live" ? en.awards.phase.live.map((f) => f(statsGw, world.gw)) : statsGw === world.gw && status === "provisional" ? en.awards.phase.provisional.map((f) => f(statsGw, 0)) : en.awards.phase.final.map((f) => f(statsGw, 0));
      expectOneOf(text, awardsPhase, `${p} awards phase line`);
      // The only hit of the season is Gaucho F.C.'s −4 in GW6: the hit machine exists once GW6 is in the histories.
      if (statsGw >= 6) expect(text, `${p} hit machine for the GW6 hit`).toContain(`${en.awards.titles.hitMachine} −4`);
      else expect(text, `${p} no hit machine before any hit`).not.toContain(en.awards.titles.hitMachine);
    }

    // Nothing fetched for a gameweek that hasn't started.
    if (phase === "preseason" || phase === "upcoming") {
      expect(requested.filter((u) => u.includes(`/event/${world.gw}/picks/`)), `${p} no picks requested for a GW that hasn't started`).toEqual([]);
    }
    uninstall();
    vi.resetModules();
  }

  // The same final-phase page in Spanish and French: translated copy, local number formats.
  for (const locale of ["es", "fr"] as const) {
    testLanguage.cookie = locale;
    const world = install(season("final"));
    const { text } = await renderLeague();
    const t = messagesFor(locale);
    const p = `[final/${locale}]`;
    expect(text, `${p} status badge`).toContain(t.status.final);
    expect(text, `${p} leader label`).toContain(t.league.leader);
    expect(text, `${p} awards heading`).toContain(t.league.awardsHeading);
    expectOneOf(text, t.league.phase.final.map((f) => f(6)), `${p} phase line`);
    expect(text, `${p} English phase lines gone`).not.toContain("FPL has signed it off");
    expect(text, `${p} leader total`).toContain(formatNumber(world.standings[0].total, locale));
    for (const s of world.standings) expect(text, `${p} ${s.entry_name}`).toContain(s.entry_name);
    uninstall();
    vi.resetModules();
  }
});

// ---------- 2. awkward leagues and failures ----------

const MESSY: { entry: number; entry_name: string | null; player_name: string | null; total: number | null; event_total: number | null; rank: number | null; last_rank: number | null }[] = [
  { entry: 101, entry_name: "فريق الصقور", player_name: "Omar Haddad", total: 1412, event_total: 81, rank: 1, last_rank: 2 },
  { entry: 102, entry_name: "🦞 Lobster Pot 🦞", player_name: "Lena Cray", total: 1411, event_total: 70, rank: 2, last_rank: 1 },
  { entry: 103, entry_name: "21", player_name: "Number Man", total: 1300, event_total: 64, rank: 3, last_rank: 3 },
  { entry: 104, entry_name: "A Remarkably Long Team Name For Testing!", player_name: "Long Name", total: 1250, event_total: 59, rank: 4, last_rank: 5 },
  { entry: 105, entry_name: "Level Pegging", player_name: "Tie One", total: 1200, event_total: 50, rank: 5, last_rank: 4 },
  { entry: 106, entry_name: "Dead Heat", player_name: "Tie Two", total: 1200, event_total: 48, rank: 5, last_rank: 6 },
];
const MESSY_PAGE2: typeof MESSY = [
  // The last manager of page 1 again (FPL's pages shift while it updates): kept once.
  { entry: 106, entry_name: "Dead Heat", player_name: "Tie Two", total: 1200, event_total: 48, rank: 5, last_rank: 6 },
  { entry: 107, entry_name: "New Kid", player_name: "Fresh Face", total: 1100, event_total: -4, rank: 7, last_rank: 0 },
  { entry: 108, entry_name: null, player_name: null, total: null, event_total: null, rank: 8, last_rank: null },
  { entry: 109, entry_name: "Zürich Ñandú", player_name: "Zoe Ñ", total: 990, event_total: 40, rank: 9, last_rank: 9 },
  { entry: 110, entry_name: "Bart's Team", player_name: "Bart Two", total: 980, event_total: 39, rank: 10, last_rank: 11 },
  { entry: 111, entry_name: "Evil\u202Egnp.exe", player_name: "Mallory", total: 970, event_total: 38, rank: 11, last_rank: 10 },
  { entry: 112, entry_name: "Last Orders", player_name: "Barry Tender", total: 960, event_total: 37, rank: 12, last_rank: 12 },
];
const leagueBody = (results: unknown[], page: number, hasNext: boolean, newEntries: unknown[] = []) => ({
  league: { id: LEAGUE_ID, name: "The Lobster League" },
  standings: { has_next: hasNext, page, results: results.map((r) => ({ club_badge_src: null, ...(r as object) })) },
  new_entries: { has_next: false, page: 1, results: newEntries },
});
const isStandings = (u: string) => u.includes("/leagues-classic/");
const isPage2 = (u: string) => isStandings(u) && u.includes("page_standings=2");

it("survives messy names, two pages, ties, zones, outages, a missing league, an empty pre-season and a late stream", async () => {
  // A. Twelve managers over two pages, with every awkward name FPL allows.
  {
    const p = "[messy]";
    install(season("final"), [
      [isPage2, leagueBody(MESSY_PAGE2, 2, false)],
      [isStandings, leagueBody(MESSY, 1, true)],
    ]);
    const { markup, text } = await renderLeague();
    expect(requested.some(isPage2), `${p} second standings page fetched`).toBe(true);
    const rows = tableRows(markup);
    const names = rows.map((r) => r.raw.match(/class="[^"]*teamLink[^"]*"[^>]*>([^<]*)</)?.[1] ?? "");
    expect(rows.length, `${p} 12 managers, the duplicate kept once (names: ${names.join(" | ")})`).toBe(12);
    const expected: [name: string, href: string, rank: number, gw: string, total: string, tone: string | null][] = [
      ["فريق الصقور", "/team/team", 1, "81", "1,412", "good"],
      ["🦞 Lobster Pot 🦞", "/team/lobster-pot", 2, "70", "1,411", "good"],
      ["21", "/team/team-21", 3, "64", "1,300", "good"],
      ["A Remarkably Long Team Name For Testing!", "/team/a-remarkably-long-team-name-for-testing", 4, "59", "1,250", "good"],
      ["Level Pegging", "/team/level-pegging", 5, "50", "1,200", "warn"],
      ["Dead Heat", "/team/dead-heat", 5, "48", "1,200", "warn"],
      ["New Kid", "/team/new-kid", 7, "−4", "1,100", null],
      ["#108", "/team/108", 8, "0", "0", null],
      ["Zürich Ñandú", "/team/zurich-nandu", 9, "40", "990", "bad"],
      ["Bart's Team", "/team/barts-team", 10, "39", "980", "bad"],
      ["Evilgnp.exe", "/team/evilgnp-exe", 11, "38", "970", "bad"],
      ["Last Orders", "/team/last-orders", 12, "37", "960", "bad"],
    ];
    expected.forEach(([name, , rank, gw, total, tone], i) => {
      const r = rows[i];
      const who = `${p} row ${i + 1} (${name})`;
      expect(r?.text, `${who}: name`).toContain(name);
      expect(r.text.startsWith(`${rank}`), `${who}: rank ${rank}, got "${r.text.slice(0, 16)}"`).toBe(true);
      expect(r.text.endsWith(`${gw} ${total}`), `${who}: ends "${gw} ${total}", got "…${r.text.slice(-20)}"`).toBe(true);
      expect(r.tone, `${who}: zone tint`).toBe(tone);
      if (tone) expect(r.text, `${who}: zone named for screen readers`).toContain(`(${en.table.zones[tone as "good" | "warn" | "bad"]})`);
      // The rank-8 row has no name to link: its entry id stands in (ids above are not slugs of other teams).
      if (name !== "#108") expect(r.href?.startsWith("/team/"), `${who}: linked`).toBe(true);
    });
    // Slugs are unique and readable where the name allows it.
    const hrefs = rows.map((r) => r.href);
    expect(new Set(hrefs).size, `${p} unique team links: ${hrefs.join(", ")}`).toBe(12);
    for (const [name, href] of expected.filter(([n]) => ["Zürich Ñandú", "Bart's Team", "21"].includes(n))) expect(hrefs, `${p} slug for ${name}`).toContain(href);
    expect(markup, `${p} bidi override stripped from names`).not.toContain("\u202E");
    expect(markup, `${p} zones key`).toContain(`aria-label="${en.table.zonesLabel}"`);
    // Crest initials are whole characters: no half of an emoji's surrogate pair.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(markup), `${p} no lone surrogates in the markup`).toBe(false);
    expect(rows[1].text, `${p} emoji team's initials`).toContain("🦞L 🦞 Lobster Pot 🦞");
    for (const z of Object.values(en.table.zones)) expect(text, `${p} zone "${z}" in the key`).toContain(z);
    // Movement: new entry, ties and a 1-place change both ways.
    expect(rows[0].text, `${p} leader up 1`).toContain(en.movement.up(1));
    expect(rows[1].text, `${p} second down 1`).toContain(en.movement.down(1));
    expect(rows[6].text, `${p} new entry`).toContain(en.movement.newEntry);
    // Summary: the RTL leader is isolated inside the hint so it can't reorder "1 point clear".
    expect(text, `${p} leader total with separator`).toContain(`${en.league.leader} 1,412`);
    expectOneOf(markup, en.league.leaderHint.map((f) => f("\u2068فريق الصقور\u2069", en.common.points(1))), `${p} isolated RTL leader with a 1-point gap`);
    expect(text, `${p} 12 managers`).toContain(`${en.league.managers} 12`);
    expect(text, `${p} complete table, not truncated`).not.toContain(en.league.truncated);
    expectOneOf(text, ["فريق الصقور"].map((n) => `${en.league.best("GW6")} 81 ${n}`), `${p} best GW6 score`);
    uninstall();
    vi.resetModules();
  }

  // B. The second page fails: the first page still shows, flagged as partial.
  {
    const p = "[page 2 down]";
    install(season("final"), [
      [isPage2, () => new Response("upstream", { status: 503 })],
      [isStandings, leagueBody(MESSY, 1, true)],
    ]);
    const { markup, text } = await renderLeague();
    const rows = tableRows(markup);
    expect(rows.length, `${p} only page 1's six managers`).toBe(6);
    expect(text, `${p} truncation hint`).toContain(en.league.truncated);
    expect(text, `${p} managers counts what is shown`).toContain(`${en.league.managers} 6`);
    // Fewer than ten shown: no zones (a partial table would mislabel the bottom four).
    expect(rows.every((r) => r.tone === null), `${p} no zone tint on a 6-row table`).toBe(true);
    uninstall();
    vi.resetModules();
  }

  // C. FPL's game file down (it is while the game updates): the table stands, the page says it's updating and retries slowly.
  {
    const p = "[bootstrap down]";
    const world = install(season("live-playing"), [[(u) => u.includes("/bootstrap-static/"), () => new Response("<html>maintenance</html>", { status: 503 })]]);
    const { markup, text } = await renderLeague();
    expect(text, `${p} updating notice`).toContain(en.league.updating);
    expect(text, `${p} no pre-season claim`).not.toContain(en.league.preSeason);
    expect(tableRows(markup).length, `${p} table still there`).toBe(world.standings.length);
    expect(text, `${p} leader still shown`).toContain(`${en.league.leader} ${formatNumber(world.standings[0].total)}`);
    expect(text, `${p} no best-GW without a gameweek`).not.toMatch(/Best GW\d/);
    expect(text, `${p} no awards without the gameweek list`).not.toContain(en.league.awardsHeading);
    expect(markup, `${p} still refreshes`).toContain('aria-label="Refresh"');
    const { services } = await import("@/lib/container");
    const model = await services.league.load(LEAGUE_ID);
    expect(model.kind === "ok" && model.refreshMs, `${p} slow retry`).toBe(5 * 60_000);
    uninstall();
    vi.resetModules();
  }

  // D. The league doesn't exist: a clear not-found message naming the id, no table.
  {
    const p = "[no league]";
    install(season("final"), [[isStandings, () => new Response("Not found", { status: 404 })]]);
    const { markup, text } = await renderLeague();
    expect(text, `${p} title`).toContain(en.league.notFoundTitle);
    expect(text, `${p} names the id`).toContain(en.league.notFoundLead(LEAGUE_ID));
    expect(tableRows(markup), `${p} no rows`).toEqual([]);
    uninstall();
    vi.resetModules();
  }

  // E. A real pre-season: FPL lists nobody in the table yet, only the managers who have joined.
  {
    const p = "[real preseason]";
    const joined = Array.from({ length: 6 }, (_, i) => ({ entry: 200 + i, entry_name: `Joiner ${i}`, player_first_name: "J", player_last_name: `${i}` }));
    install(season("preseason"), [[isStandings, leagueBody([], 1, false, joined)]]);
    const { markup, text } = await renderLeague();
    expect(text, `${p} empty title`).toContain(en.league.emptyTitle);
    expectOneOf(text, en.league.emptyBodies, `${p} pre-season wording`);
    expect(text, `${p} joined count`).toContain(en.league.joined(6).trim());
    expect(text, `${p} first deadline`).toContain(DEADLINE.preseason!);
    expect(text, `${p} pre-season label`).toContain(en.league.preSeason);
    expect(tableRows(markup), `${p} no rows`).toEqual([]);
    expect(text, `${p} no leader`).not.toContain(`${en.league.leader} `);
    uninstall();
    vi.resetModules();
  }

  // F. The managers' histories are slow: the table and headline numbers come first, the extras stream in after,
  //    and the finished page is exactly the one-pass page.
  {
    const p = "[stream]";
    const world = season("final");
    const slow: Routes = [
      [(u) => /\/entry\/\d+\/history\/$/.test(u), async (u: string) => {
        await new Promise((r) => setTimeout(r, 25));
        const route = world.routes.find(([match]) => match(u))!;
        return (route[1] as (x: string) => Response | Promise<Response>)(u);
      }],
    ];
    install(world, slow);
    const LeaguePage = (await import("@/app/page")).default;
    const el = (await LeaguePage()) as ReactElement<{ model: unknown; extras?: ReactElement }>;
    const boundary = el.props.extras as ReactElement<{ fallback: ReactElement; children: ReactElement }> | undefined;
    expect(boundary, `${p} extras deferred behind a boundary`).toBeTruthy();
    const shell = renderToStaticMarkup(cloneElement(el, { extras: boundary!.props.fallback }));
    const shellText = textOf(shell);
    expect(shellText, `${p} shell has the leader`).toContain(`${en.league.leader} ${formatNumber(world.standings[0].total)}`);
    expect(shellText, `${p} shell has the best score`).toContain(en.league.best("GW6"));
    const shellRows = tableRows(shell);
    expect(shellRows.length, `${p} shell table already lists everyone`).toBe(world.standings.length);
    world.standings.forEach((s, i) => expect(shellRows[i].text, `${p} shell row ${i + 1}`).toContain(s.entry_name));
    expect(shellText, `${p} no awards yet`).not.toContain(en.awards.titles.weekWinner);
    const child = boundary!.props.children as ReactElement<Record<string, unknown>> & { type: (props: unknown) => Promise<ReactElement> };
    const resolved = await child.type(child.props);
    const streamed = renderToStaticMarkup(cloneElement(el, { extras: resolved }));
    const { services } = await import("@/lib/container");
    const { LeagueView } = await import("@/components/views/LeagueView");
    const onePass = renderToStaticMarkup(<LeagueView model={(await services.league.load(LEAGUE_ID)) as never} />);
    expect(textOf(streamed), `${p} streamed page reads the same as the one-pass page`).toBe(textOf(onePass));
    expect(streamed, `${p} streamed markup equals the one-pass markup`).toBe(onePass);
    expect(textOf(streamed), `${p} awards arrived`).toContain(en.awards.titles.weekWinner);
    uninstall();
  }

  // G. A row FPL sends with no numbers at all (the rank-8 row above) next to valid ones in a single-page table.
  {
    const p = "[null numbers]";
    install(season("final"), [[isStandings, leagueBody([MESSY[0], { entry: 108, entry_name: "   ", player_name: null, total: null, event_total: null, rank: 2, last_rank: null }], 1, false)]]);
    const { markup } = await renderLeague();
    const rows = tableRows(markup);
    expect(rows.length, `${p} both rows`).toBe(2);
    expect(rows[1].text, `${p} blank name falls back to the entry id`).toContain("#108");
    expect(rows[1].text.endsWith("0 0"), `${p} missing numbers read as 0, got "…${rows[1].text.slice(-10)}"`).toBe(true);
    uninstall();
  }
});

// Each journey walks a whole page through many moments; give it room when the machine is busy.
vi.setConfig({ testTimeout: 120_000 });
