import { useId, type ReactNode } from "react";
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
  dense?: boolean;
}

export function DataTable<T>({
  caption,
  hideCaption,
  columns,
  rows,
  rowKey,
  empty = "Nothing to show yet.",
  isCurrentRow,
  dense,
}: DataTableProps<T>) {
  const captionId = useId();
  const cellClass = (c: Column<T>) =>
    [styles[c.align ?? "start"], c.hideBelow ? styles[`hide-${c.hideBelow}`] : ""].filter(Boolean).join(" ");

  return (
    <div className={styles.region} role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className={`${styles.table} ${dense ? styles.dense : ""}`}>
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
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const current = isCurrentRow?.(row) ?? false;
              return (
                <tr key={rowKey(row, i)} className={current ? styles.current : undefined} aria-current={current ? "true" : undefined}>
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
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
