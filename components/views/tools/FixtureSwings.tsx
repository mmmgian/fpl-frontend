import { Badge, Card, Crest, DataTable, FdrChip, getFormat, getT, type Column } from "@/components/ui";
import { fdrBand, minus, pickVariant } from "@/lib/domain";
import type { FixtureSwings as Swings, PlanCell, RotationPlan, RotationPlanPair, SwingRow } from "@/lib/domain/planning";
import styles from "../tools.module.css";
import { PLAN_SLOT } from "./CaptainShortlist";
import layout from "./layout.module.css";
import plan from "./planning.module.css";

/** "GW8" or "GW8–GW9". */
function span(gws: number[]): string {
  const t = getT();
  if (gws.length === 0) return "";
  return gws.length === 1 ? t.common.gw(gws[0]) : `${t.common.gw(gws[0])}\u2013${t.common.gw(gws[gws.length - 1])}`;
}

/** One club's gameweeks: a chip per match (two for a double), and a blank shown as a blank rather than as a match. */
function Run({ cells }: { cells: PlanCell[] }) {
  const t = getT();
  return (
    <span className={plan.run}>
      {cells.map((c) => (
        <span key={c.gw} className={plan.week}>
          <span className={plan.gw}>{t.common.gw(c.gw)}</span>
          {c.matches.length ? (
            c.matches.map((m, i) => (
              <FdrChip key={i} band={fdrBand(m.difficulty)} label={t.client.fdr.difficulty(fdrBand(m.difficulty))}>
                {m.opponent} ({m.home ? t.fixtures.homeShort : t.fixtures.awayShort})
              </FdrChip>
            ))
          ) : (
            <Badge>{t.tools.planning.swings.blank}</Badge>
          )}
        </span>
      ))}
    </span>
  );
}

/** Where fixtures turn over the next few gameweeks: the clubs whose average FPL difficulty eases the most, and hardens the most. */
export function FixtureSwings({ swings, variety }: { swings: Swings; variety: number }) {
  const t = getT();
  const s = t.tools.planning.swings;
  const f = getFormat();
  const soon = span(swings.soonGws);
  const later = span(swings.laterGws);
  const columns: Column<SwingRow>[] = [
    {
      key: "club",
      header: s.cols.club,
      rowHeader: true,
      cell: (r) => (
        <span className={plan.club}>
          <Crest code={r.clubCode} name={r.club} size={22} />
          <span className={layout.stack}>
            {r.club}
            {/* The run column hides on a phone, and it is the only place a blank or a double shows: keep it under the club. */}
            <span className={layout.sm}>
              <Run cells={r.cells} />
            </span>
          </span>
        </span>
      ),
    },
    { key: "soon", header: `${s.cols.soon} (${soon})`, align: "end", cell: (r) => f.oneDecimal(r.soon) },
    { key: "later", header: `${s.cols.later} (${later})`, align: "end", cell: (r) => f.oneDecimal(r.later) },
    // The change in difficulty, later against soon: below zero is easier.
    { key: "change", header: s.cols.change, align: "end", cell: (r) => <strong>{signed(f.oneDecimal(r.later - r.soon))}</strong> },
    { key: "run", header: s.cols.run, hideBelow: "sm", cell: (r) => <Run cells={r.cells} /> },
  ];
  const none = pickVariant(s.none, variety, PLAN_SLOT.swingsNone);
  const lists: [string, SwingRow[]][] = [
    [s.easing, swings.easing],
    [s.hardening, swings.hardening],
  ];
  return (
    <Card title={s.title}>
      <p className={styles.note}>{pickVariant(s.note, variety, PLAN_SLOT.swings)(soon, later)}</p>
      {swings.easing.length || swings.hardening.length ? (
        <div className={plan.swingsViews}>
          {lists.map(([title, rows]) => (
            <div key={title}>
              <h3 className={plan.viewTitle}>{title}</h3>
              <DataTable caption={title} hideCaption dense columns={columns} rows={rows} rowKey={(r) => r.teamId} empty={none} />
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.note}>{none}</p>
      )}
      <p className={plan.method}>{s.method}</p>
    </Card>
  );
}

/** "+0.8", "−0.8", "0.0": a proper minus sign, and a plus so a rise reads as one. */
function signed(n: string): string {
  if (/^[-\u2212]/.test(n)) return /^[-\u2212]0([.,]0+)?$/.test(n) ? n.slice(1) : minus(n);
  return /^0([.,]0+)?$/.test(n) ? n : `+${n}`;
}

/** Two clubs sharing one shirt: each gameweek, start the one with the easier match. A week where neither plays says so. */
export function RotationPairs({ rotation, variety }: { rotation: RotationPlan; variety: number }) {
  const t = getT();
  const p = t.tools.planning.pairs;
  const f = getFormat();
  const weeks = (r: RotationPlanPair) => (
    <span className={plan.run}>
      {r.weeks.map((w) => (
        <span key={w.gw} className={plan.week}>
          {w.club && w.difficulty !== null ? (
            <FdrChip band={fdrBand(w.difficulty)} label={t.client.fdr.difficulty(fdrBand(w.difficulty))}>
              {t.common.gw(w.gw)} {w.club}
            </FdrChip>
          ) : (
            <>
              <span className={plan.gw}>{t.common.gw(w.gw)}</span>
              <Badge tone="warning">{p.neither}</Badge>
            </>
          )}
          {w.matches >= 2 ? <Badge tone="positive">{p.double}</Badge> : null}
        </span>
      ))}
    </span>
  );
  const columns: Column<RotationPlanPair>[] = [
    {
      key: "pair",
      header: p.cols.pair,
      rowHeader: true,
      cell: (r) => (
        <span className={layout.stack}>
          <strong>{r.clubs.join(" + ")}</strong>
          {/* Which club to start each week is the whole point of a pair, so on a phone it stays, under the pair. */}
          <span className={layout.sm}>{weeks(r)}</span>
        </span>
      ),
    },
    { key: "average", header: p.cols.average, align: "end", cell: (r) => f.oneDecimal(r.average) },
    { key: "weeks", header: p.cols.weeks, hideBelow: "sm", cell: weeks },
  ];
  const best = rotation.pairs[0];
  return (
    <Card title={p.title}>
      {best ? <p className={styles.note}>{pickVariant(p.note, variety, PLAN_SLOT.pairs)(rotation.gws.length, best.clubs.join(" + "), f.oneDecimal(best.average))}</p> : null}
      <DataTable caption={p.title} hideCaption dense columns={columns} rows={rotation.pairs} rowKey={(r) => r.clubs.join("-")} empty={pickVariant(p.none, variety, PLAN_SLOT.pairsNone)} />
      <p className={plan.method}>{p.method}</p>
    </Card>
  );
}
