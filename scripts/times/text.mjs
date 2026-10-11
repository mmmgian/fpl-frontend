/**
 * Text clean-up for PDF text extracted with pdf.js. Pure functions, no I/O.
 *
 * The PDFs were typeset with tracked-out (letter-spaced) labels, which PDF text extraction returns as
 * "F R O N T PA G E": every word boundary is lost. Word boundaries are recovered by segmenting each such
 * run against a lexicon built from the documents' own normal-case text, so names and jargon
 * (HAALAND, GAMEWEEK) are known without any dictionary file. Output is a best-effort text alternative.
 */

const LETTER = "A-Za-zÀ-ÿ";
const GLYPH = new RegExp(`^(?:[${LETTER}]{1,2}[-'’]?|\\d)$`);
const SINGLE = new RegExp(`^[${LETTER}]$`);
const UNKNOWN_BASE = 14;
const UNKNOWN_PER_CHAR = 5;
const MIN_UNKNOWN = 4;
const MAX_WORD = 24;

/** Words (lower-case) -> how often they occur, from strings that are NOT letter-spaced. */
export function buildLexicon(strings) {
  const counts = new Map();
  for (const s of strings) {
    if (looksSpaced(s)) continue;
    for (const w of s.toLowerCase().match(new RegExp(`[${LETTER}]+`, "g")) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return { counts, total };
}

/** True when most of a string is single letters separated by spaces. */
export function looksSpaced(s) {
  const t = s.trim().split(/ +/);
  return t.length >= 4 && t.filter((x) => x.length <= 2).length / t.length >= 0.7 && t.filter((x) => SINGLE.test(x)).length >= 3;
}

function wordCost(lex, w) {
  const n = lex.counts.get(w);
  if (!n || (w.length === 1 && !"ai".includes(w))) return Infinity;
  return Math.log(lex.total / n) + (w.length === 1 ? 6 : 0);
}

/**
 * Split concatenated capitals into words: cheapest path over known words, where an unknown word may be
 * kept as ONE piece (expensive), so known words still split off around names the lexicon has never seen.
 */
export function segment(letters, lex) {
  const s = letters.toLowerCase();
  const n = s.length;
  const best = Array(n + 1).fill(Infinity);
  const back = Array(n + 1).fill(-1);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    for (let j = i + 1; j <= Math.min(n, i + MAX_WORD); j++) {
      const known = wordCost(lex, s.slice(i, j));
      const cost = known < Infinity ? known : j - i >= MIN_UNKNOWN ? UNKNOWN_BASE + UNKNOWN_PER_CHAR * (j - i) : Infinity;
      if (best[i] + cost + 1 < best[j]) {
        best[j] = best[i] + cost + 1;
        back[j] = i;
      }
    }
  }
  if (best[n] === Infinity) return [letters];
  const out = [];
  for (let k = n; k > 0; k = back[k]) out.unshift(letters.slice(back[k], k));
  return out;
}

/** Re-space one run of letter-spaced tokens ("F R O N T PA G E" -> "FRONT PAGE"). */
function respace(tokens, lex) {
  const out = [];
  let run = "";
  const flush = () => {
    if (run) out.push(segment(run, lex).join(" "));
    run = "";
  };
  for (const tok of tokens) {
    if (/^\d$/.test(tok)) {
      flush();
      out.push(tok); // a digit is a boundary: "G W 5 G L O B A L" -> "GW 5 GLOBAL"
      continue;
    }
    const m = tok.match(new RegExp(`^([${LETTER}]*)([-'’]?)$`));
    run += m[1];
    if (m[2]) {
      flush();
      out[out.length - 1] = (out[out.length - 1] ?? "") + m[2]; // a trailing hyphen/apostrophe sticks to its word
    }
  }
  flush();
  return out.join(" ");
}

/**
 * PDF ligatures arrive split ("O ffi cial", "veri fi ed", "fi rst"). A ligature joins the lower-case fragment
 * after it. It also joins the fragment before it when that is a lone capital ("O") or a lower-case piece that
 * is not a word on its own ("veri"), but never a real word ("of fi rst" -> "of first"). Call this on a whole
 * line: the pieces often arrive as separate text items.
 */
export function joinLigatures(s, lex) {
  const known = (w) => lex.counts.has(w.toLowerCase());
  return s.replace(new RegExp(`(?:(?<![${LETTER}])([${LETTER}]+) )?\\b(ffi|ffl|ff|fi|fl) (?=[a-z])`, "g"), (m, left, lig) => {
    if (left === undefined) return lig;
    const joinsLeft = left.length === 1 ? left === left.toUpperCase() : left === left.toLowerCase() && !known(left);
    return joinsLeft ? left + lig : `${left} ${lig}`;
  });
}

/** Clean one extracted string. */
export function cleanText(str, lex) {
  const tokens = str.trim().split(/ +/);
  const out = [];
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (j < tokens.length && GLYPH.test(tokens[j])) j++;
    const run = tokens.slice(i, j);
    if (run.filter((t) => SINGLE.test(t)).length >= 3 && run.length >= 3) {
      out.push(respace(run, lex));
      i = j;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out.join(" ").replace(/ ([,.;:)\]])/g, "$1").replace(/([(\[]) /g, "$1").replace(/\s+/g, " ").trim();
}
