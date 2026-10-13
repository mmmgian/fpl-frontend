import { Badge, Card, Crest, DataTable, getT, type Column } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { SetPieceRow, SetPieceTaker } from "@/lib/domain/planning";
import styles from "../tools.module.css";
import { PLAN_SLOT } from "./CaptainShortlist";
import plan from "./planning.module.css";

/** One set piece's takers in FPL's order, each flagged if doubtful or out. */
function Takers({ takers }: { takers: SetPieceTaker[] }) {
  const t = getT();
  const s = t.tools.planning.setPieces;
  if (takers.length === 0) return <span className={plan.muted}>{s.noneListed}</span>;
  return (
    <ol className={plan.takers}>
      {takers.map((k) => (
        <li key={k.id} className={plan.taker}>
          <span className={plan.order} aria-hidden="true">
            {k.order}.
          </span>
          <span>{k.name}</span>
          {k.fitness === "out" ? <Badge tone="live">{s.out}</Badge> : k.fitness === "doubt" ? <Badge tone="warning">{k.chance !== null ? s.doubt(t.common.percent(String(k.chance))) : s.doubtful}</Badge> : null}
        </li>
      ))}
    </ol>
  );
}

/** Each club's penalty, direct free-kick and corner order, as FPL lists it, with availability alongside. */
export function SetPieces({ rows, variety }: { rows: SetPieceRow[]; variety: number }) {
  const t = getT();
  const s = t.tools.planning.setPieces;
  const columns: Column<SetPieceRow>[] = [
    {
      key: "club",
      header: s.cols.club,
      rowHeader: true,
      cell: (r) => (
        <span className={plan.club}>
          <Crest code={r.clubCode} name={r.clubName} size={22} />
          {r.club}
        </span>
      ),
    },
    { key: "penalties", header: s.cols.penalties, cell: (r) => <Takers takers={r.penalties} /> },
    { key: "freeKicks", header: s.cols.freeKicks, hideBelow: "sm", cell: (r) => <Takers takers={r.freeKicks} /> },
    { key: "corners", header: s.cols.corners, hideBelow: "sm", cell: (r) => <Takers takers={r.corners} /> },
  ];
  return (
    <Card title={s.title}>
      <p className={styles.note}>{pickVariant(s.note, variety, PLAN_SLOT.setPieces)(rows.length)}</p>
      <DataTable caption={s.title} hideCaption dense columns={columns} rows={rows} rowKey={(r) => r.teamId} />
      <p className={plan.method}>{s.method}</p>
    </Card>
  );
}
