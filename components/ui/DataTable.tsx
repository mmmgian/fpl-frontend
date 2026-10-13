import { useId, type ReactNode } from "react";
import { getT } from "./i18n";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "start" | "end" | "center";
  /** Hide on narrow screens. Only use for information that's also available elsewhere in the row. */
  hideBelow?: "sm" | "md";
  /** Render this column's cells as <th scope="row"> (the cell that names the row). */
  rowHeader?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  caption: string;
  /** Keep the caption for screen readers but hide it visually (when a visible heading already labels the table). */
  hideCaption?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  empty?: ReactNode;
  /** Highlight a row (e.g. "you"), conveyed to AT via aria-current. */
  isCurrentRow?: (row: T) => boolean;
  /** Tints a row (and marks its left edge) green, amber or red, e.g. the top and bottom of a league. */
  rowTone?: (row: T) => "good" | "warn" | "bad" | undefined;
  dense?: boolean;
  /**
   * An optional full-width row under each row, hidden until the row contains a checked `input[data-expand]`
   * (see DataTable.module.css). Returning null for a row means it has no detail.
   */
  detail?: (row: T, index: number) => ReactNode;
  /** Keep the first column in view while a wide table scrolls sideways (e.g. the player name in a 7-column table). */
  stickyFirst?: boolean;
}

export function DataTable<T>({
  caption,
  hideCaption,
  columns,
  rows,
  rowKey,
  empty,
  isCurrentRow,
  rowTone,
  dense,
  detail,
  stickyFirst,
}: DataTableProps<T>) {
  const captionId = useId();
  const cellClass = (c: Column<T>) =>
    [styles[c.align ?? "start"], c.hideBelow ? styles[`hide-${c.hideBelow}`] : ""].filter(Boolean).join(" ");

  return (
    <div className={styles.region} role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className={`${styles.table} ${dense ? styles.dense : ""}${stickyFirst ? ` ${styles.stickyFirst}` : ""}`}>
        <caption id={captionId} className={hideCaption ? "sr-only" : styles.caption}>
          {caption}
        </caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} className={c.hideBelow ? styles[`hide-${c.hideBelow}`] : undefined} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cellClass(c)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty ?? getT().common.nothingYet}
              </td>
            </tr>
          ) : (
            rows.flatMap((row, i) => {
              const current = isCurrentRow?.(row) ?? false;
              const extra = detail?.(row, i);
              const main = (
                <tr key={rowKey(row, i)} className={current ? styles.current : undefined} aria-current={current ? "true" : undefined} data-tone={rowTone?.(row)}>
                  {columns.map((c) =>
                    c.rowHeader ? (
                      <th key={c.key} scope="row" className={`${cellClass(c)} ${styles.rowHeader}`}>
                        {c.cell(row, i)}
                      </th>
                    ) : (
                      <td key={c.key} className={cellClass(c)}>
                        {c.cell(row, i)}
                      </td>
                    ),
                  )}
                </tr>
              );
              return extra
                ? [
                    main,
                    <tr key={`${rowKey(row, i)}-detail`} className={styles.detail}>
                      <td colSpan={columns.length}>{extra}</td>
                    </tr>,
                  ]
                : [main];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
