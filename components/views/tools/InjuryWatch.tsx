import { Badge, DataTable, getFormat, getT, type Column } from "@/components/ui";
import type { FlaggedPlayer, LeagueTools } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import layout from "./layout.module.css";
import styles from "./leagueTools.module.css";
import { LEAGUE_SLOT, PlayerCell, say } from "./shared";

const TONE = { d: "warning", i: "live", s: "live", u: "live" } as const;
/** Owning teams named in a row before the rest are counted. */
const NAMED = 3;

/**
 * League-owned players FPL has flagged, with FPL's own status, chance of playing and news, and how many league
 * managers own and start each one. Most started first: that's where a knock costs the league the most.
 */
export function InjuryWatch({ injuries, squads, variety }: { injuries: NonNullable<LeagueTools["injuries"]>; squads: number; variety: number }) {
  const t = getT();
  const f = getFormat();
  const i = t.tools.leagueTools.injuries;
  const top = injuries.rows[0];
  const teams = (r: FlaggedPlayer) => `${r.teams.slice(0, NAMED).join(", ")}${r.teams.length > NAMED ? ` ${i.more(r.teams.length - NAMED)}` : ""}`;
  const columns: Column<FlaggedPlayer>[] = [
    {
      key: "player",
      header: i.cols.player,
      rowHeader: true,
      // The news, owners and owning teams hide on narrower screens; they are why the row matters, so they move under the name.
      cell: (r) => (
        <PlayerCell p={r}>
          <span className={`${layout.md} ${layout.rows}`}>
            <span>{r.news || i.noNews}</span>
            {r.teams.length ? (
              <span>
                {i.cols.teams}: {teams(r)}
              </span>
            ) : null}
          </span>
          <span className={layout.sm}>
            {i.cols.owners}: {r.owners}
          </span>
        </PlayerCell>
      ),
    },
    { key: "status", header: i.cols.status, cell: (r) => <span className={tools.status}><Badge tone={TONE[r.status]}>{i.statuses[r.status]}</Badge></span> },
    { key: "chance", header: i.cols.chance, align: "end", cell: (r) => (r.chance === null ? <span className={styles.muted}>{i.noChance}</span> : t.common.percent(f.number(r.chance))) },
    { key: "starters", header: i.cols.starters, align: "end", cell: (r) => <strong>{r.starters}</strong> },
    { key: "owners", header: i.cols.owners, align: "end", hideBelow: "sm", cell: (r) => r.owners },
    { key: "news", header: i.cols.news, hideBelow: "md", cell: (r) => <span className={styles.news}>{r.news || i.noNews}</span> },
    {
      key: "teams",
      header: i.cols.teams,
      hideBelow: "md",
      cell: (r) => (
        <span className={styles.muted}>{teams(r)}</span>
      ),
    },
  ];
  return (
    <>
      <p className={tools.note}>{top ? say(i.note, variety, LEAGUE_SLOT.injuries)(injuries.matching, top.name, top.starters) : say(i.clear, variety, LEAGUE_SLOT.injuries)(squads)}</p>
      {top ? (
        <>
          <DataTable caption={i.title} hideCaption dense columns={columns} rows={injuries.rows} rowKey={(r) => r.id} />
          {injuries.matching > injuries.rows.length ? <p className={tools.count}>{i.showing(injuries.rows.length, injuries.matching)}</p> : null}
        </>
      ) : null}
    </>
  );
}
