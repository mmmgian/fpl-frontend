import styles from "./Movement.module.css";

/** Rank change indicator. `delta` > 0 means climbed; null means no previous rank. */
export function Movement({ delta }: { delta: number | null }) {
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
      <span className={`${styles.movement} ${styles.flat}`}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">no change</span>
      </span>
    );
  }
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span className={`${styles.movement} ${up ? styles.up : styles.down}`}>
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {n}
      </span>
      <span className="sr-only">
        {up ? "up" : "down"} {n} {n === 1 ? "place" : "places"}
      </span>
    </span>
  );
}
