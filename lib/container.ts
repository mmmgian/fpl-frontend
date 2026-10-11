/**
 * Composition root: the one place where adapters are wired to use cases.
 * Pages import `services` from here; nothing else imports an adapter and a service together.
 */
import { historyGateway } from "./backend";
import { fplGateway } from "./fpl";
import { createBonusService } from "./services/bonus";
import { createFixturesService } from "./services/fixtures";
import { createHistoryService } from "./services/history";
import { createLeagueService } from "./services/league";
import { createTeamService } from "./services/team";

export const services = {
  league: createLeagueService(fplGateway),
  team: createTeamService(fplGateway),
  bonus: createBonusService(fplGateway),
  fixtures: createFixturesService(fplGateway),
  history: createHistoryService(historyGateway),
};
