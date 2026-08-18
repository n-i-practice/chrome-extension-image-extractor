# Chrome Extension Template

Chrome拡張を作るための最小構成テンプレート。

## 構成

- manifest.json
- src/background/
- src/content/
- src/viewer/

## 基本方針

- popup は使用しない
- 拡張アイコンクリック時に `chrome.action.onClicked` で viewer を開く
- background は `src/background/background.js` に配置する
- content script は `src/content/content.js` に配置する
- viewer は `src/viewer/viewer.html` を表示する
- manifest / background / viewer の参照パスは常に一致させる

## 使い方

1. このテンプレートから新規リポジトリを作成する
2. Chrome の拡張機能ページで読み込む
3. 拡張アイコンをクリックして viewer が新しいタブで開くことを確認する
