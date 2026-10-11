/**
 * Club headlines from BBC Sport's club RSS feeds. The BBC lets a site carry its feeds unchanged, with a visible
 * credit and a hyperlink back (bbc.co.uk/usingthebbc/terms-of-use, section 15), for non-commercial use. So: titles,
 * summaries and links are passed through as published, and the page credits BBC Sport beside them.
 */
import type { Headline } from "../domain";
import type { NewsPort } from "../services/ports";

/** FPL club name -> BBC Sport team slug. A club not listed has no headlines rather than a guessed feed. */
const SLUG: Record<string, string> = {
  arsenal: "arsenal",
  "aston villa": "aston-villa",
  bournemouth: "afc-bournemouth",
  brentford: "brentford",
  brighton: "brighton-and-hove-albion",
  burnley: "burnley",
  chelsea: "chelsea",
  coventry: "coventry-city",
  "crystal palace": "crystal-palace",
  everton: "everton",
  fulham: "fulham",
  hull: "hull-city",
  ipswich: "ipswich-town",
  leeds: "leeds-united",
  leicester: "leicester-city",
  liverpool: "liverpool",
  "man city": "manchester-city",
  "man utd": "manchester-united",
  newcastle: "newcastle-united",
  "nott'm forest": "nottingham-forest",
  southampton: "southampton",
  sunderland: "sunderland",
  spurs: "tottenham-hotspur",
  "west ham": "west-ham-united",
  wolves: "wolverhampton-wanderers",
};

export const bbcSlug = (clubName: string): string | null => SLUG[clubName.trim().toLowerCase()] ?? null;
export const bbcFeedUrl = (slug: string) => `https://feeds.bbci.co.uk/sport/football/teams/${slug}/rss.xml`;
/** Where the credit links to. */
export const bbcPageUrl = (slug: string) => `https://www.bbc.co.uk/sport/football/teams/${slug}`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[e.toLowerCase()] ?? whole;
    })
    .trim();
}

/** The text of the first <tag> in `block`, with CDATA unwrapped and entities decoded; null if absent or empty. */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdata ? cdata[1].trim() : decode(m[1]);
  return text === "" ? null : text;
}

/** Only links that really go to the BBC are passed on: a feed can't make this page link anywhere else. */
export function isBbcUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /(^|\.)bbc\.(co\.uk|com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Items of a BBC RSS feed, newest first. Anything malformed is skipped, never thrown. */
export function parseBbcFeed(xml: string, max = 6): Headline[] {
  const items: Headline[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title = tag(m[1], "title");
    const url = tag(m[1], "link");
    if (!title || !url || !isBbcUrl(url)) continue;
    const when = tag(m[1], "pubDate");
    const time = when ? Date.parse(when) : NaN;
    items.push({ title, url, summary: tag(m[1], "description"), publishedAt: Number.isNaN(time) ? null : new Date(time).toISOString() });
  }
  return items.sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0)).slice(0, max);
}

/** Cached for 15 minutes (the feed's own time-to-live), and given up on after 5 seconds. */
export function createBbcNews(fetcher: typeof fetch = fetch): NewsPort {
  return {
    async headlines(club) {
      const slug = bbcSlug(club.name);
      if (!slug) return null;
      const res = await fetcher(bbcFeedUrl(slug), { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } } as RequestInit);
      if (!res.ok) throw new Error(`BBC Sport feed answered ${res.status}`);
      return { items: parseBbcFeed(await res.text()), creditUrl: bbcPageUrl(slug) };
    },
  };
}
