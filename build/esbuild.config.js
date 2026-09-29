const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

fs.mkdirSync("dist/scripts", { recursive: true });

Promise.all([
  esbuild.build({
    entryPoints: ["src/background/background.ts"],
    outfile: "dist/scripts/background.js",
    bundle: true,
    format: "esm",
    target: "es2022",
  }),
  esbuild.build({
    entryPoints: ["src/content/content.ts"],
    outfile: "dist/scripts/content.js",
    bundle: true,
    format: "iife",
    target: "es2022",
  }),
])
  .then(() => {
    fs.copyFileSync("manifest.json", "dist/manifest.json");
    // Chrome の拡張名 / 説明 / アクション用。viewer の辞書とは別系統。
    fs.cpSync("_locales", path.join("dist", "_locales"), { recursive: true });
  })
  .catch(() => process.exit(1));
