import { Badge, Card, Crest, DataTable, FdrChip, gameweekName, getFormat, getT, type Column } from "@/components/ui";
import { fdrBand, pickVariant, type CaptainCandidate } from "@/lib/domain";
import type { CaptainShortlist as Shortlist } from "@/lib/domain/planning";
import styles from "../tools.module.css";
import layout from "./layout.module.css";
import plan from "./planning.module.css";

/** Wording slots of their own, clear of the page's (1-17), so these cards don't change wording in step with the others. */
export const PLAN_SLOT = { captain: 40, captainNone: 41, swings: 42, swingsNone: 43, pairs: 44, pairsNone: 45, setPieces: 46 } as const;

const pct = (p: number) => Math.round(p * 100);

/**
 * Next gameweek's captain shortlist: the safest armband, the likeliest haul and the Triple Captain punt, from the lab's
 * simulation. Every simulated figure is labelled as such; FPL ownership is shown beside it, not mixed in.
 */
export function CaptainShortlist({ captain, variety }: { captain: Shortlist; variety: number }) {
  const t = getT();
  const c = t.tools.planning.captain;
  const f = getFormat();
  const percent = (p: number) => t.common.percent(String(pct(p)));
  const gwName = gameweekName(`Gameweek ${captain.gw}`);
  const opponents = (r: CaptainCandidate) =>
    r.opponents.map((o, i) => (
      <FdrChip key={i} band={fdrBand(o.difficulty)} label={t.client.fdr.difficulty(fdrBand(o.difficulty))}>
        {o.short} ({o.home ? t.fixtures.homeShort : t.fixtures.awayShort})
      </FdrChip>
    ));
  const columns: Column<CaptainCandidate>[] = [
    {
      key: "player",
      header: c.cols.player,
      rowHeader: true,
      cell: (r) => (
        <span className={styles.player}>
          <Crest code={r.clubCode} name={r.club} size={22} />
          <span className={styles.playerText}>
            <span className={styles.playerName}>{r.name}</span>
            <span className={styles.playerMeta}>
              {r.club} · {t.tools.positionShort[r.positionId]}
            </span>
            {/* On a phone the fixture column hides; the opponent is the point of a captain pick, so it moves here. */}
            {r.opponents.length ? <span className={layout.sm}>{opponents(r)}</span> : null}
          </span>
        </span>
      ),
    },
    {
      key: "fixture",
      header: c.cols.fixture,
      hideBelow: "sm",
      cell: (r) => (
        <span className={plan.run}>
          {opponents(r)}
        </span>
      ),
    },
    { key: "mean", header: c.cols.mean, align: "end", cell: (r) => <strong>{f.oneDecimal(r.mean)}</strong> },
    { key: "p10", header: c.cols.p10, align: "end", cell: (r) => percent(r.p10) },
    { key: "p15", header: c.cols.p15, align: "end", cell: (r) => percent(r.p15) },
    { key: "owned", header: c.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.ownership)) },
  ];
  const views: [string, CaptainCandidate[]][] = [
    [c.views.safest, captain.safest],
    [c.views.haul, captain.haul],
    [c.views.punt, captain.punt],
  ];
  const safe = captain.safest[0];
  const haul = captain.haul[0];
  const punt = captain.punt[0];
  const none = pickVariant(c.none, variety, PLAN_SLOT.captainNone);
  const facts = [
    captain.blanks.length ? c.blanks(captain.blanks.length, captain.blanks.join(", "), gwName) : null,
    captain.doubles.length ? c.doubles(captain.doubles.length, captain.doubles.join(", "), gwName) : null,
  ].filter((x): x is string => x !== null);
  return (
    <Card title={c.title(gwName)} actions={<Badge tone="accent">{t.tools.planning.derived}</Badge>}>
      {safe && haul && punt ? (
        <p className={styles.note}>{pickVariant(c.note, variety, PLAN_SLOT.captain)(gwName, safe.name, f.oneDecimal(safe.mean), haul.name, percent(haul.p10), punt.name, percent(punt.p15))}</p>
      ) : null}
      {facts.length ? (
        <ul className={plan.facts}>
          {facts.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <div className={plan.views}>
        {views.map(([title, rows]) => (
          <div key={title}>
            <h3 className={plan.viewTitle}>{title}</h3>
            <DataTable caption={title} hideCaption dense stickyFirst columns={columns} rows={rows} rowKey={(r) => r.id} empty={none} />
          </div>
        ))}
      </div>
      <p className={plan.method}>{c.method(f.number(captain.trials))}</p>
    </Card>
  );
}
