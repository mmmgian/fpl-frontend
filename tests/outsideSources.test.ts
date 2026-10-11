import { describe, expect, it, vi } from "vitest";
import { createFootballData, mapMatches, matchClub, normaliseClub } from "@/lib/europe/footballData";
import { bbcSlug, createBbcNews, isBbcUrl, parseBbcFeed } from "@/lib/news/bbcSport";

// ------------------------------------------------------------------------------------------------ BBC Sport

const item = (title: string, link: string, date: string, desc = "Summary") =>
  `<item><title><![CDATA[${title}]]></title><description><![CDATA[${desc}]]></description><link>${link}</link><pubDate>${date}</pubDate></item>`;
const feed = (...items: string[]) => `<?xml version="1.0"?><rss><channel><title><![CDATA[BBC Sport]]></title>${items.join("")}</channel></rss>`;

describe("parseBbcFeed", () => {
  const a = item("Old news", "https://www.bbc.com/sport/football/articles/aaa", "Mon, 05 Oct 2026 10:00:00 GMT");
  const b = item("Fresh news", "https://www.bbc.com/sport/football/articles/bbb?at_medium=RSS", "Sat, 10 Oct 2026 10:00:00 GMT", "A longer summary.");

  it("returns headlines newest first, passing title, summary and link through as published", () => {
    const h = parseBbcFeed(feed(a, b));
    expect(h.map((x) => x.title)).toEqual(["Fresh news", "Old news"]);
    expect(h[0]).toEqual({ title: "Fresh news", url: "https://www.bbc.com/sport/football/articles/bbb?at_medium=RSS", summary: "A longer summary.", publishedAt: "2026-10-10T10:00:00.000Z" });
  });
  it("unwraps CDATA and decodes entities in plain text", () => {
    const h = parseBbcFeed(feed(`<item><title>Spurs &amp; Arsenal &#8216;level&#8217; &lt;3</title><link>https://www.bbc.co.uk/sport/x</link></item>`));
    expect(h[0].title).toBe("Spurs & Arsenal ‘level’ <3");
    expect(h[0].summary).toBeNull();
    expect(h[0].publishedAt).toBeNull();
  });
  it("limits how many it returns", () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`T${i}`, `https://www.bbc.com/sport/${i}`, `Sat, 10 Oct 2026 1${i % 10}:00:00 GMT`));
    expect(parseBbcFeed(feed(...many))).toHaveLength(6);
    expect(parseBbcFeed(feed(...many), 3)).toHaveLength(3);
  });
  it("skips items with no title or no link, and links that are not the BBC's", () => {
    const h = parseBbcFeed(feed(
      item("", "https://www.bbc.com/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"),
      `<item><title>No link</title></item>`,
      item("Elsewhere", "https://evil.example/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"),
      item("Script", "javascript:alert(1)", "Sat, 10 Oct 2026 10:00:00 GMT"),
      item("Plain http", "http://www.bbc.com/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"),
      item("Lookalike", "https://www.bbc.com.evil.example/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"),
      item("Fine", "https://www.bbc.co.uk/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"),
    ));
    expect(h.map((x) => x.title)).toEqual(["Fine"]);
  });
  it("copes with garbage, an empty feed, and a bad date", () => {
    expect(parseBbcFeed("")).toEqual([]);
    expect(parseBbcFeed("<html>not a feed</html>")).toEqual([]);
    expect(parseBbcFeed(feed())).toEqual([]);
    expect(parseBbcFeed(feed(item("Odd date", "https://www.bbc.com/sport/1", "yesterday-ish")))[0].publishedAt).toBeNull();
  });
  it("only trusts BBC hosts", () => {
    expect(isBbcUrl("https://www.bbc.co.uk/sport")).toBe(true);
    expect(isBbcUrl("https://bbc.com/x")).toBe(true);
    for (const bad of ["https://notbbc.com/x", "https://bbc.com.evil.io/x", "ftp://bbc.com/x", "//bbc.com/x", "not a url", ""]) expect(isBbcUrl(bad), bad).toBe(false);
  });
});

describe("the BBC news port", () => {
  const club = { name: "Man City" };
  it("maps FPL club names to BBC feeds, and knows when it has none", () => {
    expect(bbcSlug("Man City")).toBe("manchester-city");
    expect(bbcSlug("  SPURS ")).toBe("tottenham-hotspur");
    expect(bbcSlug("Bournemouth")).toBe("afc-bournemouth");
    expect(bbcSlug("Nott'm Forest")).toBe("nottingham-forest");
    expect(bbcSlug("Atlantis FC")).toBeNull();
  });
  it("fetches the club's feed and credits it", async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response(feed(item("Hello", "https://www.bbc.com/sport/1", "Sat, 10 Oct 2026 10:00:00 GMT"))));
    const r = await createBbcNews(f as unknown as typeof fetch).headlines(club);
    expect(f.mock.calls[0][0]).toBe("https://feeds.bbci.co.uk/sport/football/teams/manchester-city/rss.xml");
    expect(r).toEqual({ items: [expect.objectContaining({ title: "Hello" })], creditUrl: "https://www.bbc.co.uk/sport/football/teams/manchester-city" });
  });
  it("makes no request for a club it has no feed for", async () => {
    const f = vi.fn();
    expect(await createBbcNews(f as unknown as typeof fetch).headlines({ name: "Atlantis FC" })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects when the BBC does not answer well, so the page can say so", async () => {
    const f = async () => new Response("no", { status: 503 });
    await expect(createBbcNews(f as unknown as typeof fetch).headlines(club)).rejects.toThrow(/503/);
  });
});

// ---------------------------------------------------------------------------------------- football-data.org

