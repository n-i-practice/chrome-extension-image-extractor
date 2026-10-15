# Chrome拡張開発メモ（ビルド構成の検討記録）

本書は、このプロジェクトで動的注入とViewerのビルド構成を検討した記録。CRXJSに関する問題は当時試した設定・構成での経験であり、CRXJSやManifest V3全般の制約を示すものではない。コード例は要点を示す抜粋で、現在の全体仕様・開発手順は [SPECIFICATION.md](SPECIFICATION.md) と [README](../README.md) を参照。

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
- manifest・言語辞書・アイコン: ビルドスクリプトでコピー
- dist 配布物: 固定パスで生成

ポイントは、今回必要な動的注入で参照する固定ファイル名と、Viewerの相対パスを、ビルド設定と一致させたこと。

---

## 3. 直面した問題と結論

### 3.1 `content_scripts` を定義すると自動実行される

原因:

- manifestの `content_scripts` は、URLなどの条件に一致するページへ、指定された `run_at` のタイミングで自動注入する仕組み。今回の「アイコンを押したときだけ抽出する」要件と合わなかった。

対策:

- `manifest.json` から `content_scripts` を削除
- `chrome.action.onClicked` で動的注入するよう変更

---

### 3.2 `content.js` のパス解決が崩れる

原因:

- 当時試したVite + CRXJSの構成では、開発時と本番時で参照するcontent scriptのファイル名が揃わなかった
- backgroundから固定パスで指定した注入先と生成物の名前が一致せず、読み込みに失敗した

実際に起きた変換例:

- `content.js-loader.js`
- `content.js?import`
- `content.js.js`

結論:

- 注入時に指定するパスと、ビルドが生成するファイル名を一致させる必要がある
- 今回はCRXJSの生成物に合わせる構成ではなく、esbuildで出力名を明示する方法を採用した

---

### 3.3 viewer の asset パスが extension で壊れる

原因:

- Vite が生成する `/assets/...` の絶対パスが Chrome 拡張では不整合になる

対策:

- `vite.config` に `base: ""` を設定
- viewer を相対パスで読ませる

---

### 3.4 今回の構成でCRXJSの採用を見送った理由

当時試した設定・構成で遭遇した問題:

- manifestにcontent scriptを定義しない設定では、必要なcontent scriptの出力を得られなかった
- dev と build で生成名が変わる
- ローダーが挙動を隠し、原因調査が困難
- viewer の読み込みパスや content script の注入パスが不安定になる

結論:

- 今回は動的注入用の固定ファイル名とViewerの出力先を明示する構成を選び、background / contentをesbuildでビルドすることにした
- CRXJSがMV3非対応という結論ではなく、このプロジェクトの要件と調査時の構成に基づく選択

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
    files: ["scripts/content.js"],
  });
}
```

ポイント:

- 初回注入時は content script を読み込む
- 2回目以降は既存の関数を再利用する
- 初回はファイル注入後にcontent script自身が抽出を実行し、再実行時は同じ実行環境に登録済みの関数を呼ぶ
- 既定のisolated worldでは、ページ本体とcontent scriptのJavaScript変数・グローバル空間は分離されるが、ページのDOMは操作できる
- `window.extractImages` はcontent script側の環境に登録する。background自身から直接参照するのではなく、同じタブ・フレームのisolated worldへ注入した関数内から呼び出す

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

- 当時の構成では、CRXJSが生成するローダーやファイル名と、backgroundからの固定パス指定を整合させる調査が必要だった
- 今回は注入するスクリプトの名前と出力先を明示し、設定から生成物を追いやすくすることを優先した

### 5.2 Vite は viewer のみに使った理由

- HTML/CSS/TS のUI開発に向いている
- viewer のビルドと拡張本体のビルドを分離できる

### 5.3 `vite.config.mjs` での出力調整の変遷

最初は `outDir` と `input` を使って `dist` 直下に出力しようとしていたが、
それだと viewer の HTML/CSS/JS が `dist` 配下で分離されすぎて、Chrome 拡張としての構造が崩れやすかった。

そこで、`root` を追加して Vite のビルド対象を `src/viewer` に絞り、
`outDir` を絶対パスの `dist/viewer` に設定し、`viewer.html` が `dist/viewer/viewer.html` に出力されるようにした。

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

この構成では `dist/manifest.json`、`dist/scripts/`、`dist/viewer/` を分けて配置する。
backgroundが開く `viewer/viewer.html` と、ViteのHTML出力先を一致させた。現在は `emptyOutDir: false` も指定し、先に生成したbackground / contentなどの出力を保持する。

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
- ビルドスクリプトでmanifestなどの付随ファイルをコピーし、dist構造を固定した
- Windows バッチでは `call` を使って後続処理を正しく実行した

---

## 7. 今回の構成で得た学び

- 常時動作する処理には自動注入、ユーザー操作を起点とする処理にはプログラムからの注入など、実行条件に合わせて方式を選ぶ
- isolated worldで分離されるJavaScript変数・グローバル空間と、ページ側と共通のDOMを区別する
- 今回はViewerとbackground / contentのビルド対象を分け、各出力先と形式を明示した
- Viteが生成するassetの参照パスは、Chrome拡張内での配置と照合する
- 動的注入やViewer起動で参照するパスと、distの実際の構造を一致させる

実行環境と注入方式の詳細は [Chrome公式のcontent script解説](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) を参照。

---

## 8. 構成決定時の確認結果

- 開発環境: 安定
- 本番ビルド: 成功
- 実装方針: MV3 の公式設計に沿った動的注入を採用
- 実運用構成: Vite + esbuild ハイブリッド

この構成により、今後の機能追加や改善がしやすい状態になっている。
