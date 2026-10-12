#!/usr/bin/env node
// Imports the psychedelic mascots (psychedelic-mascots-web.zip, extracted) as public/psychedelic/<id>{,-s,-l}.webp:
// 96 px for badges, 256 px for the manager header, 512 px for the press-conference picture. Run from the project root:
//   node scripts/avatars/psychedelic.mjs <folder with manifest.json> [--eye <png of the blotter icon>]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const args = process.argv.slice(2);
const from = resolve(args[0] ?? "");
const out = resolve("public/psychedelic");
mkdirSync(out, { recursive: true });

async function resized(bytes, side) {
  const img = await loadImage(bytes);
  const c = createCanvas(side, side);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, side, side);
  return c.toBuffer("image/webp", 80);
}

const pkg = JSON.parse(readFileSync(join(from, "manifest.json"), "utf8"));
const manifest = { version: 1, managers: {} };
for (const m of pkg.managers) {
  const id = String(m.managerId);
  if (!/^\d{1,10}$/.test(id)) throw new Error(`bad managerId ${id}`);
  const bytes = readFileSync(join(from, m.assets.psychedelic.src));
  const l = await resized(bytes, 512);
  writeFileSync(join(out, `${id}-l.webp`), l);
  writeFileSync(join(out, `${id}.webp`), await resized(bytes, 256));
  writeFileSync(join(out, `${id}-s.webp`), await resized(bytes, 96));
  manifest.managers[id] = { file: `${id}-l.webp`, width: 512, height: 512, sha256: createHash("sha256").update(l).digest("hex") };
}
writeFileSync("lib/mascots/psychedelic.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`${Object.keys(manifest.managers).length} psychedelic mascots written`);

const eye = args.indexOf("--eye");
if (eye >= 0) {
  // The blotter-paper sun: cropped square from the scan, small enough for a footer icon.
  const img = await loadImage(readFileSync(resolve(args[eye + 1])));
  const c = createCanvas(96, 96);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 410, 400, 1190, 1200, 0, 0, 96, 96);
  writeFileSync("public/brand/blotter-sun.webp", c.toBuffer("image/webp", 85));
  console.log("blotter-sun.webp written");
}
