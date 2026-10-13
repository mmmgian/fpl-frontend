import { slugify, clubIdentity, clubMatches, clubNews, clubOutlook, clubPlayers, currentEvent, formGuide, gwStatus, predictedXI, varietyKey, type ClubMatch } from "../domain";
import type { ClubMatchView, ClubModel, Outside } from "./models";
import type { EuropePort, FplPort, NewsPort, ServiceOptions } from "./ports";

/** Runs one outside lookup so that its failure is a state of the page, not an error of the page. */
async function outside<T>(source: unknown, run: () => Promise<T | null>): Promise<Outside<T>> {
  if (!source) return { status: "off" };
  try {
    const items = await run();
    return items === null ? { status: "unavailable" } : { status: "ok", items };
  } catch {
    return { status: "unavailable" };
  }
}

/** Use case: one Premier League club, with FPL's own facts first and outside sources as optional extras. */
export function createClubService(
  fpl: Pick<FplPort, "bootstrap" | "allFixtures">,
  sources: { europe: EuropePort | null; news: NewsPort | null } = { europe: null, news: null },
  { now = () => new Date() }: Pick<ServiceOptions, "now"> = {},
) {
  return {
    /** What an address means: a club number ("1") or a club's name as written in the address ("man-city"). Null if neither. */
    async resolve(param: string): Promise<{ id: number; slug: string } | null> {
      const teams = await fpl.bootstrap().then((b) => b.teams).catch(() => []);
      const slugOf = (t: { name: string }) => slugify(t.name);
      const found = /^[1-9]\d{0,5}$/.test(param) ? teams.find((t) => t.id === Number(param)) : teams.find((t) => slugOf(t) === param) ?? teams.find((t) => slugify(t.short_name) === param);
      if (found) return { id: found.id, slug: slugOf(found) };
      return /^[1-9]\d{0,5}$/.test(param) ? { id: Number(param), slug: param } : null;
    },

    /** Just who the club is, for page titles: one cached request, none of the extras. Null if unknown or FPL is unreachable. */
    async identify(clubId: number) {
      const team = await fpl.bootstrap().then((b) => b.teams.find((t) => t.id === clubId)).catch(() => undefined);
      return team ? clubIdentity(team) : null;
    },

    async load(clubId: number): Promise<ClubModel> {
      const bootstrap = await fpl.bootstrap();
      const team = bootstrap.teams.find((t) => t.id === clubId);
      if (!team) return { kind: "not-found" };
      const club = clubIdentity(team);

      // The schedule is core: without it the page has little to say, so its failure is the page's failure.
      // The outside sources start now and run alongside it; each one failing only empties its own card.
      const europe = outside(sources.europe, async () => (await sources.europe!.fixtures({ name: club.name, short: club.short })));
      const headlines = outside(sources.news, () => sources.news!.headlines({ name: club.name }));
      const schedule = await fpl.allFixtures();

      const view = (m: ClubMatch): ClubMatchView => {
        const { opponentId, ...rest } = m;
        const o = bootstrap.teams.find((t) => t.id === opponentId);
        return { ...rest, opponent: o ? clubIdentity(o) : { id: opponentId, name: "Unknown club", short: "?", code: 0 } };
      };
      const { next, recent } = clubMatches(schedule, clubId);
      const players = clubPlayers(bootstrap.elements, clubId);
      const form = formGuide(recent);
      const news = clubNews(players);
      const at = now();
      const current = currentEvent(bootstrap.events);

      return {
        kind: "ok",
        club,
        form,
        next: next.map(view),
        recent: recent.map(view),
        news,
        lineup: predictedXI(players),
        europe: await europe,
        headlines: await headlines,
        outlook: clubOutlook(form, next, players, news),
        variety: current ? varietyKey(current.id, gwStatus(current, at), at) : varietyKey(0, "upcoming", at),
      };
    },
  };
}
