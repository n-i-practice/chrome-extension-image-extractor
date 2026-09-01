# 📝 開発メモ：Vite環境における Chrome 拡張機能（Manifest V3）動的注入の実装ログ

## 開発のゴール

- ページ読み込み時の自動実行を廃止する。
- **拡張機能のアイコン（Action アイコン）をクリックした瞬間にのみ**、アクティブタブから画像 URL を抽出するスクリプト（`content.js`）を実行する仕様へ変更する。

---

## 直面した課題と解決のプロセス

### 📌 課題①：ページ読み込み時に自動実行されてしまう

**原因**  
`manifest.json` に `content_scripts` が定義されていたため、Chrome の仕様でページ読み込み時に自動実行されていた。

**対策**  
`manifest.json` から `content_scripts` を完全に削除し、  
`chrome.action.onClicked` をトリガーにした動的注入へ切り替えた。

---

### 📌 課題②：`Could not load file: 'src/content/content.js'` エラー

**原因**  
Vite 環境では、`manifest.json` に記述されていないファイルは「デッドコード」と判断され、  
ビルド成果物（`dist/`）に出力されなくなる。  
さらに開発モードでは CRXJS によってファイル名がローダー化されるため、  
パスの直書きでは開発と本番でパスが一致しない。

**対策**  
`background.js` の最上部で以下を導入：

```js
import contentScriptPath from "../content/content.js?script";
```

これにより、Vite が開発・本番それぞれの環境に応じた  
「正しい出力パス（文字列）」を自動で返すようになり、  
パス不一致問題が解消された。

---

### 📌 課題③：2回目以降のクリックで抽出が走らない

**原因**  
`content.js` を IIFE で囲んでいたため、  
Chrome が「このファイルはすでに読み込み済み」と判断し、  
2回目以降は初期化コードが実行されなかった。

**対策**

1. 抽出処理を `function extractImages() { ... }` に分離。
2. `window.extractImages = extractImages;` として isolated world に登録。
3. 初回注入時に自動実行されるよう、`extractImages();` を最下部に配置。

---

### 📌 課題④：初回実行時に関数が見つからない（タイミング問題）

**原因**  
`files` による注入と `func` による実行を連続で行うと、  
ブラウザがファイルをパースして `window` に関数を登録する前に  
実行命令が到達してしまい、初回のみ `undefined` になる。

---

### 📌 課題⑤：content.js のビルド出力と開発モードでのファイル名変換問題

Vite（＋CRXJS）の環境では、`content.js` を manifest.json に記述しない場合、  
Vite が「未使用ファイル」と判断して dist に出力しない仕様がある。  
これを防ぐため、以下のように `vite.config.js` の `rollupOptions.input` に  
content.js を明示的に登録する方法を採用した。

```js
// vite.config.js
import { resolve } from "path";

export default {
  build: {
    rollupOptions: {
      input: {
        // content.js を強制的にビルド対象へ追加
        content: resolve(__dirname, "src/content/content.js"),
      },
      output: {
        // ハッシュ化を防ぎ、固定ファイル名で出力させる
        entryFileNames: "[name].js",
      },
    },
  },
};
```

これにより、本番ビルド（`npm run build`）では  
`dist/content.js` のような **ハッシュなしの固定名**で出力されるようになった。

---

### ⚠ ただし、開発モードでは別問題が発生する

開発モード（`npm run dev`）では CRXJS が content script をローダー経由で扱うため、  
実際には以下のような **変換済みファイル名**で提供される。

- `content.js.js`
- `content.js-loader.js`
- `content.js?import`
- など、環境に応じて複数の派生名が生成される

そのため、background.js 側で以下のように固定名を指定しても動作しない。

```js
files: ["content.js"]; // ❌ dev では存在しない
```

---

### 🛠 対策：`?script` を付けたインポートで開発・本番の両方に対応

CRXJS が提供する `?script` クエリを使うことで、  
開発モードではローダー化された正しいパスを、  
本番ビルドでは固定名の `content.js` を、  
**Vite／CRXJS が自動で解決してくれる**ようになる。

```js
// background.js
import contentScriptPath from "../content/content.js?script";

await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: [contentScriptPath], // dev と build の両方で正しいパスになる
});
```

---

### 🎯 まとめ

