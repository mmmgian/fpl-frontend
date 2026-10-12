#!/usr/bin/env node
// Imports mascot images made elsewhere (e.g. in a chat image tool) as the league's avatars.
//
//   npm run import -- --from ~/Downloads/league-mascots-21                 PREVIEW: check the folder, make a contact sheet, write nothing
//   npm run import -- --from ~/Downloads/league-mascots-21 --write         save them (public/avatars/<id>.webp + lib/avatars/manifest.json)
//
// Files must start with the manager's FPL id ("2379133-gaucho-f-c.png"). Anything that doesn't line up is reported and
// nothing is written until it does (or you pass --allow-partial).
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { leagueRows, readManifest, sha, toWebp, writeAvatar, writeAvatarSmall, writeManifest } from "./io.mjs";
import { planImport } from "./lib.mjs";

function args(argv) {
  const o = { from: null, write: false, force: false, allowPartial: false, sheet: join(tmpdir(), "mascot-contact-sheet.png"), trim: 0, keepBackground: false, league: Number(process.env.LEAGUE_ID) || 467763 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") o.from = argv[++i];
    else if (a === "--write") o.write = true;
    else if (a === "--force") o.force = true;
    else if (a === "--allow-partial") o.allowPartial = true;
    else if (a === "--sheet") o.sheet = argv[++i];
    else if (a === "--trim") o.trim = Number(argv[++i]);
    else if (a === "--keep-background") o.keepBackground = true;
    else if (a === "--league") o.league = Number(argv[++i]);
    else throw new Error(`Unknown option ${a}`);
  }
  if (!o.from) throw new Error("Say where the images are: --from <folder>");
  if (!(o.trim >= 0 && o.trim < 0.4)) throw new Error("--trim must be between 0 and 0.4 (a fraction of each edge to cut)");
  o.from = resolve(o.from.replace(/^~(?=$|\/)/, homedir()));
  return o;
}

/** One image of everything: each mascot large, then at the three sizes the site shows it (64, 44 and 28 px), on light and dark. */
async function contactSheet(items, path) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const cols = 7, cellW = 250, cellH = 230, pad = 12;
  const rows = Math.ceil(items.length / cols);
  const canvas = createCanvas(cols * cellW + pad, rows * cellH + pad);
  const g = canvas.getContext("2d");
  g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.textBaseline = "middle";
  for (const [i, it] of items.entries()) {
    const x = pad + (i % cols) * cellW, y = pad + Math.floor(i / cols) * cellH;
    const img = await loadImage(it.webp);
    g.fillStyle = "#ffffff"; g.fillRect(x, y, 112, 112);
    g.fillStyle = "#181818"; g.fillRect(x + 114, y, 112, 112);
    g.drawImage(img, x, y, 112, 112);
    g.drawImage(img, x + 114, y, 112, 112);
    g.fillStyle = "#111"; g.font = "bold 15px sans-serif";
    g.fillText(it.teamName.slice(0, 26), x + 2, y + 128);
    g.fillStyle = "#777"; g.font = "12px sans-serif"; g.fillText(String(it.entry), x + 2, y + 146);
    // previews in the site's circle, on a light and a dark panel
    for (const [bg, k] of [["#ffffff", 0], ["#181818", 1]]) {
      g.fillStyle = bg; g.fillRect(x + k * 113, y + 158, 111, 58);
      let cx = x + k * 113 + 6;
      for (const d of [44, 28, 20]) {
        g.save(); g.beginPath(); g.arc(cx + d / 2, y + 187, d / 2, 0, Math.PI * 2); g.clip();
        g.drawImage(img, cx, y + 187 - d / 2, d, d); g.restore();
        cx += d + 6;
      }
    }
  }
  const { writeFileSync } = await import("node:fs");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canvas.toBuffer("image/png"));
}

async function main() {
  const o = args(process.argv.slice(2));
  const files = readdirSync(o.from).filter((f) => !f.startsWith("."));
  const rows = await leagueRows(o.league);
  const plan = planImport(files, rows);

  console.log(`${files.length} files in ${o.from}; league ${o.league} has ${rows.length} managers.`);
  console.log(`matched ${plan.matched.length}, unmatched ${plan.unmatched.length}, duplicates ${plan.duplicates.length}, managers without a file ${plan.missing.length}`);
  for (const u of plan.unmatched) console.log(`  ! ${u.file}: ${u.reason}`);
  for (const d of plan.duplicates) console.log(`  ! two files for ${d.entry}: ${d.files.join(" and ")}`);
  for (const m of plan.missing) console.log(`  ! no image for ${m.entry} "${m.teamName}"`);

  const items = [];
  for (const m of plan.matched) {
    const bytes = readFileSync(join(o.from, m.file));
    items.push({ ...m, webp: await toWebp(bytes, { trim: o.trim, keepBackground: o.keepBackground }) });
  }
  await contactSheet(items, o.sheet);
  console.log(`contact sheet: ${o.sheet}`);

  if (!o.write) return console.log("\nPreview only: nothing saved. Add --write to save these.");
  if (!plan.ok && !o.allowPartial) {
    console.error("\nNot saving: the folder doesn't line up with the league (see above). Fix it, or pass --allow-partial to save what matched.");
    process.exit(2);
  }
  const manifest = readManifest();
  let saved = 0, skipped = 0;
  for (const it of items) {
    if (manifest.avatars[it.entry] && !o.force) { skipped++; console.log(`- ${it.entry} "${it.teamName}": already has an avatar, kept (use --force to replace)`); continue; }
    const file = `${it.entry}.webp`;
    writeAvatar(file, it.webp);
    await writeAvatarSmall(file, it.webp);
    manifest.avatars[it.entry] = { file, sha256: sha(it.webp), teamName: it.teamName, model: "imported", api: "manual", source: it.file, generatedAt: new Date().toISOString() };
    saved++;
  }
  writeManifest(manifest);
  console.log(`\nSaved ${saved}, kept ${skipped}. Look at public/avatars before committing.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
