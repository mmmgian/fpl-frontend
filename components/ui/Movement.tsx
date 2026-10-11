import { getT } from "./i18n";
import styles from "./Movement.module.css";

/** Rank change indicator. `delta` > 0 means climbed; null means no previous rank. */
export function Movement({ delta, approximate = false }: { delta: number | null; approximate?: boolean }) {
  const t = getT().movement;
  if (delta == null) {
    return (
      <span className={`${styles.movement} ${styles.flat}`}>
        <span aria-hidden="true">•</span>
        <span className="sr-only">{t.newEntry}</span>
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className={`${styles.movement} ${styles.flat}`} title={approximate ? t.approxTitle : undefined}>
        <span aria-hidden="true">
          {approximate ? "≈" : ""}–
        </span>
        <span className="sr-only">{approximate ? t.noChangeApprox : t.noChange}</span>
      </span>
    );
  }
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span className={`${styles.movement} ${up ? styles.up : styles.down}`} title={approximate ? t.approxTitle : undefined}>
      <span aria-hidden="true">
        {approximate ? "≈" : ""}
        {up ? "▲" : "▼"}
        {n}
      </span>
      <span className="sr-only">
        {approximate ? t.approxPrefix : ""}
        {up ? t.up(n) : t.down(n)}
      </span>
    </span>
  );
}