- `rollupOptions.input` に登録することで **本番ビルドでは固定名で出力される**
- 開発モードでは CRXJS がローダー化するため **ファイル名が変わる**
- その差異を吸収するために **`?script` が必須**
- 結果として、background.js から content.js を安定して動的注入できるようになった

ｰｰｰ

## 到達したベストプラクティス（最適解）

### 🏆 状態判定による `if-else` 分岐

```js
const checks = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => typeof window.extractImages === "function",
});
const hasFunction = checks?.[0]?.result;

if (hasFunction) {
  // 2回目以降：軽量ルート
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.extractImages(),
  });
} else {
  // 初回：content.js を注入して自動実行
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [contentScriptPath],
  });
}
```

### 🎯 メリット

1. **CSP を完全回避**  
   動的 script タグ生成を使わず、Chrome 公式の `files` のみ使用するため  
   X や GitHub などセキュリティが厳しいサイトでも確実に動作する。

2. **圧倒的に軽い**  
   2回目以降はファイル再注入をスキップし、  
   isolated world 内の関数を即時実行するだけ。

3. **タイミング問題の完全解消**  
   初回と2回目以降で処理ルートが完全に分離されるため、  
   “関数がまだ登録されていない” という race condition が構造上発生しない。

---

## 最終構成（まとめ）

- `manifest.json`：content_scripts を削除した最小構成
- `background.js`：状態判定＋動的注入＋関数実行
- `content.js`：関数化＋ isolated world への登録＋初回自動実行
- Vite：`?script` によるパス解決で開発・本番の差異を吸収

---

## 5. 学びと今後の指針

- MV3 の content script は isolated world で動作するため、  
  background の window と共有されないことを常に意識する。
- Vite＋CRXJS のビルドは「manifest に書かれていないファイルは出力されない」点が重要。
- 動的注入は「初回注入」「2回目以降」の分岐が最も安定する。

---

## 6. TypeScript 化後の現在の状態メモ

### 現在の構成

本番・開発両方を意識した構成に整理した。主な変更点は以下の通り。

- JavaScript の `background.js` / `content.js` / `viewer.js` を削除し、
  TypeScript 版の `background.ts` / `content.ts` / `viewer.ts` を採用
- `manifest.json` の `background.service_worker` を `.ts` に更新
- `tsconfig.json` を追加して、TypeScript の型チェックを有効化
- `@types/chrome` を導入して Chrome API の型定義を利用
- `vite.config.js` で CRXJS プラグインを統合し、Chrome 拡張向けの Vite ビルドに対応

### ビルド環境の意図

今回の修正で狙ったのは「拡張機能本体を JS ではなく TS で安全に書く」ことと、
「Vite + CRXJS が拡張機能のファイル解決を正しく行うようにする」ことだった。

- `background.ts` 側では `import contentScriptPath from "../content/content.ts?script";` を使い、
  開発時と本番時で path 解決の差異を吸収する
- `content.ts` 側では `window.extractImages` をグローバルに登録し、
  初回注入時と 2 回目以降の実行を分岐させる
- `viewer.ts` 側では `chrome.storage.session.get("images")` を使い、
  抽出した URL 一覧を viewer へ受け渡す構造に整理した

### 今回の設計判断

- `content_scripts` は manifest 上から削除し、
  「アイコン押下時のみ動的注入」という MV3 の推奨パターンに統一
- 抽出ロジックを `extractImages()` に切り出したことで、
  初回注入後の再利用ができるようにした
- TypeScript にすることで、Chrome API と DOM API のアクセスをより安全に記述できるようになった

### 現在の実運用状態

現在の環境では `npm run dev` は通っており、
開発サーバー起動と CRXJS による拡張開発フローは成立している。
一方で、本番用の `npm run build` は別の課題が残っており、
そこは本番ビルド専用のパス解決や出力設定の見直しが必要である。

つまり、この時点では「開発動作は確認できているが、
本番ビルドの最適化・安定化が残っている」という状態である。

### まとめ

この後の作業では、
「TypeScript 化」「Chrome 拡張の MV3 設計」「Vite / CRXJS のファイル解決」
の 3 点をまとめて管理できる状態になっている。  
そのため、今後の修正は本番ビルド向けの設定整備が中心になる。

---
