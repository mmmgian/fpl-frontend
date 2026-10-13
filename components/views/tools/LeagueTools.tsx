import { Card, gameweekName, getT } from "@/components/ui";
import type { LeagueTools as LeagueToolsModel } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";
import { ChipTracker } from "./ChipTracker";
import { InjuryWatch } from "./InjuryWatch";
import { Differentials, LeagueTemplate } from "./LeagueTemplate";
import { RivalCompare } from "./RivalCompare";

/** Section ids, also the jump links. */
export const LEAGUE_ANCHORS = {
  chips: "chip-tracker",
  injuries: "injury-watch",
  template: "template",
  differentials: "differentials",
  rivals: "head-to-head",
} as const;

/**
 * Which of the league tools to show: the injury watch leads the page's "Before the deadline" group, the rest sit in
 * "Your league".
 */
export type LeaguePart = "injuries" | "league";

/** "As picked for GW7. GW8 picks appear after its deadline.", when the league's picks are older than the next deadline. */
export function picksNote(
  gw: number | null,
  next: number | null,
  chips = false,
): string | null {
  if (gw === null || next === null || gw >= next) return null;
  const lt = getT().tools.leagueTools;
  const name = (n: number) => gameweekName(`Gameweek ${n}`);
  return (chips ? lt.chipsFrom : lt.picksFrom)(name(gw), name(next));
}

/** The jump links for the league tools that have something to show, as `<li>` items for the page's nav list. */
export function LeagueToolsNav({
  league,
  only = "league",
}: {
  league: LeagueToolsModel | null;
  only?: LeaguePart;
}) {
  if (!league) return null;
  const lt = getT().tools.leagueTools;
  const items: [string, string][] = [];
  if (only === "injuries") {
    if (league.injuries)
      items.push([LEAGUE_ANCHORS.injuries, lt.injuries.title]);
  } else {
    if (league.chips) items.push([LEAGUE_ANCHORS.chips, lt.chips.title]);
  }
  if (only === "league" && league.template)
    items.push([LEAGUE_ANCHORS.template, lt.template.title]);
  if (only === "league" && league.differentials)
    items.push([LEAGUE_ANCHORS.differentials, lt.differentials.title]);
  if (only === "league" && league.rivals)
    items.push([LEAGUE_ANCHORS.rivals, lt.rivals.title]);
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
export function LeagueToolsSections({
  league,
  variety,
  keep,
  slugs,
  only = "league",
}: {
  league: LeagueToolsModel | null;
  variety: number;
  keep: Record<string, string>;
  slugs: Map<number, string>;
  only?: LeaguePart;
}) {
  if (!league) return null;
  const t = getT();
  const lt = t.tools.leagueTools;
  const scope =
    league.covered < league.total
      ? lt.scope(league.covered, league.total)
      : null;
  const squadNote =
    league.gw !== null
      ? lt.squadsFrom(
          gameweekName(`Gameweek ${league.gw}`),
          league.squads,
          league.covered,
        )
      : null;
  const pending = picksNote(league.gw, league.nextGw);
  // "Squads as picked for GW7." already names the week; only say that the next week's picks are still hidden.
  const hidden =
    pending && league.nextGw !== null
      ? lt.nextHidden(gameweekName(`Gameweek ${league.nextGw}`))
      : null;
  const squadScope =
    [scope, squadNote, hidden].filter(Boolean).join(" ") || null;

  if (only === "injuries") {
    return league.injuries ? (
      <section id={LEAGUE_ANCHORS.injuries} className={tools.full}>
        <Card title={lt.injuries.title} headingLevel={2} className={tools.full}>
          <InjuryWatch
            injuries={league.injuries}
            squads={league.squads}
            variety={variety}
          />
          {squadScope ? <p className={styles.scope}>{squadScope}</p> : null}
        </Card>
      </section>
    ) : null;
  }

  return (
    <>
      {league.chips ? (
        <section id={LEAGUE_ANCHORS.chips} className={tools.full}>
          <Card title={lt.chips.title} headingLevel={2} className={tools.full}>
            <ChipTracker
              chips={league.chips}
              variety={variety}
              slugs={slugs}
              scope={
                [scope, picksNote(league.gw, league.chips.nextGw, true)]
                  .filter(Boolean)
                  .join(" ") || null
              }
            />
          </Card>
        </section>
      ) : null}
      {league.template ? (
        <section id={LEAGUE_ANCHORS.template} className={tools.full}>
          <Card
            title={lt.template.title}
            headingLevel={2}
            className={tools.full}
          >
            <LeagueTemplate
              template={league.template}
              variety={variety}
              slugs={slugs}
            />
            {squadScope ? <p className={styles.scope}>{squadScope}</p> : null}
          </Card>
        </section>
      ) : null}
      {league.differentials ? (
        <section id={LEAGUE_ANCHORS.differentials} className={tools.full}>
          <Card
            title={lt.differentials.title}
            headingLevel={2}
            className={tools.full}
          >
            <Differentials
              rows={league.differentials}
              variety={variety}
              slugs={slugs}
            />
          </Card>
        </section>
      ) : null}
      {league.rivals ? (
        <section id={LEAGUE_ANCHORS.rivals} className={tools.full}>
          <Card title={lt.rivals.title} headingLevel={2} className={tools.full}>
            {pending ? <p className={tools.note}>{pending}</p> : null}
            <RivalCompare
              rivals={league.rivals}
              variety={variety}
              keep={keep}
            />
          </Card>
        </section>
      ) : null}
    </>
  );
}
