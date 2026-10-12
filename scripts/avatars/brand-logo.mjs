// Makes the 2x copy of the header logo (96x64 shown, 192x128 sent): node scripts/avatars/brand-logo.mjs (from the project root)
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const img = await loadImage(readFileSync("public/brand/lobster-league.webp"));
const canvas = createCanvas(192, 128);
const g = canvas.getContext("2d");
g.imageSmoothingQuality = "high";
g.drawImage(img, 0, 0, 192, 128);
writeFileSync("public/brand/lobster-league-192.webp", canvas.toBuffer("image/webp", 82));
