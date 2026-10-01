# Image Extractor

Webページから画像を抽出し、専用の viewer で一覧表示する Chrome 拡張。

## 機能

- `<img>` の画像 URL 抽出
- `srcset` の最大解像度抽出
- CSS `background-image` の抽出
- `<meta property="og:image">` の抽出
- `<video poster>` の抽出
- 動的に追加された画像の検知（MutationObserver）
- viewer で画像一覧を表示
- 画像クリックで新しいタブを開く

## 構成

```
manifest.json
vite.config.js
src/
  background/
    background.js
  content/
    content.js
  viewer/
    viewer.html
    viewer.js
dist/（ビルド成果物）
```

## 方針

- popup は使用しない
- 拡張アイコンクリック時に viewer を新規タブで開く
- background / content / viewer は ES Modules で構成
- 抽出ロジックはモジュール化して管理
- manifest / background / viewer の参照パスは常に一致させる

## ビルド環境

この拡張は **Vite + @crxjs/vite-plugin** を使用して MV3 拡張をビルドします。

- manifest.json はプロジェクトルートに配置
- dist/ に Chrome 拡張として読み込める成果物が生成されます

### 開発

```
npm run dev
```

### ビルド

```
npm run build
```

### Chrome への読み込み

1. `npm run build` で dist/ を生成
2. Chrome の拡張機能ページで「パッケージ化されていない拡張機能を読み込む」
3. dist/ ディレクトリを選択

## 注意事項

- `node_modules/`、`dist/`、`.vite/` は Git 管理しません
- `manifest.json`、`vite.config.js`、`package.json`、`package-lock.json` は Git 管理します
- content_scripts のパスは Vite のルート基準で記述します

## テスト

`npm test` でセッション管理の回帰テストを実行します。
対象範囲と Chrome での手動確認手順は [docs/TESTING.md](docs/TESTING.md) を参照してください。

## ライセンス

MIT
