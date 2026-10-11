import styles from "./Movement.module.css";

const APPROXIMATE_TITLE = "One of the two ranks this compares is approximate";

/** Rank change indicator. `delta` > 0 means climbed; null means no previous rank. */
export function Movement({ delta, approximate = false }: { delta: number | null; approximate?: boolean }) {
  if (delta == null) {
    return (
      <span className={`${styles.movement} ${styles.flat}`}>
        <span aria-hidden="true">•</span>
        <span className="sr-only">new entry</span>
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className={`${styles.movement} ${styles.flat}`} title={approximate ? APPROXIMATE_TITLE : undefined}>
        <span aria-hidden="true">
          {approximate ? "≈" : ""}–
        </span>
        <span className="sr-only">{approximate ? "no change (approximate)" : "no change"}</span>
      </span>
    );
  }
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span className={`${styles.movement} ${up ? styles.up : styles.down}`} title={approximate ? APPROXIMATE_TITLE : undefined}>
      <span aria-hidden="true">
        {approximate ? "≈" : ""}
        {up ? "▲" : "▼"}
        {n}
      </span>
      <span className="sr-only">
        {approximate ? "about " : ""}
        {up ? "up" : "down"} {n} {n === 1 ? "place" : "places"}
      </span>
    </span>
  );
}
