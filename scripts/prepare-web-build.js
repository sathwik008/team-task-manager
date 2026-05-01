const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const distDir = path.join(root, "dist");
const assets = [
  "index.html",
  "styles.css",
  "app.js",
  "app-config.js",
  "manifest.webmanifest",
  "sw.js"
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(path.join(root, asset), path.join(distDir, asset));
}

console.log(`Prepared ${assets.length} web assets in ${distDir}`);
