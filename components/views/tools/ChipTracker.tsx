import { Badge, DataTable, gameweekName, getT, type Column } from "@/components/ui";
import { CHIP_KEYS, type ChipCell, type ChipRow, type ChipTracker as ChipTrackerModel } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";
import { ChipBadge, LEAGUE_SLOT, Missing, say, TeamName } from "./shared";

function Cell({ cell }: { cell: ChipCell }) {
  const t = getT();
  const c = t.tools.leagueTools.chips;
  const again = "next" in cell && cell.next !== null ? <span className={styles.again}>{c.again(t.common.gw(cell.next))}</span> : null;
  switch (cell.state) {
    case "open":
      return (
        <span className={styles.cell}>
          <Badge tone="positive">{c.open(t.common.gw(cell.until))}</Badge>
          {again}
        </span>
      );
    case "used":
      return (
        <span className={styles.cell}>
          <Badge>{c.used(t.common.gw(cell.gw))}</Badge>
          {again}
        </span>
      );
    case "later":
      return <span className={styles.muted}>{c.later(t.common.gw(cell.from))}</span>;
    case "gone":
      return (
        <span className={styles.cell}>
          <span className={styles.muted}>{c.gone}</span>
          {again}
        </span>
      );
    default:
      return <span className={styles.muted}>{c.none}</span>;
  }
}

/**
 * Every league manager's chips: those played (with the gameweek) and, against FPL's own chip windows, what each can
 * still play at the next deadline. A manager whose history couldn't be read says so instead of looking chipless.
 */
export function ChipTracker({ chips, variety, slugs, scope }: { chips: ChipTrackerModel; variety: number; slugs: Map<number, string>; scope: string | null }) {
  const t = getT();
  const lt = t.tools.leagueTools;
  const c = lt.chips;
  const unavailable = lt.unavailable;
  const note =
    !chips.windowsKnown ? say(c.noWindows, variety, LEAGUE_SLOT.chips)(chips.known)
    : chips.nextGw === null || !chips.holders ? say(c.over, variety, LEAGUE_SLOT.chips)(chips.known)
    : say(c.note, variety, LEAGUE_SLOT.chips)(chips.holders.wildcard, chips.holders.freehit, chips.known, gameweekName(`Gameweek ${chips.nextGw}`));

  const columns: Column<ChipRow>[] = [
    {
      key: "team",
      header: c.cols.manager,
      rowHeader: true,
      cell: (r) => (
        <span className={tools.playerText}>
          <TeamName entry={r.entry} name={r.teamName} slugs={slugs} />
          <span className={tools.playerMeta}>{r.played === null ? unavailable : r.manager}</span>
        </span>
      ),
    },
  ];
  if (chips.windowsKnown) {
    for (const k of CHIP_KEYS) {
      columns.push({
        key: k,
        header: (
          <>
            <span aria-hidden="true">{t.table.chipShort[k]}</span>
            <span className="sr-only">{t.chips[k]}</span>
          </>
        ),
        cell: (r) => (r.cells ? <Cell cell={r.cells[k]} /> : <Missing label={unavailable} />),
      });
    }
  }
  columns.push({
    key: "played",
    header: c.cols.played,
    hideBelow: chips.windowsKnown ? "sm" : undefined,
    cell: (r) =>
      r.played === null ? <Missing label={unavailable} />
      : r.played.length === 0 ? <span className={styles.muted}>{c.nonePlayed}</span>
      : (
        <span className={styles.chipList}>
          {r.played.map((p) => (
            <ChipBadge key={`${p.name}-${p.gw}`} name={p.name} gw={p.gw} />
          ))}
        </span>
      ),
  });
  if (chips.windowsKnown) {
    columns.push({ key: "left", header: c.cols.left, align: "end", cell: (r) => (r.left === null ? <Missing label={r.played === null ? unavailable : c.unknown} /> : <strong>{r.left}</strong>) });
  }

  return (
    <>
      <p className={tools.note}>{note}</p>
      {scope ? <p className={styles.scope}>{scope}</p> : null}
      {chips.holders && chips.nextGw !== null ? (
        <>
          <h3 className={styles.summaryTitle}>{c.holders}</h3>
          <ul className={styles.summary}>
            {CHIP_KEYS.map((k) => (
              <li key={k}>
                <ChipBadge name={k} tone="accent" />
                <strong>{c.holding(chips.holders![k], chips.known)}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <DataTable caption={c.title} hideCaption dense columns={columns} rows={chips.rows} rowKey={(r) => r.entry} />
    </>
  );
}
