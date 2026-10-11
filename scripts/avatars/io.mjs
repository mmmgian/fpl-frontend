// File and network helpers shared by generate.mjs and import.mjs. The pure rules live in lib.mjs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");
// The two overrides exist so the scripts can be rehearsed without touching the repo.
export const OUT_DIR = process.env.AVATAR_OUT_DIR || join(ROOT, "public", "avatars");
export const MANIFEST = process.env.AVATAR_MANIFEST || join(ROOT, "lib", "avatars", "manifest.json");
export const SIZE = 256;

export const sha = (buf) => createHash("sha256").update(buf).digest("hex");

export function readManifest() {
  if (!existsSync(MANIFEST)) return { version: 1, avatars: {} };
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  return { version: 1, avatars: m.avatars ?? {} };
}

export function writeManifest(m) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(m.avatars).sort(([a], [b]) => Number(a) - Number(b)));
  const tmp = `${MANIFEST}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1, avatars: sorted }, null, 2)}\n`);
  renameSync(tmp, MANIFEST); // never leave a half-written manifest
}

/** Writes an avatar file atomically: a crash mid-write must never leave a half-written image. */
export function writeAvatar(file, bytes) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${file}.tmp`), bytes);
  renameSync(join(OUT_DIR, `${file}.tmp`), join(OUT_DIR, file));
}

export async function leagueRows(league) {
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`https://fantasy.premierleague.com/api/leagues-classic/${league}/standings/?page_standings=${page}`, { headers: { "user-agent": "lobster-league-avatars" } });
    if (!res.ok) throw new Error(`FPL answered ${res.status} for league ${league}`);
    const body = await res.json();
    rows.push(...(body.standings?.results ?? []));
    if (!body.standings?.has_next) break;
  }
  return rows;
}

/**
 * Centre-crop to a square (optionally trimming `trim` of each edge first) and encode as a small WebP. The plain paper
 * background is made transparent (see removeBackground) unless `keepBackground` is set, so the character sits on
 * whatever the page is, light or dark.
 */
export async function toWebp(bytes, { trim = 0, keepBackground = false } = {}) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const { removeBackground } = await import("./lib.mjs");
  const img = await loadImage(bytes);
  let source = img;
  if (!keepBackground) {
    const full = createCanvas(img.width, img.height);
    const g = full.getContext("2d");
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, img.width, img.height);
    if (removeBackground(data.data, img.width, img.height)) {
      g.putImageData(data, 0, 0);
      source = full;
    }
  }
  const side = Math.round(Math.min(img.width, img.height) * (1 - 2 * trim));
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext("2d").drawImage(source, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toBuffer("image/webp", 82);
}
