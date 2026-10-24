# Image Extractor — 全体仕様

本書は現在実装されている動作を記載する。Viewerの詳細は [VIEWER_SPEC.md](VIEWER_SPEC.md)、未実装機能と公開準備の進捗は [TODO.md](TODO.md) を参照。

## 概要

Image Extractorは、拡張アイコンを押した時点のアクティブタブから画像URLを抽出し、新しいタブのViewerで一覧・拡大・原寸表示するManifest V3のChrome拡張。

ページ内の全画像を取得できることは保証しない。元ページのDOMにまだ存在しない画像や、配信元の制限でViewerから読み込めない画像は表示できない。

## 実装済みの主な機能

- `<img>` とCSSの背景画像から画像URLを抽出する。
- 相対URLの絶対化と、正規化後のURL完全一致による重複除外。
- 別タブでの一覧表示、自然サイズ・URLから判定した拡張子の表示。
- 最小幅・最小高さフィルター（初期値は両方400px）と、SVG / GIFの非表示フィルター。
- 読み込み中・表示中・失敗・フィルター非表示の件数表示。読み込みに失敗した画像は一覧から除外する。
- 画像カードのクリックでモーダルを開く。拡大・原寸表示、原寸画像のドラッグ、前後移動、Escapeなどでの終了に対応。
- 日本語・英語の切り替えと、言語設定の保存。
- Viewerごとの一覧の分離と、複製したViewer間での同じ一覧の保持。
- 抽出失敗・保存失敗・保存件数上限・画像読み込み失敗の案内。

## 実行モデル

1. `chrome.action.onClicked` でアクティブタブを確認する。popupは使用しない。
2. 初回は `scripting.executeScript` でcontent scriptを注入し、画像を抽出する。
3. 同じページで再度アイコンを押した場合は、登録済みの `window.extractImages()` を呼び、改めて抽出する。
4. content scriptは、その実行時点のDOMと適用済みスタイルを一括走査し、URLを正規化・重複除外してbackgroundへ送る。
5. backgroundはURLを再度正規化・重複除外し、最大1500件をセッションへ保存して新しいViewerを開く。
6. Viewerは一覧を読み込み、画像の自然サイズが確定するとフィルターと件数を更新する。

DOMの継続監視・追加画像の自動追記・一定時間後の監視終了は実装していない。スクロール後の画像を取得するには、元ページで読み込ませてから再度アイコンを押す。再抽出では既存一覧へ追記せず、新しい一覧を開く。

## 抽出対象と制限

- `<img>` 自身に `srcset` がある場合は候補を選択し、候補がなければ `currentSrc`、次に `src` を使用する。
- `<picture>` / `<source>` の `srcset` を直接走査する処理はない。ブラウザーが選択済みのURLは、内側の `<img>` の `currentSrc` から取得する場合がある。
- 要素と疑似要素（`::before` / `::after`）の、適用済み `background-image` から `url(...)` を抽出する。グラデーションは画像URLとして扱わない。
- CSSは `getComputedStyle` で取得し、スタイルシートの全ルールを直接走査しない。CSS画像の完全抽出は保証しない。
- 既存要素の `blob:` / `data:` URLも正規化経路で保持する。ただし、元ページが生成したobject URLの別タブでの表示や、各形式の対応範囲は未検証部分がある。object URLを別途生成・探索する機能はない。
- `<meta property="og:image">`、`<video poster>`、CSS `content: url()`、`<link rel="preload" as="image">` の専用抽出処理はない。追加候補は [TODO.md](TODO.md) に集約する。
- Shadow DOM内部の探索、canvasの描画内容の書き出し、通信上だけに現れる画像URLの収集は行わない。DOM監視と通信監視は公開後の候補であり、現行の抽出対象には含めない。

## URL重複除外（正規化）

- 相対パスは `new URL(path, location.href)` で絶対化する。
- 空・無効なURLは除外する。
- HTTP / HTTPSやクエリが異なるURLは別物として扱う。
- `blob:` / `data:` は前後の空白を除いた文字列を使用する。
- 正規化後のURLが完全一致するものを、出現順を維持して1件にまとめる。画像内容のハッシュ比較は行わない。

## srcsetの候補選択

- `w` は数値が大きい候補、`x` は倍率が大きい候補を選ぶ。
- descriptorのない有効な候補がある場合は、走査順で最初の該当URLを返す。
- 有効な候補がない場合は、呼び出し元で `currentSrc` / `src` を使用する。
- 選択したURLの読み込みに失敗しても、次のsrcset候補へは切り替えない。失敗時の候補フォールバックは [TODO.md](TODO.md) の機能追加候補。

## Viewer内のデータ構造

backgroundからViewerへ渡す画像一覧はURLの配列（`string[]`）。ViewerはURLごとに次のレコードを生成する。

```ts
interface ImageRecord {
  id: string;
  src: string;
  ext: string;
  naturalWidth: number;
  naturalHeight: number;
  isValid: boolean;
}
```

自然サイズは読み込み前には0、`isValid` はfalse。読み込み成功後に更新する。拡張子はURLから判定し、不明な場合は「—」を表示する。画像本体やMIMEタイプからの形式判定は行わない。

---

## background ↔ viewer のデータ受け渡し

### ● メッセージ設計

```
content → background:
  chrome.runtime.sendMessage({ type: "image-urls", payload: string[] })

background → session:
  chrome.storage.session.set({
    "images:<id>": string[],       // 一覧本体
    "imagesNotice:<id>": ImagesNotice // 件数上限・受け渡し方法の通知
  })
  // タブ作成後の登録で追加する情報
  chrome.storage.session.set({
    "viewerTab:<tabId>": "<id>", // タブ閉じ時の掃除用
    "viewerRefs:<id>": number[]  // 同じ一覧を参照するタブID
  })

background → viewer:
  tabs.create({ url: "viewer/viewer.html?id=<id>" })

viewer → background:
  chrome.runtime.sendMessage({ type: "viewer-opened", sessionId })
  （複製タブ含む。参照カウント登録用）

viewer:
  URL の id から "images:<id>" を読み込む
```

