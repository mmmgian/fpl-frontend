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
  // A missing value (NaN, Infinity) keeps its place on the x axis but draws nothing, so the SVG never gets "NaN" coordinates.
  const known = values.map((v, i) => ({ v, i })).filter((p) => Number.isFinite(p.v));
  if (known.length === 0) return null;
  const min = Math.min(...known.map((p) => p.v));
  const max = Math.max(...known.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (values.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (values.length - 1));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const points = known.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const area = `${points.join(" ")} ${x(known[known.length - 1].i).toFixed(1)},${H} ${x(known[0].i).toFixed(1)},${H}`;
  const mean = known.reduce((a, p) => a + p.v, 0) / known.length;

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={label} preserveAspectRatio="none">
        <polygon points={area} className={styles.area} />
        <line x1={PAD} x2={W - PAD} y1={y(mean)} y2={y(mean)} className={styles.mean} />
        <polyline points={points.join(" ")} className={styles.line} />
        {known.map(({ v, i }) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === highlight ? 4.5 : 3} className={i === highlight ? styles.best : styles.dot} />
        ))}
      </svg>
    </figure>
  );
}
