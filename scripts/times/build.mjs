/**
 * Build The Lobster Times assets from PDFs.
 *
 *   cd scripts/times && npm ci && npm run build            # incremental
 *   cd scripts/times && npm run build:force                # re-render everything
 *
 * Inputs : content/times/issues.json            curated metadata (id, title, kind, gameweek, ...)
 *          public/times/<id>/<id>.pdf           the source PDF, also served as the download
 * Outputs: public/times/<id>/p-001-{s,m,l}.webp page images (240 / 640 / 1080 px wide)
 *          public/times/<id>/text.json          the pages' text, fetched only when a reader opens "Read as text"
 *          lib/times/generated/<id>.json        page sizes (no text: it would bloat every page load)
 *          lib/times/generated/library.json     one summary per issue
 *
 * Why images and not the PDF itself: embedded PDFs are inconsistent across browsers (iOS Safari shows only
 * the first page, and custom flip controls cannot reach into a plugin), a PDF engine in the browser is heavy,
 * and images give predictable layout, lazy loading and cheap thumbnails.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildLexicon, cleanText, joinLigatures } from "./text.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TIMES_ROOT ? resolve(process.env.TIMES_ROOT) : resolve(HERE, "../.."); // TIMES_ROOT lets tests run against a scratch tree
const MANIFEST = join(ROOT, "content/times/issues.json");
const PUBLIC = join(ROOT, "public/times");
const OUT = join(ROOT, "lib/times/generated");
const FORCE = process.argv.includes("--force");
const ALLOW_CONTACTS = process.argv.includes("--allow-contacts");

/** Page image variants: width in px and WebP quality. The widest is rendered; the others are scaled from it. */
const SIZES = { l: { width: 1080, quality: 78 }, m: { width: 640, quality: 74 }, s: { width: 240, quality: 62 } };
const KINDS = new Set(["times", "recap", "preview", "plan", "dossier", "report"]);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RENDER = JSON.stringify(SIZES); // part of the up-to-date check: changing sizes or quality re-renders without --force
const pad = (n) => String(n).padStart(3, "0");
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ---------- manifest ----------
if (!existsSync(MANIFEST)) fail(`Missing ${MANIFEST}`);
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const seen = new Set();
for (const m of manifest) {
  if (!ID.test(m.id ?? "") || m.id.length > 80) fail(`Bad id "${m.id}" (lower-case letters, digits and hyphens only, at most 80 characters)`);
  if (seen.has(m.id)) fail(`Duplicate id "${m.id}"`);
  seen.add(m.id);
  if (!m.title) fail(`${m.id}: title is required`);
  if (!KINDS.has(m.kind)) fail(`${m.id}: kind must be one of ${[...KINDS].join(", ")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.published ?? "")) fail(`${m.id}: published must be YYYY-MM-DD`);
  if (m.gameweek != null && !(Number.isInteger(m.gameweek) && m.gameweek >= 1 && m.gameweek <= 38)) fail(`${m.id}: gameweek must be 1-38 or null`);
  if (!existsSync(join(PUBLIC, m.id, `${m.id}.pdf`))) fail(`${m.id}: missing public/times/${m.id}/${m.id}.pdf`);
}

// Everything under public/ is served. A folder for an issue that is no longer in the manifest would stay online
// (PDF included), so removing an issue must also remove its folder.
for (const entry of readdirSync(PUBLIC, { withFileTypes: true })) {
  if (entry.isDirectory() && !seen.has(entry.name)) fail(`public/times/${entry.name}/ is not in the manifest but is still served. Delete the folder, or add the issue back.`);
}

// ---------- pass 1: read every PDF's text (the lexicon needs all of it) ----------
const fontDir = pathToFileURL(join(HERE, "node_modules/pdfjs-dist/standard_fonts/")).href;
const open = (bytes) => getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: fontDir }).promise;

const docs = [];
for (const m of manifest) {
  const bytes = readFileSync(join(PUBLIC, m.id, `${m.id}.pdf`));
  const doc = await open(bytes);
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    pages.push({ n, page, base, items: items.filter((i) => "str" in i).map((i) => ({ str: i.str, height: i.height ?? 0, eol: Boolean(i.hasEOL) })) });
  }
  docs.push({ m, bytes, doc, pages, sha256: createHash("sha256").update(bytes).digest("hex") });
}
// ---------- safety scan: refuse to publish contact details, links or local paths ----------
// This runs over every issue before a single file is written, so a failure never leaves a half-updated site.
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+/;
const LOCAL_PATH = /\/Users\/|\/home\/|[A-Za-z]:\\/;
if (!ALLOW_CONTACTS) {
  for (const { m, doc, pages } of docs) {
    const info = (await doc.getMetadata()).info ?? {};
    for (const key of ["Title", "Author", "Subject", "Keywords", "Creator"]) {
      const v = info[key];
      if (typeof v === "string" && (CONTACT.test(v) || LOCAL_PATH.test(v))) fail(`${m.id}: PDF metadata "${key}" contains a contact detail, link or local path: ${JSON.stringify(v.slice(0, 80))}`);
    }
    for (const p of pages) {
      if (CONTACT.test(p.items.map((i) => i.str).join(" "))) fail(`${m.id} page ${p.n} contains an email address or URL. These pages are public: remove it from the PDF, or re-run with --allow-contacts.`);
      const links = (await p.page.getAnnotations()).filter((a) => a.url || a.unsafeUrl);
      if (links.length) fail(`${m.id} page ${p.n} has ${links.length} link annotation(s) (${links[0].url ?? links[0].unsafeUrl}). Remove them, or re-run with --allow-contacts.`);
    }
  }
}

const lex = buildLexicon(docs.flatMap((d) => d.pages.flatMap((p) => p.items.map((i) => i.str))));

// ---------- pass 2: render, extract, write ----------
mkdirSync(OUT, { recursive: true });
const library = [];
let rendered = 0;
let reused = 0;

for (const { m, bytes, pages, sha256 } of docs) {
  const dir = join(PUBLIC, m.id);
  const jsonPath = join(OUT, `${m.id}.json`);
  const files = (n) => Object.keys(SIZES).map((v) => join(dir, `p-${pad(n)}-${v}.webp`));
  const previous = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null;
  const upToDate = !FORCE && previous?.sha256 === sha256 && previous.render === RENDER && previous.pageCount === pages.length && pages.every((p) => files(p.n).every(existsSync));

  const outPages = [];
  const pageText = [];
  for (const p of pages) {
    const text = [];
    let line = [];
    for (const it of p.items) {
      const t = cleanText(it.str, lex);
      if (t) line.push(t);
      if (it.eol && line.length) {
        text.push(line.join(" "));
        line = [];
      }
    }
    if (line.length) text.push(line.join(" "));
    const joined = joinLigatures(text.join("\n"), lex);

    const width = SIZES.l.width;
    const height = Math.round((width * p.base.height) / p.base.width);
    outPages.push({ n: p.n, width, height });
    pageText.push(joined);

    if (upToDate) continue;
    const viewport = p.page.getViewport({ scale: width / p.base.width });
    const canvas = createCanvas(width, height);
    await p.page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
    for (const [variant, { width: w, quality }] of Object.entries(SIZES)) {
      let surface = canvas;
      if (w !== width) {
        surface = createCanvas(w, Math.round((w * height) / width));
        const ctx = surface.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, 0, surface.width, surface.height);
      }
      writeFileSync(join(dir, `p-${pad(p.n)}-${variant}.webp`), surface.toBuffer("image/webp", quality));
    }
  }

  // drop images left over from a longer earlier version of this PDF
  for (const f of readdirSync(dir)) {
    const k = f.match(/^p-(\d+)-[sml]\.webp$/);
    if (k && Number(k[1]) > pages.length) rmSync(join(dir, f));
  }

  writeFileSync(jsonPath, JSON.stringify({ id: m.id, sha256, render: RENDER, bytes: bytes.length, pageCount: pages.length, pages: outPages }) + "\n");
  writeFileSync(join(dir, "text.json"), JSON.stringify({ id: m.id, pages: pageText }) + "\n");
  library.push({ ...m, pageCount: pages.length, bytes: bytes.length, cover: { width: outPages[0].width, height: outPages[0].height } });
  if (upToDate) reused++;
  else rendered++;
  const imageKb = files(1).concat(...pages.slice(1).map((p) => files(p.n))).reduce((s, f) => s + statSync(f).size, 0) / 1024;
  console.log(`${upToDate ? "=" : "+"} ${m.id.padEnd(28)} ${String(pages.length).padStart(2)} pages  ${(imageKb / 1024).toFixed(1).padStart(5)} MB images`);
}

writeFileSync(join(OUT, "library.json"), JSON.stringify(library, null, 1) + "\n");
for (const f of readdirSync(OUT)) if (f !== "library.json" && !seen.has(f.replace(/\.json$/, ""))) console.warn(`! stale generated file not in the manifest: ${f}`);
console.log(`\n✓ ${library.length} issues, ${library.reduce((s, i) => s + i.pageCount, 0)} pages (${rendered} rendered, ${reused} unchanged)`);
