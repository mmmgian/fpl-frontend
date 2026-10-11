import { Card, CaptainBadge, Crest, DataTable, type Column } from "@/components/ui";
import { POSITION_LABEL, type SheetPlayer, type TeamSheet } from "@/lib/fpl/derive";
import styles from "./views.module.css";

function playerColumns(showPoints: boolean, benchOrder = false): Column<SheetPlayer>[] {
  const cols: Column<SheetPlayer>[] = [
    {
      key: "player",
      header: "Player",
      rowHeader: true,
      cell: (p) => (
        <span className={styles.playerCell}>
          {benchOrder ? (
            <span className={styles.benchSlot}>
              <span aria-hidden="true">{p.slot - 11}</span>
              <span className="sr-only">Bench {p.slot - 11}{p.slot === 12 ? ", goalkeeper" : ""}</span>
            </span>
          ) : null}
          <span className={styles.playerName}>{p.name}</span>
          {p.isCaptain ? <CaptainBadge multiplier={p.multiplier} /> : null}
          {p.isVice ? <CaptainBadge vice /> : null}
        </span>
      ),
    },
    {
      key: "club",
      header: "Club",
      width: "5.5rem",
      cell: (p) => (
        <span className={styles.clubCell}>
          <Crest code={p.clubCode} name={p.club} size={18} />
          {p.club}
        </span>
      ),
    },
  ];
  if (showPoints) {
    cols.push({
      key: "pts",
      header: "Pts",
      align: "end",
      width: "4rem",
      cell: (p) =>
        p.points == null ? (
          <span className={styles.muted}>
            <span aria-hidden="true">–</span>
            <span className="sr-only">No points yet</span>
          </span>
        ) : (
          <span className={p.multiplier === 0 ? styles.muted : undefined}>
            <strong>{p.points}</strong>
            {p.multiplier > 1 ? <span className="sr-only"> ({p.basePoints} × {p.multiplier})</span> : null}
          </span>
        ),
    });
  }
  return cols;
}

export function TeamSheetView({ sheet, showPoints }: { sheet: TeamSheet; showPoints: boolean }) {
  return (
    <div className="stack">
      <section aria-labelledby="xi-heading" className="stack">
        <h2 id="xi-heading" className={styles.sectionTitle}>
          Starting XI
        </h2>
        <div className={styles.positionGrid}>
          {sheet.starters.map((group) => (
            <Card key={group.positionId} title={POSITION_LABEL[group.positionId].plural} headingLevel={3} flush>
              <DataTable
                caption={POSITION_LABEL[group.positionId].plural}
                hideCaption
                dense
                columns={playerColumns(showPoints)}
                rows={group.players}
                rowKey={(p) => p.id}
              />
            </Card>
          ))}
        </div>
      </section>
      <Card title="Bench" flush>
        <DataTable
          caption="Bench, in substitution order"
          hideCaption
          dense
          columns={playerColumns(showPoints, true)}
          rows={sheet.bench}
          rowKey={(p) => p.id}
          empty="No bench players."
        />
      </Card>
    </div>
  );
}
