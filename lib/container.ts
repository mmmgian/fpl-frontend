/**
 * Composition root: the one place where adapters are wired to use cases.
 * Pages import `services` from here; nothing else imports an adapter and a service together.
 */
import { avatarGateway } from "./avatars";
import { historyGateway } from "./backend";
import { createFootballData } from "./europe/footballData";
import { createBbcNews } from "./news/bbcSport";
import { fplGateway } from "./fpl";
import { timesGateway } from "./times";
import { createBonusService } from "./services/bonus";
import { createClubService } from "./services/club";
import { createFixturesService } from "./services/fixtures";
import { createHistoryService } from "./services/history";
import { createLeagueService } from "./services/league";
import { createTeamService } from "./services/team";
import { createTimesService } from "./services/times";
import { createToolsService } from "./services/tools";

/** Avatars replace managers' own badges too, for a consistent look. Set AVATARS_REPLACE_BADGES=false to keep their badges. */
const replaceBadges = process.env.AVATARS_REPLACE_BADGES !== "false";

export const services = {
  league: createLeagueService(fplGateway, { avatars: avatarGateway, replaceBadges }),
  team: createTeamService(fplGateway, { avatars: avatarGateway }),
  bonus: createBonusService(fplGateway),
  fixtures: createFixturesService(fplGateway),
  club: createClubService(fplGateway, { europe: createFootballData(process.env.FOOTBALL_DATA_API_KEY), news: createBbcNews() }),
  history: createHistoryService(historyGateway, avatarGateway, { replaceBadges }),
  times: createTimesService(timesGateway),
  tools: createToolsService(fplGateway, { avatars: avatarGateway, replaceBadges }),
};
