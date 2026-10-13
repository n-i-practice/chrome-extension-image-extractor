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
    // 採用アイコンの各サイズのみ同梱し、元画像・未採用案は配布しない。
    fs.mkdirSync("dist/icons", { recursive: true });
    for (const size of [16, 24, 32, 48, 128]) {
      const filename = `icon${size}.png`;
      fs.copyFileSync(
        path.join("assets", "icons", filename),
        path.join("dist", "icons", filename),
      );
    }
  })
  .catch(() => process.exit(1));
