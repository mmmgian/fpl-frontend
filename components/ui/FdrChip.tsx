import type { ReactNode } from "react";
import styles from "./FdrChip.module.css";

export type FdrBandValue = 1 | 2 | 3 | 4 | 5;

/**
 * A fixture-difficulty chip, 1 (easy, green) to 5 (hard, red). Colour is never the only signal: callers print the
 * difficulty as a number too, and `label` (", difficulty 3 of 5", in the page's language) is announced to screen readers. The band is passed in (already clamped),
 * so this UI primitive knows nothing about fixtures.
 */
export function FdrChip({ band, children, block, label }: { band: FdrBandValue; children: ReactNode; block?: boolean; label: string }) {
  return (
    <span className={[styles.chip, styles[`band${band}`], block ? styles.block : ""].filter(Boolean).join(" ")}>
      {children}
      <span className="sr-only">{label}</span>
    </span>
  );
}
