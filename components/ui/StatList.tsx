import type { ReactNode } from "react";
import styles from "./StatList.module.css";

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** Key figures as a description list (label/value pairs are announced together). */
export function StatList({ items, label }: { items: Stat[]; label?: string }) {
  return (
    <dl className={styles.list} aria-label={label}>
      {items.map((s) => (
        <div key={s.label} className={styles.item}>
          <dt className={styles.label}>{s.label}</dt>
          <dd className={styles.value}>
            {s.value}
            {s.hint ? <span className={styles.hint}>{s.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
