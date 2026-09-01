// vite.config.js
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src/viewer", // rootをsrc/viewerに設定することで、Viteがこのディレクトリを基準に扱い、viewer.htmlをoutDirの直下に出力する
  base: "",
  build: {
    outDir: resolve(
      import.meta.dirname,

      "dist/viewer",
    ), // 絶対パス推奨
    emptyOutDir: false,
    rollupOptions: {
      input: {
        viewer: resolve(import.meta.dirname, "src/viewer/viewer.html"),
      },
    },
  },
});
