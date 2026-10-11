import styles from "./Sparkline.module.css";

interface SparklineProps {
  values: number[];
  /** Index to emphasise (e.g. the best gameweek). */
  highlight?: number;
  /** Plain-language summary: the chart itself is hidden from assistive technology. */
  label: string;
}

const W = 640;
const H = 72;
const PAD = 8;

/** A tiny line chart rendered on the server: no client JS, scales to its container's width. */
export function Sparkline({ values, highlight, label }: SparklineProps) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (values.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (values.length - 1));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `${points.join(" ")} ${x(values.length - 1).toFixed(1)},${H} ${x(0).toFixed(1)},${H}`;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={label} preserveAspectRatio="none">
        <polygon points={area} className={styles.area} />
        <line x1={PAD} x2={W - PAD} y1={y(mean)} y2={y(mean)} className={styles.mean} />
        <polyline points={points.join(" ")} className={styles.line} />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === highlight ? 4.5 : 3} className={i === highlight ? styles.best : styles.dot} />
        ))}
      </svg>
    </figure>
  );
}
