// Pure helpers for the avatar generator: no network, no files, so they can be tested. generate.mjs does the I/O.

export const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";
export const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const MAX_NAME = 60;

/**
 * A team name made safe to put in a prompt: only letters, digits and plain punctuation, one line, a sensible length.
 * Team names are typed by managers, so this removes anything that could carry instructions, links or markup. Returns
 * "" if nothing usable is left.
 */
export function cleanName(raw) {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N} '’.&!?-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
}

/**
 * The prompt. Only the team name goes in: never the manager's own name. The style is described, not just named, so it
 * holds even if the model ignores the artist's name; it also asks for no text, logos or real people.
 */
export function buildPrompt(teamName) {
  const name = cleanName(teamName);
  if (!name) return null;
  return [
    "Draw a single quirky little character that embodies a fantasy football team called",
    `"${name}".`,
    "Style: outsider art in the spirit of Daniel Johnston's lo-fi drawings: wobbly black felt-tip outlines, flat naive childlike colours,",
    "a slightly wonky, endearing hand-drawn look, simple shapes, big eyes, a plain pale background.",
    "Centred, filling the square. No words, no letters, no logos, no badges, no real people, no existing cartoon characters.",
  ].join(" ");
}

/** The request to make, for either of Google's two APIs. `store: false` asks Google not to keep the interaction. */
export function buildRequest({ api, model, prompt, base = API_BASE }) {
  if (api === "generate-content") {
    return {
      url: `${base}/models/${encodeURIComponent(model)}:generateContent`,
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
    };
  }
  if (api === "interactions") {
    return { url: `${base}/interactions`, body: { model, input: [{ type: "text", text: prompt }], store: false } };
  }
  throw new Error(`Unknown --api "${api}": use "interactions" or "generate-content".`);
}

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Finds the first image in a response, whichever API produced it: an `inlineData` / `inline_data` part, or any object
 * with base64 `data` and an image MIME type. Walks the whole structure so a small change in the response layout does
 * not break it. Returns { mime, bytes } or null.
 */
export function findImage(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findImage(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const inline = node.inlineData ?? node.inline_data;
  const candidates = inline ? [inline, node] : [node];
  for (const c of candidates) {
    const mime = c.mimeType ?? c.mime_type ?? c.mimetype;
    if (typeof c.data === "string" && c.data.length > 200 && BASE64.test(c.data) && typeof mime === "string" && mime.startsWith("image/")) {
      return { mime, bytes: Buffer.from(c.data, "base64") };
    }
  }
  for (const value of Object.values(node)) {
    const hit = findImage(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Why there was no image, in a sentence, from whatever the response said (a safety block, a refusal, an error). */
export function explainNoImage(json) {
  const bits = [];
  const walk = (n, d = 0) => {
    if (!n || typeof n !== "object" || d > 8) return;
    for (const [k, v] of Object.entries(n)) {
      if (["blockReason", "block_reason", "finishReason", "finish_reason", "status"].includes(k) && typeof v === "string" && !/^(STOP|completed|COMPLETED)$/.test(v)) bits.push(`${k}: ${v}`);
      if (["message", "text"].includes(k) && typeof v === "string" && v.length < 300) bits.push(v);
      walk(v, d + 1);
    }
  };
  walk(json);
  return bits.length ? [...new Set(bits)].slice(0, 4).join("; ") : "the response contained no image";
}

/** Which managers still need an avatar: no badge of their own, and none generated yet (or `force`). */
export function needsAvatar(row, manifest, { force = false } = {}) {
  if (row.club_badge_src) return false;
  if (!cleanName(row.entry_name)) return false;
  return force || !manifest.avatars?.[row.entry];
}

/** Command-line options, with the safe defaults: one image, no overwriting. */
export function parseArgs(argv) {
  const opts = { limit: 1, all: false, force: false, dryRun: false, only: null, model: null, api: "interactions", league: null, delayMs: 2500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--all") opts.all = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--limit") opts.limit = Number(next());
    else if (a === "--only") opts.only = Number(next());
    else if (a === "--model") opts.model = next();
    else if (a === "--api") opts.api = next();
    else if (a === "--league") opts.league = Number(next());
    else if (a === "--delay") opts.delayMs = Number(next());
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error("--limit must be a whole number of at least 1");
  if (opts.only !== null && !(Number.isInteger(opts.only) && opts.only > 0)) throw new Error("--only needs an entry id");
  if (opts.league !== null && !(Number.isInteger(opts.league) && opts.league > 0)) throw new Error("--league needs a league id");
  if (!["interactions", "generate-content"].includes(opts.api)) throw new Error(`Unknown --api "${opts.api}"`);
  return opts;
}

/** KEY=value lines from a .env file (comments, blank lines and quotes handled). Never throws on junk. */
export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** An API key must never reach logs or error messages. */
export function redact(text, key) {
  return key ? String(text).split(key).join("[key]") : String(text);
}

/** "2379133-gaucho-f-c.png" -> { entry: 2379133, slug: "gaucho-f-c" }. Only the leading id matters; null if there isn't one. */
export function parseMascotFilename(name) {
  const m = String(name).match(/^(\d{1,10})(?:[-_ ](.*?))?\.(png|webp|jpe?g)$/i);
  return m && Number(m[1]) > 0 ? { entry: Number(m[1]), slug: m[2] ?? "", ext: m[3].toLowerCase() } : null;
}

/**
 * Which file goes to which manager. `files` are file names, `rows` the league table. Reports, rather than guesses at,
 * everything that doesn't line up: files for nobody in the league, two files for one manager, managers with no file.
 */
export function planImport(files, rows) {
  const byEntry = new Map(rows.map((r) => [r.entry, r]));
  const matched = [];
  const unmatched = [];
  const duplicates = [];
  const seen = new Map();
  for (const file of [...files].sort()) {
    const parsed = parseMascotFilename(file);
    if (!parsed) { unmatched.push({ file, reason: "the name doesn't start with a manager id" }); continue; }
    const row = byEntry.get(parsed.entry);
    if (!row) { unmatched.push({ file, reason: `no manager with id ${parsed.entry} in this league` }); continue; }
    if (seen.has(parsed.entry)) { duplicates.push({ entry: parsed.entry, files: [seen.get(parsed.entry), file] }); continue; }
    seen.set(parsed.entry, file);
    matched.push({ file, entry: parsed.entry, teamName: row.entry_name, slug: parsed.slug });
  }
  const covered = new Set(matched.map((m) => m.entry));
  const missing = rows.filter((r) => !covered.has(r.entry)).map((r) => ({ entry: r.entry, teamName: r.entry_name }));
  return { matched, unmatched, duplicates, missing, ok: unmatched.length === 0 && duplicates.length === 0 && missing.length === 0 };
}
