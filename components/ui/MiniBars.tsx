import styles from "./MiniBars.module.css";

interface MiniBarsProps {
  /** One bar per value, oldest first. */
  values: number[];
  /** Printed under each bar when `showLabels`, e.g. ["GW2", "GW3"]. */
  labels?: string[];
  /** A reference level drawn across the bars, e.g. the league average. */
  reference?: number;
  /** Print each bar's number above it. */
  showValues?: boolean;
  showLabels?: boolean;
  /** Plain-language summary: the graphic itself is hidden from assistive technology. */
  label: string;
  /** Bar area height in px. */
  height?: number;
  /** Width of each bar in px. */
  barWidth?: number;
}

const GAP = 6;
const TOP = 14; // room for the number above the tallest bar
const BOTTOM = 14; // room for the label under the bars

/**
 * A small bar chart for a handful of values, drawn on the server (no script). The latest bar is picked out and
 * the best one is marked, so the shape reads at a glance; with `showValues` every number is printed too.
 */
export function MiniBars({ values, labels, reference, showValues = false, showLabels = false, label, height = 28, barWidth: BAR = 14 }: MiniBarsProps) {
  if (values.length === 0) return null;
  const top = showValues ? TOP : 2;
  const bottom = showLabels ? BOTTOM : 2;
  const gap = Math.max(GAP, BAR / 2);
  const width = values.length * BAR + (values.length - 1) * gap;
  const max = Math.max(...values, reference ?? 0, 1);
  const best = values.indexOf(Math.max(...values));
  const h = (v: number) => Math.max(2, (Math.max(0, v) / max) * height);
  const y = (v: number) => top + height - h(v);

  return (
    <svg
      viewBox={`0 0 ${width} ${top + height + bottom}`}
      className={styles.svg}
      style={{ width: `${width}px`, height: `${top + height + bottom}px` }}
      role="img"
      aria-label={label}
      focusable="false"
    >
      {values.map((v, i) => {
        const x = i * (BAR + gap);
        const latest = i === values.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={y(v)} width={BAR} height={h(v)} rx={3} className={latest ? styles.latest : styles.bar} />
            {showValues ? (
              <text x={x + BAR / 2} y={y(v) - 3} textAnchor="middle" className={i === best ? styles.valueBest : styles.value}>
                {v}
              </text>
            ) : null}
            {showLabels && labels?.[i] ? (
              <text x={x + BAR / 2} y={top + height + 11} textAnchor="middle" className={BAR > 20 ? styles.axisBig : styles.axis}>
                {labels[i]}
              </text>
            ) : null}
          </g>
        );
      })}
      {reference !== undefined ? <line x1={-2} x2={width + 2} y1={y(reference)} y2={y(reference)} className={styles.reference} /> : null}
    </svg>
  );
}
