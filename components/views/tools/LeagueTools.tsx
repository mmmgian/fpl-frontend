import { Card, gameweekName, getT } from "@/components/ui";
import type { LeagueTools as LeagueToolsModel } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";
import { ChipTracker } from "./ChipTracker";
import { InjuryWatch } from "./InjuryWatch";
import { Differentials, LeagueTemplate } from "./LeagueTemplate";
import { RivalCompare } from "./RivalCompare";

/** Section ids, also the jump links. */
export const LEAGUE_ANCHORS = { chips: "chip-tracker", injuries: "injury-watch", template: "template", differentials: "differentials", rivals: "head-to-head" } as const;

/** The jump links for the league tools that have something to show, as `<li>` items for the page's nav list. */
export function LeagueToolsNav({ league }: { league: LeagueToolsModel | null }) {
  if (!league) return null;
  const lt = getT().tools.leagueTools;
  const items: [string, string][] = [];
  if (league.chips) items.push([LEAGUE_ANCHORS.chips, lt.chips.title]);
  if (league.injuries) items.push([LEAGUE_ANCHORS.injuries, lt.injuries.title]);
  if (league.template) items.push([LEAGUE_ANCHORS.template, lt.template.title]);
  if (league.differentials) items.push([LEAGUE_ANCHORS.differentials, lt.differentials.title]);
  if (league.rivals) items.push([LEAGUE_ANCHORS.rivals, lt.rivals.title]);
  return (
    <>
      {items.map(([id, label]) => (
        <li key={id}>
          <a href={`#${id}`}>{label}</a>
        </li>
      ))}
    </>
  );
}

/**
 * The league-aware tools: chips, flagged players, the league template, each team's differentials and a head to head.
 * Each card only appears when its data arrived; a partial read says how much of the league it covers.
 */
export function LeagueToolsSections({ league, variety, keep, slugs }: { league: LeagueToolsModel | null; variety: number; keep: Record<string, string>; slugs: Map<number, string> }) {
  if (!league) return null;
  const t = getT();
  const lt = t.tools.leagueTools;
  const scope = league.covered < league.total ? lt.scope(league.covered, league.total) : null;
  const squadNote = league.gw !== null ? lt.squadsFrom(gameweekName(`Gameweek ${league.gw}`), league.squads, league.covered) : null;
  const squadScope = [scope, squadNote].filter(Boolean).join(" ") || null;

  return (
    <>
      {league.chips ? (
        <section id={LEAGUE_ANCHORS.chips} className={tools.full}>
          <Card title={lt.chips.title} headingLevel={2} className={tools.full}>
            <ChipTracker chips={league.chips} variety={variety} slugs={slugs} scope={scope} />
          </Card>
        </section>
      ) : null}
      {league.injuries ? (
        <section id={LEAGUE_ANCHORS.injuries} className={tools.full}>
          <Card title={lt.injuries.title} headingLevel={2} className={tools.full}>
            <InjuryWatch injuries={league.injuries} squads={league.squads} variety={variety} />
            {squadScope ? <p className={styles.scope}>{squadScope}</p> : null}
          </Card>
        </section>
      ) : null}
      {league.template ? (
        <section id={LEAGUE_ANCHORS.template} className={tools.full}>
          <Card title={lt.template.title} headingLevel={2} className={tools.full}>
            <LeagueTemplate template={league.template} variety={variety} slugs={slugs} />
            {squadScope ? <p className={styles.scope}>{squadScope}</p> : null}
          </Card>
        </section>
      ) : null}
      {league.differentials ? (
        <section id={LEAGUE_ANCHORS.differentials} className={tools.full}>
          <Card title={lt.differentials.title} headingLevel={2} className={tools.full}>
            <Differentials rows={league.differentials} variety={variety} slugs={slugs} />
          </Card>
        </section>
      ) : null}
      {league.rivals ? (
        <section id={LEAGUE_ANCHORS.rivals} className={tools.full}>
          <Card title={lt.rivals.title} headingLevel={2} className={tools.full}>
            <RivalCompare rivals={league.rivals} variety={variety} keep={keep} />
          </Card>
        </section>
      ) : null}
    </>
  );
}
