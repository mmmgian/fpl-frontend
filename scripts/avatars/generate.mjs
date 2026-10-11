#!/usr/bin/env node
// Draws a character avatar for each league manager who has no badge of their own, with a Google image model, and
// saves them into the repo (public/avatars/<entry>.webp + lib/avatars/manifest.json). Run by hand, never by the site.
//
//   cd scripts/avatars && npm install
//   npm run generate -- --dry-run          show what would be sent, send nothing
//   npm run generate                       generate ONE avatar (a cheap first test of your key and the model)
//   npm run generate -- --all              generate every missing avatar
//   npm run generate -- --only 2379133 --force     redraw one
//
// The key comes from GEMINI_API_KEY in the environment or in ../../.env.local (which git ignores). It is never printed.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR, ROOT, leagueRows, readManifest, sha, toWebp, writeAvatar, writeManifest } from "./io.mjs";
import { buildPrompt, buildRequest, DEFAULT_MODEL, explainNoImage, findImage, needsAvatar, parseArgs, parseEnv, redact } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const envFile = existsSync(join(ROOT, ".env.local")) ? parseEnv(readFileSync(join(ROOT, ".env.local"), "utf8")) : {};
  const key = process.env.GEMINI_API_KEY || envFile.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || envFile.GOOGLE_API_KEY;
  const model = opts.model || process.env.GEMINI_IMAGE_MODEL || envFile.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
  const league = opts.league ?? (Number(process.env.LEAGUE_ID || envFile.LEAGUE_ID) || 467763);

  if (!key && !opts.dryRun) {
    console.error("No API key. Put GEMINI_API_KEY=... in .env.local (it is git-ignored), or export it, then run again.\nOr add --dry-run to see what would be sent.");
    process.exit(2);
  }

  const manifest = readManifest();
  const rows = await leagueRows(league);
  let targets = rows.filter((r) => (opts.only ? r.entry === opts.only : true) && needsAvatar(r, manifest, { force: opts.force }));
  if (!opts.all && opts.only === null) targets = targets.slice(0, opts.limit);
  console.log(`League ${league}: ${rows.length} managers, ${rows.filter((r) => !r.club_badge_src).length} without a badge, ${Object.keys(manifest.avatars).length} avatars already made.`);
  console.log(`${targets.length} to draw with ${model} via the ${opts.api} API${opts.dryRun ? " (dry run: nothing will be sent)" : ""}.`);
  if (targets.length === 0) return;

  mkdirSync(OUT_DIR, { recursive: true });
  let made = 0;
  let failed = 0;
  for (const [i, row] of targets.entries()) {
    const prompt = buildPrompt(row.entry_name);
    if (!prompt) {
      console.log(`- ${row.entry} "${row.entry_name}": nothing usable in the team name, skipped`);
      continue;
    }
    const req = buildRequest({ api: opts.api, model, prompt, base: process.env.GEMINI_API_BASE || undefined });
    if (opts.dryRun) {
      console.log(`\n- ${row.entry} "${row.entry_name}"\n  POST ${req.url}\n  ${JSON.stringify(req.body)}`);
      continue;
    }
    try {
      const res = await fetch(req.url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(90_000) });
      const text = await res.text();
      if (!res.ok) {
        console.error(`- ${row.entry} "${row.entry_name}": the API answered ${res.status}: ${redact(text, key).slice(0, 400)}`);
        if ([400, 401, 403, 404, 429].includes(res.status)) {
          console.error("Stopping: that kind of error will repeat for every manager. Check the key, the model name (--model) and your quota, then try again.");
          break;
        }
        failed++;
        continue;
      }
      const image = findImage(JSON.parse(text));
      if (!image) {
        console.error(`- ${row.entry} "${row.entry_name}": no image came back (${redact(explainNoImage(JSON.parse(text)), key)})`);
        failed++;
        continue;
      }
      const webp = await toWebp(image.bytes);
      const file = `${row.entry}.webp`;
      writeAvatar(file, webp);
      manifest.avatars[row.entry] = { file, sha256: sha(webp), teamName: row.entry_name, model, api: opts.api, prompt, generatedAt: new Date().toISOString() };
      writeManifest(manifest);
      made++;
      console.log(`- ${row.entry} "${row.entry_name}": saved ${file} (${Math.round(webp.length / 1024)} KB)`);
    } catch (e) {
      console.error(`- ${row.entry} "${row.entry_name}": ${redact(e instanceof Error ? e.message : e, key)}`);
      failed++;
    }
    if (i < targets.length - 1) await sleep(opts.delayMs); // be gentle with the quota
  }
  if (!opts.dryRun) console.log(`\nDone: ${made} drawn, ${failed} failed. Look at public/avatars before committing; delete a file and its manifest entry to drop one.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
