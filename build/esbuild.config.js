const esbuild = require("esbuild");
const fs = require("fs");

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
]).catch(() => process.exit(1));