const fdTeams = [
  { id: 57, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" },
  { id: 65, name: "Manchester City FC", shortName: "Man City", tla: "MCI" },
  { id: 66, name: "Manchester United FC", shortName: "Man United", tla: "MUN" },
  { id: 73, name: "Tottenham Hotspur FC", shortName: "Tottenham", tla: "TOT" },
  { id: 351, name: "Nottingham Forest FC", shortName: "Nottm Forest", tla: "NOT" },
  { id: 397, name: "Brighton & Hove Albion FC", shortName: "Brighton Hove", tla: "BHA" },
  { id: 76, name: "Wolverhampton Wanderers FC", shortName: "Wolverhampton", tla: "WOL" },
  { id: 67, name: "Newcastle United FC", shortName: "Newcastle", tla: "NEW" },
  { id: 1044, name: "AFC Bournemouth", shortName: "Bournemouth", tla: "BOU" },
];

describe("matching FPL clubs to football-data.org teams", () => {
  it.each([
    ["Arsenal", "ARS", 57], ["Man City", "MCI", 65], ["Man Utd", "MUN", 66], ["Spurs", "TOT", 73], ["Nott'm Forest", "NFO", 351],
    ["Brighton", "BHA", 397], ["Wolves", "WOL", 76], ["Newcastle", "NEW", 67], ["Bournemouth", "BOU", 1044],
  ])("%s -> team %d", (name, short, id) => expect(matchClub(fdTeams, { name, short })?.id).toBe(id));

  it("does not guess: no match, or an ambiguous one, is null", () => {
    expect(matchClub(fdTeams, { name: "Atlantis", short: "ATL" })).toBeNull();
    expect(matchClub([{ id: 1, name: "Manchester City FC" }, { id: 2, name: "Manchester United FC" }], { name: "Manchester", short: "MAN" })).toBeNull();
  });
  it("normalises names the same way from both sides", () => {
    expect(normaliseClub("Manchester City FC")).toBe(normaliseClub("Man City"));
    expect(normaliseClub("AFC Bournemouth")).toBe("bournemouth");
    expect(normaliseClub("Brighton & Hove Albion FC")).toBe(normaliseClub("Brighton"));
  });
});

describe("mapMatches", () => {
  const m = (id: number, comp: string, date: string, home = 57, away = 99) => ({ id, utcDate: date, status: "SCHEDULED", competition: { name: comp }, homeTeam: { id: home, shortName: "Arsenal" }, awayTeam: { id: away, name: "Inter" } });
  it("keeps only European competitions, soonest first, and says which side the club is on", () => {
    const out = mapMatches([m(1, "Premier League", "2026-10-20T14:00:00Z"), m(3, "UEFA Champions League", "2026-11-04T20:00:00Z", 99, 57), m(2, "UEFA Champions League", "2026-10-21T20:00:00Z")], 57);
    expect(out.map((x) => [x.id, x.clubIsHome])).toEqual([[2, true], [3, false]]);
    expect(out[0]).toMatchObject({ competition: "UEFA Champions League", home: "Arsenal", away: "Inter", utcDate: "2026-10-21T20:00:00.000Z" });
  });
  it("copes with junk", () => {
    expect(mapMatches(undefined, 1)).toEqual([]);
    expect(mapMatches([null, {}, { id: "x" }, { id: 1 }], 1)).toEqual([]);
    expect(mapMatches([{ id: 1, competition: { name: "UEFA Champions League" }, utcDate: "soon" }], 1)[0]).toMatchObject({ utcDate: null, home: "TBC" });
  });
  it("limits how many it returns", () => {
    const many = Array.from({ length: 9 }, (_, i) => m(i + 1, "UEFA Champions League", `2026-11-0${i + 1}T20:00:00Z`));
    expect(mapMatches(many, 57)).toHaveLength(5);
  });
});

describe("the football-data.org port", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const routes = (over: Record<string, Response> = {}) =>
    vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
      const path = new URL(url).pathname;
      if (over[path]) return over[path];
      if (path.endsWith("/competitions/PL/teams")) return json({ teams: fdTeams });
      if (path.endsWith("/teams/57/matches")) return json({ matches: [{ id: 9, utcDate: "2026-10-21T20:00:00Z", competition: { name: "UEFA Champions League" }, homeTeam: { id: 57, shortName: "Arsenal" }, awayTeam: { id: 5, name: "Bayern" } }] });
      return json({}, 404);
    });

  it("is off, not broken, without an API key", () => {
    expect(createFootballData(undefined)).toBeNull();
    expect(createFootballData("")).toBeNull();
  });
  it("finds the club, then its European fixtures, sending the key", async () => {
    const f = routes();
    const out = await createFootballData("KEY", f as unknown as typeof fetch)!.fixtures({ name: "Arsenal", short: "ARS" });
    expect(out).toHaveLength(1);
    expect(f.mock.calls.map((c) => new URL(c[0]).pathname)).toEqual(["/v4/competitions/PL/teams", "/v4/teams/57/matches"]);
    expect(f.mock.calls[0][1]?.headers).toEqual({ "X-Auth-Token": "KEY" });
  });
  it("rejects clearly when the club can't be matched, and when the provider fails", async () => {
    await expect(createFootballData("K", routes() as unknown as typeof fetch)!.fixtures({ name: "Atlantis", short: "ATL" })).rejects.toThrow(/no club matching/);
    const down = routes({ "/v4/competitions/PL/teams": json({}, 429) });
    await expect(createFootballData("K", down as unknown as typeof fetch)!.fixtures({ name: "Arsenal", short: "ARS" })).rejects.toThrow(/429/);
  });
});
