import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, "../public");
const masterPath = path.join(publicDir, "icon.svg");
const master = await fs.readFile(masterPath, "utf8");
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(master).toString("base64")}`;
const outputs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-512-maskable.png", 512],
  ["apple-touch-icon.png", 180],
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const [filename, size] of outputs) {
    await page.setContent(`<!doctype html><style>html,body{margin:0;padding:0;background:#050708}</style><img id="icon" width="${size}" height="${size}" src="${svgDataUrl}" alt="" />`);
    await page.locator("#icon").screenshot({ path: path.join(publicDir, filename), type: "png" });
  }
} finally {
  await browser.close();
}

// favicon.svg is intentionally maintained as a dedicated small-size variant.
// Do not overwrite it from icon.svg: browser tabs need heavier, simpler geometry
// than home-screen/PWA icons to remain legible at 16–32 px.
console.log(`Generated ${outputs.length} raster app icons from public/icon.svg; favicon assets are maintained separately`);
