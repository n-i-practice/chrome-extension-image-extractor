# Chrome 拡張プロジェクトの指示

## プロジェクト方針

- popup は明示的に必要な場合を除き使用しない
- viewer を開くには `chrome.action.onClicked` を優先する
- background は `src/background/` 配下に置く
- content script は `src/content/` 配下に置く
- viewer は `src/viewer/` 配下に配置する
- `manifest.json`、`src/background/background.js`、`src/content/content.js`、viewer のパスが常に一致していることを確認する
- このプロジェクトでは `default_popup` を定義しない。viewer はアクションボタンから開く
- 変更を完了と判断する前に、manifest、background、content、viewer のパス整合性を確認する
- ユーザー向け UI 文言を追加・変更するときは、同じ変更で `src/i18n/`（en/ja）も更新する（詳細は `.cursor/rules/i18n.mdc`）
- 実装・変更時は意図が追える程度のコメントを残す（詳細は `.cursor/rules/comments.mdc`）
