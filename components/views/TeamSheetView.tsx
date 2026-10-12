import { Card, CaptainBadge, ClubLink, Crest, DataTable, FdrChip, getT, type Column } from "@/components/ui";
import { fdrBand, subtotal, type SheetPlayer, type TeamSheet } from "@/lib/domain";
import type { NextMatch } from "@/lib/services/models";
import styles from "./views.module.css";

const shirt = (clubCode: number | null) =>
  clubCode ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}-66.png` : null;

interface ColumnOptions {
  showPoints: boolean;
  next: Record<number, NextMatch[]>;
  benchOrder?: boolean;
}

function playerColumns({ showPoints, next, benchOrder = false }: ColumnOptions): Column<SheetPlayer>[] {
  const t = getT();
  const sh = t.sheet;
  const cols: Column<SheetPlayer>[] = [
    {
      key: "player",
      header: sh.player,
      rowHeader: true,
      cell: (p) => (
        <span className={styles.playerCell}>
          {benchOrder ? (
            <span className={styles.benchSlot}>
              <span aria-hidden="true">{p.slot - 11}</span>
              <span className="sr-only">{sh.benchSlot(p.slot - 11, p.slot === 12)}</span>
            </span>
          ) : null}
          <Crest src={shirt(p.clubCode)} name={sh.shirt(p.club)} size={24} />
          <span className={styles.playerName}>{p.name}</span>
          {p.isCaptain ? <CaptainBadge multiplier={p.multiplier} /> : null}
          {p.isVice ? <CaptainBadge vice /> : null}
        </span>
      ),
    },
    {
      key: "club",
      header: sh.club,
      width: "4.75rem",
      cell: (p) => (
        p.teamId === null ? (
          <span className={styles.clubCell}>
            <Crest code={p.clubCode} name={p.club} size={18} />
            {p.club}
          </span>
        ) : (
          <ClubLink id={p.teamId} name={p.clubName} className={styles.clubCell}>
            <Crest code={p.clubCode} name={p.club} size={18} />
            {p.club}
          </ClubLink>
        )
      ),
    },
  ];
  if (Object.keys(next).length > 0) {
    cols.push({
      key: "next",
      header: sh.next,
      hideBelow: "sm",
      width: "7.5rem",
      cell: (p) => {
        const matches = next[p.id];
        return matches?.length ? (
          <span className={styles.nextCell}>
            {matches.map((m, i) => (
              <FdrChip key={i} band={fdrBand(m.difficulty)} label={t.client.fdr.difficulty(fdrBand(m.difficulty))}>
                {m.opponent} ({m.home ? t.fixtures.homeShort : t.fixtures.awayShort}) <span aria-hidden="true">{m.difficulty}</span>
              </FdrChip>
            ))}
          </span>
        ) : (
          <span className={styles.muted}>
            <span aria-hidden="true">–</span>
            <span className="sr-only">{sh.noFixture}</span>
          </span>
        );
      },
    });
  }
  if (showPoints) {
    cols.push({
      key: "pts",
      header: sh.pts,
      align: "end",
      width: "4rem",
      cell: (p) =>
        p.points == null ? (
          <span className={styles.muted}>
            <span aria-hidden="true">–</span>
            <span className="sr-only">{sh.noPoints}</span>
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

/** Highest scorers first, as in the original; slot order when there are no points to sort by. */
const byPoints = (a: SheetPlayer, b: SheetPlayer) => (b.points ?? 0) - (a.points ?? 0) || a.slot - b.slot;

function Subtotal({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className={styles.subtotal}>
      <span>
        {label}
        {note ? <span className={styles.subtotalNote}> {note}</span> : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

interface TeamSheetViewProps {
  sheet: TeamSheet;
  showPoints: boolean;
  next?: Record<number, NextMatch[]>;
  /** Transfer hit in points, shown beside the grand total. */
  hit?: number;
  /** Bench Boost: bench points count towards the score. */
  benchCounted?: boolean;
}

export function TeamSheetView({ sheet, showPoints, next = {}, hit = 0, benchCounted = false }: TeamSheetViewProps) {
  const t = getT();
  const sh = t.sheet;
  const benchPoints = sheet.bench.reduce((sum, p) => sum + (p.basePoints ?? 0), 0);
  const grand = sheet.grossPoints;

  return (
    <div className="stack">
      <section aria-labelledby="xi-heading" className="stack">
        <h2 id="xi-heading" className={styles.sectionTitle}>
          {sh.startingXi}
        </h2>
        <div className={styles.positionGrid}>
          {sheet.starters.map((group) => {
            const players = showPoints ? [...group.players].sort(byPoints) : group.players;
            return (
              <Card key={group.positionId} title={t.team.positions[group.positionId]} headingLevel={3} flush>
                <DataTable
                  caption={t.team.positions[group.positionId]}
                  hideCaption
                  dense
                  columns={playerColumns({ showPoints, next })}
                  rows={players}
                  rowKey={(p) => p.id}
                />
                {showPoints ? <Subtotal label={sh.subtotal} value={subtotal(group.players)} /> : null}
              </Card>
            );
          })}
        </div>
      </section>

      <Card title={sh.bench} flush>
        <DataTable
          caption={sh.benchCaption}
          hideCaption
          dense
          columns={playerColumns({ showPoints, next, benchOrder: true })}
          rows={sheet.bench}
          rowKey={(p) => p.id}
          empty={sh.benchEmpty}
        />
        {showPoints ? <Subtotal label={sh.bench} value={benchPoints} note={benchCounted ? sh.counts : sh.notCounted} /> : null}
      </Card>

      {showPoints ? (
        <div className={styles.grandTotalRow}>
          <p className={styles.grandTotal}>
            <span className={styles.grandLabel}>{sh.grandTotal}</span>
            <strong className={styles.grandValue}>{grand}</strong>
            {hit > 0 ? <span className={styles.grandNote}>{sh.hitNote(hit, grand - hit)}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
