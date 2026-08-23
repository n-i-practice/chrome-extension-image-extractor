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
  build: {
    rollupOptions: {
      input: {
        // もし既存の popup や background などの入力があればそこへ並べて追記
        // 例: popup: resolve(__dirname, 'index.html'),

        // ここを追記（content という名前で強制出力させる）
        content: resolve(__dirname, "src/content/content.js"),
      },
      output: {
        // ファイル名がハッシュ化（content-a1b2c3.js等）されるのを防ぎ固定化する
        entryFileNames: "[name].js",
      },
    },
  },
});
