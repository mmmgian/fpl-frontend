import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: ReactNode;
  /** Heading level for the title so the outline stays correct wherever the card is used. */
  headingLevel?: 2 | 3;
  actions?: ReactNode;
  children: ReactNode;
  as?: "section" | "article" | "div";
  className?: string;
  flush?: boolean;
}

export function Card({ title, headingLevel = 2, actions, children, as: Tag = "section", className, flush }: CardProps) {
  const H = `h${headingLevel}` as const;
  return (
    <Tag className={[styles.card, flush ? styles.flush : "", className].filter(Boolean).join(" ")}>
      {(title || actions) && (
        <header className={styles.header}>
          {title ? <H className={styles.title}>{title}</H> : <span />}
          {actions}
        </header>
      )}
      {children}
    </Tag>
  );
}
