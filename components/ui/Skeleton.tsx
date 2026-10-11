/** Server components; only the optional <SlowHint /> timer runs on the client. */
import type { ReactNode } from "react";
import styles from "./Skeleton.module.css";
import { SlowHint } from "./SlowHint";

export function Skeleton({ width = "100%", height = 14, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className={styles.block} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className={styles.table} aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.row} style={{ gridTemplateColumns: `3ch 1fr ${"5ch ".repeat(Math.max(0, columns - 2))}` }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} width={c === 1 ? `${60 + ((r * 13) % 35)}%` : "100%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Accessible loading region: one polite announcement plus visual skeleton content. */
export function LoadingState({ label, children, slowHint }: { label: string; children: ReactNode; slowHint?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={styles.state}>
      <span className="sr-only">{label}</span>
      {children}
      {slowHint ? <SlowHint>{slowHint}</SlowHint> : null}
    </div>
  );
}
