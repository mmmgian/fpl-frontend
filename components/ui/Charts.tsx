import type { ReactNode } from "react";
import styles from "./Charts.module.css";

/**
 * Two small charts for the team page, drawn as SVG on the server (no script). They are built to be read, not
 * just looked at: with room, every point carries its number; with many points, the ends, the best and the
 * latest do. Each one is described in words for assistive technology, and meaning is never carried by colour alone.
 */

const MAX_LABELLED = 14;

/** One entry in a chart's legend: a swatch and what it means. */
export function ChartKey({ kind, children }: { kind: "up" | "down" | "marker"; children: ReactNode }) {
  const swatch = kind === "up" ? styles.swatchUp : kind === "down" ? styles.swatchDown : styles.swatchMarker;
  return (
    <span className={styles.key}>
      <span className={`${styles.swatch} ${swatch}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export interface Bar {
  label: string;
  value: number;
  /** A reference level for this bar, e.g. the average manager's score that week. */
  marker?: number | null;
}

interface BarChartProps {
  bars: Bar[];
  format?: (n: number) => string;
  /** Plain-language description of the whole chart. */
  label: string;
  /** Colour bars by whether they beat their own marker. Without markers all bars are one colour. */
  legend?: ReactNode;
  height?: number;
}

/** Which of n x-axis labels to print so they never collide: all of them while they fit, then every kth plus the last. */
export function axisStep(n: number) {
  return n <= MAX_LABELLED ? 1 : n <= 28 ? 2 : 5;
}

/** Two decimals are plenty for a few pixels. */
const r2 = (n: number) => Math.round(n * 100) / 100;

export function BarChart({ bars, format = String, label, legend, height = 120 }: BarChartProps) {
  if (bars.length === 0) return null;
  const n = bars.length;
  const barW = n <= 8 ? 30 : n <= MAX_LABELLED ? 22 : 14;
  const gap = n <= 8 ? 14 : n <= MAX_LABELLED ? 10 : 6;
  const padX = 8;
  const top = 18;
  const bottom = 18;
  const width = padX * 2 + n * barW + (n - 1) * gap;
  const max = Math.max(...bars.flatMap((b) => [b.value, b.marker ?? 0]), 1);
  const best = bars.reduce((bi, b, i) => (b.value > bars[bi].value ? i : bi), 0);
  // Two decimals are plenty for a few pixels (the long fractions made the SVG, and the page, heavier).
  const y = (v: number) => Math.round((top + height - (Math.max(0, v) / max) * height) * 100) / 100;
  const labelled = (i: number) => n <= MAX_LABELLED || i === best || i === n - 1;
  // A number sits just above its bar, unless the bar's own marker is in that space, then it goes above the marker.
  const labelY = (b: Bar) => {
    const baseline = y(b.value) - 4;
    return b.marker != null && y(b.marker) < y(b.value) && y(b.value) - y(b.marker) < 14 ? y(b.marker) - 4 : baseline;
  };
  const step = axisStep(n);

  return (
    <figure className={styles.figure} style={{ maxWidth: `${Math.max(width * 1.6, 260)}px` }}>
      <div className={n > 28 ? styles.scroll : undefined}>
        <svg viewBox={`0 0 ${width} ${top + height + bottom}`} className={styles.svg} style={n > 28 ? { minWidth: `${width}px` } : undefined} role="img" aria-label={label} focusable="false">
          <line x1={0} x2={width} y1={top + height} y2={top + height} className={styles.base} />
          {bars.map((b, i) => {
            const x = padX + i * (barW + gap);
            const beat = b.marker != null ? b.value > b.marker : null;
            const cls = beat === null ? (i === n - 1 ? styles.barLatest : styles.bar) : beat ? styles.barUp : styles.barDown;
            return (
              <g key={`${b.label}-${i}`}>
                <rect x={x} y={y(b.value)} width={barW} height={r2(Math.max(1.5, top + height - y(b.value)))} rx={3} className={cls} />
                {labelled(i) ? (
                  <text x={x + barW / 2} y={r2(labelY(b))} textAnchor="middle" className={i === best ? styles.valueBest : styles.value}>
                    {format(b.value)}
                  </text>
                ) : null}
                {b.marker != null ? <line x1={x - 3} x2={x + barW + 3} y1={y(b.marker)} y2={y(b.marker)} className={styles.marker} /> : null}
                {i % step === 0 || i === n - 1 ? (
                  <text x={x + barW / 2} y={top + height + 13} textAnchor="middle" className={styles.axis}>
                    {b.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {legend ? <figcaption className={styles.legend}>{legend}</figcaption> : null}
    </figure>
  );
}

export interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  format?: (n: number) => string;
  label: string;
  /** Smaller numbers are better (ranks): the best point is drawn highest. */
  invert?: boolean;
  /** Space points by order of magnitude, for numbers like ranks that fall from millions to thousands. */
  log?: boolean;
  legend?: ReactNode;
  height?: number;
  /** The smallest range the axis will stretch to, so a tiny wiggle doesn't look like a cliff. In the values' own units, or in powers of ten on a log axis. */
  minSpan?: number;
}


interface Placed {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

/**
 * Where each point's number goes: on the side of the point the line isn't (above a peak, below a trough, and to
 * the upper left or right on a slope), and never on top of another number. Candidates are tried in `priority`
 * order, then left to right; one that would overlap a number already placed is simply left out.
 */
function placeLabels(texts: string[], n: number, x: (i: number) => number, y: (i: number) => number, priority: number[]): Map<number, Placed> {
  const GLYPH = 7; // glyph width at the label size, bold numbers included, with a little to spare
  const out = new Map<number, Placed>();
  const boxes: { l: number; r: number; t: number; b: number }[] = [];
  const side = (a: number, b: number) => (b < 0 || b >= n ? null : y(b) > y(a) + 0.5 ? "lower" : y(b) < y(a) - 0.5 ? "higher" : "level");
  const order = [...new Set([...priority, ...Array.from({ length: n }, (_, i) => i)])].filter((i) => i >= 0 && i < n);
  const showAll = n <= 8;
  const must = new Set(priority);

  for (const i of order) {
    if (!showAll && !must.has(i)) continue;
    const prev = side(i, i - 1);
    const next = side(i, i + 1);
    let placed: Placed;
    if (prev === "lower" && next === "higher") placed = { x: x(i) - 5, y: y(i) - 7, anchor: "end" }; // rising: up and to the left
    else if (prev === "higher" && next === "lower") placed = { x: x(i) + 5, y: y(i) - 7, anchor: "start" }; // falling: up and to the right
    else if ((prev === "higher" || prev === null) && (next === "higher" || next === null)) placed = { x: x(i), y: y(i) + 16, anchor: "middle" }; // a trough, or a lone point on a rise: below
    else placed = { x: x(i), y: y(i) - 8, anchor: "middle" }; // a peak or a plateau: above
    const w = texts[i].length * GLYPH;
    const l = placed.anchor === "middle" ? placed.x - w / 2 : placed.anchor === "end" ? placed.x - w : placed.x;
    const box = { l, r: l + w, t: placed.y - 10, b: placed.y + 2 };
    if (boxes.some((o) => box.l < o.r + 2 && box.r > o.l - 2 && box.t < o.b && box.b > o.t)) continue;
    boxes.push(box);
    out.set(i, placed);
  }
  return out;
}

export function LineChart({ points, format = String, label, invert = false, log = false, legend, height = 110, minSpan = 0 }: LineChartProps) {
  if (points.length === 0) return null;
  const n = points.length;
  const padX = 22;
  const top = 22;
  const bottom = 40;
  const step = n <= 8 ? 46 : n <= MAX_LABELLED ? 30 : 18;
  const width = padX * 2 + Math.max(1, n - 1) * step;
  const scale = (v: number) => (log ? Math.log10(Math.max(v, 1)) : v);
  const ts = points.map((p) => scale(p.value));
  const dataLo = Math.min(...ts);
  const dataHi = Math.max(...ts);
  // Widen a narrow range around its middle.
  const widen = dataHi - dataLo < minSpan;
  const lo = widen ? (dataLo + dataHi) / 2 - minSpan / 2 : dataLo;
  const hi = widen ? (dataLo + dataHi) / 2 + minSpan / 2 : dataHi;
  const span = hi - lo || 1;
  const frac = (t: number) => (hi === lo ? 0.5 : (t - lo) / span);
  const x = (i: number) => (n === 1 ? width / 2 : padX + i * step);
  const y = (i: number) => Math.round((top + (invert ? frac(ts[i]) : 1 - frac(ts[i])) * height) * 100) / 100;

  // "Best" is the lowest value for something inverted (a rank), the highest otherwise.
  const bestIdx = ts.reduce((bi, t, i) => ((invert ? t < ts[bi] : t > ts[bi]) ? i : bi), 0);
  const worstIdx = ts.reduce((wi, t, i) => ((invert ? t > ts[wi] : t < ts[wi]) ? i : wi), 0);
  const xStep = axisStep(n);
  const path = points.map((_, i) => `${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(" ");
  const labels = placeLabels(points.map((p) => format(p.value)), n, x, y, [n - 1, bestIdx, worstIdx, 0]);

  return (
    <figure className={styles.figure} style={{ maxWidth: `${Math.max(width * 1.6, 260)}px` }}>
      <svg viewBox={`0 0 ${width} ${top + height + bottom}`} className={styles.svg} role="img" aria-label={label} focusable="false">
        <line x1={0} x2={width} y1={top + height + 24} y2={top + height + 24} className={styles.base} />
        {n > 1 ? <polyline points={path} className={styles.line} /> : null}
        {points.map((p, i) => {
          const last = i === n - 1;
          return (
            <g key={`${p.label}-${i}`}>
              <circle cx={x(i)} cy={y(i)} r={last ? 5 : i === bestIdx ? 4.5 : 3.2} className={last ? styles.dotLatest : i === bestIdx ? styles.dotBest : styles.dot} />
              {labels.get(i) ? (
                <text x={r2(labels.get(i)!.x)} y={r2(labels.get(i)!.y)} textAnchor={labels.get(i)!.anchor} className={i === bestIdx || last ? styles.valueBest : styles.value}>
                  {format(p.value)}
                </text>
              ) : null}
              {i % xStep === 0 || last ? (
                <text x={x(i)} y={top + height + 37} textAnchor="middle" className={styles.axis}>
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {legend ? <figcaption className={styles.legend}>{legend}</figcaption> : null}
    </figure>
  );
}
