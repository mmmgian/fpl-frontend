import { Badge, Card, Crest, DataTable, getT, type Column } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { SetPieceRow, SetPieceTaker } from "@/lib/domain/planning";
import styles from "../tools.module.css";
import { PLAN_SLOT } from "./CaptainShortlist";
import plan from "./planning.module.css";

const shirt = (clubCode: number | null) =>
  clubCode ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}-66.png` : null;

/** One set piece's takers in FPL's order, each flagged if doubtful or out. */
function Takers({ takers, clubCode }: { takers: SetPieceTaker[]; clubCode: number | null }) {
  const t = getT();
  const s = t.tools.planning.setPieces;
  if (takers.length === 0) return <span className={plan.noneListed}>{s.noneListed}</span>;
  const kit = shirt(clubCode);
  return (
    <ol className={plan.takers}>
      {takers.map((k) => (
        <li
          key={k.id}
          className={plan.taker}
          data-order={k.order}
          data-fitness={k.fitness}
        >
          <span className={plan.orderBadge} aria-hidden="true" data-order={k.order}>
            {k.order}.
          </span>
          {kit ? (
            <span className={plan.jerseyWrap} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kit}
                alt=""
                width={17}
                height={19}
                className={plan.jersey}
                loading="lazy"
                decoding="async"
              />
            </span>
          ) : null}
          <span className={plan.takerName}>{k.name}</span>
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
          <Crest code={r.clubCode} name={r.clubName} size={24} />
          <span className={plan.clubCode}>{r.club}</span>
        </span>
      ),
    },
    {
      key: "penalties",
      header: (
        <span className={plan.colHeader}>
          <span className={plan.headerIcon} aria-hidden="true">
            ⚽
          </span>{" "}
          {s.cols.penalties}
        </span>
      ),
      cell: (r) => <Takers takers={r.penalties} clubCode={r.clubCode} />,
    },
    {
      key: "freeKicks",
      header: (
        <span className={plan.colHeader}>
          <span className={plan.headerIcon} aria-hidden="true">
            🎯
          </span>{" "}
          {s.cols.freeKicks}
        </span>
      ),
      hideBelow: "sm",
      cell: (r) => <Takers takers={r.freeKicks} clubCode={r.clubCode} />,
    },
    {
      key: "corners",
      header: (
        <span className={plan.colHeader}>
          <span className={plan.headerIcon} aria-hidden="true">
            🚩
          </span>{" "}
          {s.cols.corners}
        </span>
      ),
      hideBelow: "sm",
      cell: (r) => <Takers takers={r.corners} clubCode={r.clubCode} />,
    },
  ];
  return (
    <Card title={s.title}>
      <p className={styles.note}>{pickVariant(s.note, variety, PLAN_SLOT.setPieces)(rows.length)}</p>
      <DataTable caption={s.title} hideCaption dense columns={columns} rows={rows} rowKey={(r) => r.teamId} />
      <p className={plan.method}>{s.method}</p>
    </Card>
  );
}
