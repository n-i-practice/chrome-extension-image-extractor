// vite.config.js
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  server: {
    watch: {
      usePolling: true, // ファイルの変更を強制的に定期監視する
      interval: 1000, // 1秒ごとにチェック
    },
  },
});
