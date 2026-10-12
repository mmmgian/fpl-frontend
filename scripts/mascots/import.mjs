#!/usr/bin/env node
/**
 * Imports the manager mascot package (manifest.json + web/*.webp) into public/mascots and writes lib/mascots/manifest.json.
 * Managers are joined by managerId (the FPL entry id) only. Preview only unless --write.
 *   node scripts/mascots/import.mjs --from ~/Downloads/manager-mascot-web [--write]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const from = resolve((val("--from") ?? "~/Downloads/manager-mascot-web").replace(/^~/, homedir()));
const write = flag("--write");
const root = resolve(import.meta.dirname, "../..");
const ROLES = ["action", "press"]; // avatars stay as the transparent ones in public/avatars

const pkg = JSON.parse(readFileSync(join(from, "manifest.json"), "utf8"));
const out = { version: 1, managers: {} };
const problems = [];
for (const m of pkg.managers) {
  const id = String(m.managerId);
  if (!/^\d{1,10}$/.test(id)) { problems.push(`bad managerId ${id}`); continue; }
  const entry = {};
  for (const role of ROLES) {
    const a = m.assets?.[role];
    const src = a && join(from, a.src);
    if (!a || !existsSync(src)) { problems.push(`${id}: missing ${role}`); continue; }
    const bytes = readFileSync(src);
    const file = `${id}-${role}.webp`;
    entry[role] = { file, width: a.width, height: a.height, sha256: createHash("sha256").update(bytes).digest("hex") };
    if (write) { mkdirSync(join(root, "public/mascots"), { recursive: true }); copyFileSync(src, join(root, "public/mascots", file)); }
  }
  out.managers[id] = entry;
}
console.log(`${Object.keys(out.managers).length} managers, ${problems.length} problems`);
problems.forEach((p) => console.log("  ", p));
if (write && !problems.length) {
  writeFileSync(join(root, "lib/mascots/manifest.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("written");
} else if (!write) console.log("preview only (use --write)");
