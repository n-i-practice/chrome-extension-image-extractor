# Chrome拡張開発メモ（整理版）

## 1. 目的

- ページ読み込み時に自動実行しない
- Action アイコン押下時にのみ対象タブから画像 URL を抽出する
- Chrome 拡張として開発・本番の両方で動く構成を整える
- TypeScript 化後も、開発サーバーと本番ビルドが安定するようにする

---

## 2. 最終構成

最終的に採用した構成は、CRXJS をやめて「Vite + esbuild のハイブリッド構成」だった。

- viewer UI: Vite
- background / content: esbuild
- manifest: 手動コピー
- dist 配布物: 固定パスで生成

ポイントは、Chrome 拡張の MV3 と相性が良いように、動的注入・固定ファイル名・相対パスを揃えたこと。

---

## 3. 直面した問題と結論

### 3.1 `content_scripts` を定義すると自動実行される

原因:

- MV3 では `content_scripts` はページロード時に自動注入される

対策:

- `manifest.json` から `content_scripts` を削除
- `chrome.action.onClicked` で動的注入するよう変更

---

### 3.2 `content.js` のパス解決が崩れる

原因:

- Vite + CRXJS では、開発時と本番時で content script のファイル名が変わる
- そのため固定パスで参照すると壊れる

実際に起きた変換例:

- `content.js-loader.js`
- `content.js?import`
- `content.js.js`

結論:

- 固定パス依存は破綻しやすい
- CRXJS での自動解決も、MV3 の動的注入と相性が悪かった

---

### 3.3 viewer の asset パスが extension で壊れる

原因:

- Vite が生成する `/assets/...` の絶対パスが Chrome 拡張では不整合になる

対策:

- `vite.config` に `base: ""` を設定
- viewer を相対パスで読ませる

---

### 3.4 CRXJS 自体が MV3 と合わない

実際に遭遇した問題:

- manifest に content script がないとビルドされない
- dev と build で生成名が変わる
- ローダーが挙動を隠し、原因調査が困難
- viewer の読み込みパスや content script の注入パスが不安定になる

結論:

- 「MV3 の動的注入 + viewer UI + 本番ビルド」を安定させるには、CRXJS より esbuild ベースの構成のほうが適していた

---

## 4. 成功した実装パターン

### 4.1 background 側の動的注入

初回と2回目以降の処理を分岐させた。

```ts
const checks = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => typeof window.extractImages === "function",
});

const hasFunction = Boolean(checks?.[0]?.result);

if (hasFunction) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.extractImages(),
  });
} else {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [contentScriptPath],
  });
}
```

ポイント:

- 初回注入時は content script を読み込む
- 2回目以降は既存の関数を再利用する
- `files` と `func` のタイミング差を避けて初回失敗を防ぐ

---

### 4.2 content script 側の構造

content script は `extractImages()` を切り出し、`window.extractImages` に登録した。

```ts
function extractImages(): void {
  const imgs = Array.from(document.querySelectorAll("img"));
  const srcList: string[] = [];

  imgs.forEach((img) => {
    const srcset = img.getAttribute("srcset");
    const bestSrc = srcset ? getLargestFromSrcset(srcset) : null;

    if (bestSrc) {
      srcList.push(bestSrc);
    } else if (img.currentSrc) {
      srcList.push(img.currentSrc);
    } else if (img.src) {
      srcList.push(img.src);
    }
  });

  chrome.runtime.sendMessage({
    type: "image-urls",
    payload: srcList,
  });
}

declare global {
  interface Window {
    extractImages: () => void;
  }
}

window.extractImages = extractImages;
extractImages();
```

これにより、2回目以降のクリックでもスクリプト再注入を避けられた。

---

## 5. 最終的な設計判断

### 5.1 CRXJS をやめた理由

- MV3 の動的注入と CRXJS の自動化が衝突しやすい
- dev と build で変換されたファイル名がズレる
- 原因調査が難しくなりやすい

### 5.2 Vite は viewer のみに使った理由

- HTML/CSS/TS のUI開発に向いている
- viewer のビルドと拡張本体のビルドを分離できる

### 5.3 `vite.config.mjs` での出力調整の変遷

最初は `outDir` と `input` を使って `dist` 直下に出力しようとしていたが、
それだと viewer の HTML/CSS/JS が `dist` 配下で分離されすぎて、Chrome 拡張としての構造が崩れやすかった。

そこで、`root` を追加して Vite のビルド対象を `src/viewer` に絞り、
`outDir` を `dist` に固定したことで、出力結果が拡張のルート直下に揃うようにした。

```js
export default defineConfig({
  base: "",
  root: "src/viewer",
  build: {
    outDir: resolve(import.meta.dirname, "dist/viewer"),
    rollupOptions: {
      input: {
        viewer: resolve(import.meta.dirname, "src/viewer/viewer.html"),
      },
    },
  },
});
```

この変更で重要なのは、`root` を追加したことで `outDir` 直下に配置されるようになった点だ。
最初の構成では `dist` 配下の depth が増えやすく、manifest との整合が崩れたが、
`root` でビルド対象を固定したことで Chrome 拡張として扱いやすい出力構造になった。

### 5.4 background / content は esbuild に寄せた理由

```js
esbuild.build({
  entryPoints: ["src/background/background.ts", "src/content/content.ts"],
  outdir: "dist/scripts",
  bundle: true,
});
```

これで固定ファイル名・高速ビルド・安定した拡張配布が可能になった。

---

## 6. 本番ビルドが成功した要因

- `content_scripts` を削除して動的注入前提に統一した
- background / content をローダー依存の構成から切り離した
- viewer を相対パスで読み込む構成にした
- manifest を手動コピーして dist 構造を固定した
- Windows バッチでは `call` を使って後続処理を正しく実行した

---

## 7. 学びとベストプラクティス

- Chrome 拡張の MV3 では、`content_scripts` に依存しない設計が安定しやすい
- isolated world の制約を前提にし、window や DOM を直接共有しない
- viewer と extension 本体はビルド対象を分離したほうが安全
- Vite の自動 asset 管理は Web アプリ向けであり、拡張向けでは制約がある
- dist 構造は「固定パス」で管理したほうが原因調査しやすい

---

## 8. 最終状態

- 開発環境: 安定
- 本番ビルド: 成功
- 実装方針: MV3 の公式設計に沿った動的注入を採用
- 実運用構成: Vite + esbuild ハイブリッド

この構成により、今後の機能追加や改善がしやすい状態になっている。
