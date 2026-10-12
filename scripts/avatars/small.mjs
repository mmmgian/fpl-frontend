#!/usr/bin/env node
// Makes the small (96 px) copy of every avatar that lacks one, from the full-size file. Safe to run again.
//   node scripts/avatars/small.mjs [--force]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR, smallName, writeAvatarSmall } from "./io.mjs";

const force = process.argv.includes("--force");
let made = 0;
for (const file of readdirSync(OUT_DIR).filter((f) => /^\d+\.webp$/.test(f))) {
  if (!force && existsSync(join(OUT_DIR, smallName(file)))) continue;
  await writeAvatarSmall(file, readFileSync(join(OUT_DIR, file)));
  made++;
}
console.log(`${made} small avatar${made === 1 ? "" : "s"} written`);
