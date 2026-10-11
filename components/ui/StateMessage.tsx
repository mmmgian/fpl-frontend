import type { ReactNode } from "react";
import styles from "./StateMessage.module.css";

interface StateMessageProps {
  tone?: "empty" | "error" | "info";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Heading level; error boundaries replace the page so they use h1. */
  headingLevel?: 1 | 2;
}

/** Empty / error / informational block. Errors are announced via role="alert". */
export function StateMessage({ tone = "empty", title, children, action, headingLevel = 2 }: StateMessageProps) {
  const H = `h${headingLevel}` as const;
  return (
    <div className={`${styles.box} ${styles[tone]}`} role={tone === "error" ? "alert" : undefined}>
      <span className={styles.icon} aria-hidden="true">
        {tone === "error" ? "!" : tone === "info" ? "i" : "∅"}
      </span>
      <div className={styles.body}>
        <H className={styles.title}>{title}</H>
        {children ? <div className={styles.text}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