### ● chrome.storage.session の扱い（重要）

#### 通常経路（採用）

- 抽出結果は **viewer インスタンスごとに別キー** で session に保存する
- キー形式: `images:<uuid>`
- viewer は `viewer.html?id=<uuid>` で開き、自分の id のキーだけを読む
- これにより、複数タブで拡張を実行しても一覧が取り違えられない
- F5（同一タブのリロード）では tabId が変わらないため session は残し、同じ一覧を再表示する

#### 同一 id を複数タブで開いた場合（タブ複製・URL 貼り付け）

- viewer 起動時に `viewer-opened` で background へ登録する
- `viewerRefs:<uuid>` に開いている tabId 一覧を保持する（参照カウント）
- タブを閉じても、同じ id を参照するタブが残っている間は `images:<uuid>` を消さない
- 最後の参照タブが閉じたときだけ `images:<uuid>` と refs を削除する

#### タブを閉じたときの掃除

- background が `viewerTab:<tabId> → <uuid>` と `viewerRefs:<uuid>` を session に保持する
- `chrome.tabs.onRemoved` で参照を外し、必要なら images を削除する
- `tabs.create` 後の対応表登録と `onRemoved` の競合対策として、登録直後に `tabs.get` で生存確認し、既に閉じていればすぐ掃除する
- 参照一覧（`viewerRefs`）の更新は background 内のキューで直列化し、同時開閉による上書きを防ぐ
- ページの `beforeunload` では F5 と閉じるの区別が難しいため使わない
- Chrome 終了時は `storage.session` 自体が消える（永続化されない）

#### 容量・失敗時

- session の容量制限により、**画像保存上限は「最大 1500 件」** とする（超過分は先頭 1500 件のみ保存し、viewer に通知）
- 保存失敗時は fallback として viewer へメッセージで一覧を渡す（`delivery=fallback`）。この場合 F5 では消えることがある
- 抽出スクリプトの注入・実行に失敗した場合は、エラー表示用の viewer を開く

---

## Manifest V3 の正式定義

```json
{
  "manifest_version": 3,
  "default_locale": "en",
  "name": "__MSG_appName__",
  "version": "1.0",
  "description": "__MSG_appDescription__",

  "permissions": ["activeTab", "scripting", "storage"],

  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },

  "background": {
    "service_worker": "scripts/background.js",
    "type": "module"
  },

  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "24": "icons/icon24.png",
      "32": "icons/icon32.png"
    },
    "default_title": "__MSG_actionTitle__"
  }
}
```

権限はアイコン押下時の一時アクセス（`activeTab`）、画像抽出処理の注入（`scripting`）、画像一覧・参照情報・言語設定の保存（`storage`）に限定する。タブIDでの管理に `tabs` 権限は不要。全サイトへの `host_permissions` は要求しない。

抽出スクリプトは `scripting.executeScript` で注入するため、`web_accessible_resources` として外部ページへ公開しない。将来のDOM監視は未実装のため、導入時に権限と監視終了条件を改めて確認する。

---

## 現在の表示負荷への対応

- content scriptとbackgroundでURLの重複を除き、保存・表示するURLは最大1500件に制限する。
- Viewerでは各画像の読み込み成功・失敗に応じてフィルターと件数を再評価する。
- Lazy Load、一覧の仮想化、継続収集のバッチ処理による負荷対策は未実装。必要性の確認と実装候補は [TODO.md](TODO.md) で管理する。

## 寄付リンク

- 機能は無料で利用でき、任意のKo-fi寄付リンクをViewer右上に置く。
- 公式ボタン画像は拡張に同梱し、外部のウィジェットスクリプトは実行しない。
- ボタンはKo-fiの支援ページを別タブで開く。
- Pro版や広告は実装していない。導入の是非は [TODO.md](TODO.md) の検討候補であり、機能制限の予定は確定していない。

## 多言語対応

- Viewerは `src/i18n/` の英語・日本語辞書を使用する。辞書キーは `types.ts`、翻訳と静的文言の適用は `index.ts` で管理する。
- 言語の決定順は `chrome.storage.local` の保存設定、ブラウザーの言語、英語（`en`）へのフォールバック。未対応言語も英語で表示する。
- 言語切り替え時は設定を保存し、フィルターの入力値・適用条件・画像一覧を維持して文言を再描画する。通知とエラー表示も対象に含む。
- 拡張名・説明・ツールバーツールチップはViewer辞書と別に `_locales/en/`・`_locales/ja/` で管理し、`default_locale` は `en`。製品名は両言語ともImage Extractorとする。
- UI文言の追加・変更は日英の辞書を同時に更新する。ログや内部変数名は翻訳対象に含めない。

## ブラウザー・配信元による制限

- Chromeがスクリプト注入を許可しないページでは抽出できない。
- アイコンを押した時点でDOMや適用済みスタイルから参照できる画像が対象で、SPA内部の状態を継続監視しない。
- Viewerでの画像表示には配信元への通信が発生する。配信元の制限などで読み込めない場合は、自然サイズも取得できず一覧から除外する。
- URLの拡張子と実際の画像形式が一致することは保証しない。

## 今後の機能候補

継続収集、抽出対象の追加、表示負荷改善、ZIPダウンロード、再試行、ソートなどの優先度・検討内容は [TODO.md](TODO.md) に集約する。本書の実装済み仕様には含めない。
