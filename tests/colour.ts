/**
 * Colour maths shared by the contrast tests (tests/theme.test.tsx, tests/visual/*): WCAG relative luminance and
 * contrast ratio, alpha compositing, and a reader for the colour notations the stylesheets use.
 */

export type RGBA = [number, number, number, number];

/** Strict parser for palette values (#rrggbb, rgb(), rgba()). Throws on anything else, so a bad token fails loudly. */
export function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [...[0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), 1] as RGBA;
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((s) => s.trim());
    return [+r, +g, +b, +a];
  }
  throw new Error(`cannot parse ${color}`);
}

/** `top` painted over an opaque `bottom` (the colour that reaches the eye). */
export const over = (top: RGBA, bottom: RGBA): RGBA => [...[0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])), 1] as RGBA;

export const luminance = ([r, g, b]: RGBA) => {
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio of two opaque colours (1 to 21). */
export const ratio = (fg: RGBA, bg: RGBA) => {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

// ---------------------------------------------------------------------------------------------- lenient reader

const NAMED: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
};

const num = (s: string): number => (s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s));
const alphaOf = (s: string | undefined): number => (s === undefined ? 1 : s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s));

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Splits at top-level separators (commas by default), ignoring those inside parentheses. */
export function splitTop(value: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * Reads a CSS colour: #rgb #rgba #rrggbb #rrggbbaa, rgb()/rgba() (comma or space syntax), hsl()/hsla() with plain numbers,
 * white/black/transparent, and color-mix(in srgb, A p%, B [p%]). Anything else (currentColor, var(), gradients, unresolved
 * mixes) is `null`: the caller skips it rather than guessing.
 */
export function tryColor(input: string): RGBA | null {
  const v = input.trim().toLowerCase();
  if (v in NAMED) return [...NAMED[v]] as RGBA;
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return [r, g, b, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = v.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (m) {
    const parts = m[2].replace("/", " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4 || parts.some((p) => /var\(|calc\(|none/.test(p))) return null;
    const a = alphaOf(parts[3]);
    if (m[1].startsWith("rgb")) return [num(parts[0]), num(parts[1]), num(parts[2]), a];
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
    return [r, g, b, a];
  }
  m = v.match(/^color-mix\((.*)\)$/);
  if (m) {
    const [space, ...stops] = splitTop(m[1]);
    if (space !== "in srgb" || stops.length !== 2) return null;
    const read = (s: string): [RGBA | null, number | undefined] => {
      const pct = s.match(/(?:^|\s)(\d+(?:\.\d+)?)%\s*$/) ?? s.match(/^(\d+(?:\.\d+)?)%\s/);
      const colour = pct ? s.replace(pct[0], " ").trim() : s;
      return [tryColor(colour), pct ? parseFloat(pct[1]) : undefined];
    };
    const [a, pa] = read(stops[0]);
    const [b, pb] = read(stops[1]);
    if (!a || !b) return null;
    const wa = (pa ?? (pb === undefined ? 50 : 100 - pb)) / 100;
    const wb = (pb ?? (pa === undefined ? 50 : 100 - pa)) / 100;
    const total = wa + wb;
    if (total <= 0) return null;
    const [na, nb] = [wa / total, wb / total];
    const alpha = a[3] * na + b[3] * nb;
    if (alpha === 0) return [0, 0, 0, 0];
    // Premultiplied mixing, as CSS Color 4 specifies, so a mix with `transparent` keeps the other colour's hue.
    const ch = (i: number) => (a[i] * a[3] * na + b[i] * b[3] * nb) / alpha;
    const scale = total < 1 ? total : 1; // percentages summing under 100% scale the alpha down
    return [ch(0), ch(1), ch(2), alpha * scale];
  }
  return null;
}

/** "rgb(…) a=0.74" for failure messages. */
export const show = ([r, g, b, a]: RGBA) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${a < 1 ? ` / ${Math.round(a * 100) / 100}` : ""})`;
