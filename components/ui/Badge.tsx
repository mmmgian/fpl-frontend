import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "live" | "positive" | "warning";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Full text for assistive tech when the visible label is abbreviated (e.g. "C" -> "Captain"). */
  srLabel?: string;
  title?: string;
}

export function Badge({ children, tone = "neutral", srLabel, title }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} title={title ?? srLabel}>
      {srLabel ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{srLabel}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
