import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  /** Title and facts centred on the page, with the actions in the corner (an empty twin on the other side keeps the centre true). */
  centered?: boolean;
}

export function PageHeader({ title, eyebrow, meta, actions, back, centered = false }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back ? <div className={styles.back}>{back}</div> : null}
      <div className={centered ? `${styles.row} ${styles.centered}` : styles.row}>
        {centered ? <div aria-hidden="true" /> : null}
        <div className={styles.titles}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </header>
  );
}
