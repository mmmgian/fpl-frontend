import { CaptainBadge, ClubLink, Crest, DataTable, getFormat, getT, type Column } from "@/components/ui";
import type { LeagueTemplate as TemplateModel, ManagerUniques } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";
import { LEAGUE_SLOT, say, TeamName } from "./shared";

/** The league's template: the most-owned legal eleven across the squads read, and how much of it each team owns. */
export function LeagueTemplate({ template, variety, slugs }: { template: TemplateModel; variety: number; slugs: Map<number, string> }) {
  const t = getT();
  const f = getFormat();
  const m = t.tools.leagueTools.template;
  const everyone = template.lines.flatMap((l) => l.players);
  const top = [...everyone].sort((a, b) => b.owners - a.owners || b.starters - a.starters || a.id - b.id)[0];
  const size = everyone.length;
  const columns: Column<TemplateModel["coverage"][number]>[] = [
    { key: "team", header: m.cols.team, rowHeader: true, cell: (r) => <TeamName entry={r.entry} name={r.teamName} slugs={slugs} /> },
    { key: "owned", header: m.cols.owned, align: "end", cell: (r) => <strong>{m.ownedOf(r.owned, size)}</strong> },
  ];
  return (
    <>
      {top ? <p className={tools.note}>{say(m.note, variety, LEAGUE_SLOT.template)(template.managers, template.formation ?? m.mixed, top.name, t.common.percent(f.oneDecimal(top.share)))}</p> : null}
      <div className={tools.lines}>
        {template.lines.map((line) => (
          <div key={line.positionId} className={tools.line}>
            <span className={tools.lineName}>{t.team.positions[line.positionId]}</span>
            <div className={tools.tiles}>
              {line.players.map((p) => (
                <div key={p.id} className={tools.tile}>
                  <ClubLink name={p.club}>
                    <Crest code={p.clubCode} name={p.club} size={30} />
                  </ClubLink>
                  <span className={tools.tileName}>{p.name}</span>
                  <span className={tools.xp}>
                    <ClubLink name={p.club}>{p.club}</ClubLink> · {t.common.percent(f.oneDecimal(p.share))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <h3 className={styles.subhead}>{m.coverage}</h3>
      <DataTable caption={m.coverage} hideCaption dense columns={columns} rows={template.coverage} rowKey={(r) => r.entry} />
    </>
  );
}

/** Each team's unique players: owned by them and by nobody else whose squad was read. */
export function Differentials({ rows, variety, slugs }: { rows: ManagerUniques[]; variety: number; slugs: Map<number, string> }) {
  const t = getT();
  const d = t.tools.leagueTools.differentials;
  const bench = t.tools.leagueTools.bench;
  const most = [...rows].sort((a, b) => b.players.length - a.players.length || a.rank - b.rank)[0];
  const columns: Column<ManagerUniques>[] = [
    {
      key: "team",
      header: d.cols.team,
      rowHeader: true,
      cell: (r) => (
        <span className={tools.playerText}>
          <TeamName entry={r.entry} name={r.teamName} slugs={slugs} />
          <span className={tools.playerMeta}>{r.manager}</span>
        </span>
      ),
    },
    {
      key: "players",
      header: d.cols.players,
      cell: (r) =>
        r.players.length === 0 ? (
          <span className={styles.muted}>{d.none}</span>
        ) : (
          <ul className={styles.names}>
            {r.players.map((p) => (
              <li key={p.id}>
                <ClubLink name={p.club}>
                  <Crest code={p.clubCode} name={p.club} size={18} />
                </ClubLink>
                <span>{p.name}</span>
                {p.captain ? <CaptainBadge /> : null}
                {p.starter ? null : <span className={styles.bench}>({bench})</span>}
              </li>
            ))}
          </ul>
        ),
    },
  ];
  return (
    <>
      <p className={tools.note}>
        {most && most.players.length > 0 ? say(d.note, variety, LEAGUE_SLOT.differentials)(most.teamName, most.players.length) : say(d.allShared, variety, LEAGUE_SLOT.differentials)(rows.length)}
      </p>
      <DataTable caption={d.title} hideCaption dense columns={columns} rows={rows} rowKey={(r) => r.entry} />
    </>
  );
}
