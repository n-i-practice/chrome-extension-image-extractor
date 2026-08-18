# 📘 Image Extractor — 仕様書（完全版）

## 1. 概要

**Image Extractor** は、アクティブタブに表示されているすべての画像を抽出し、新しいタブ（viewer）で一覧表示する Chrome 拡張です。

抽出対象には、通常の `<img>` だけでなく、CSS や JavaScript によって生成・追加された画像、blob URL、相対パスなど、ページ上で画像として扱われる可能性があるものを広く含みます。

---

## 2. 目的（Requirements）

- アクティブタブに表示されている画像をすべて取得する
- CSS や JS によって制御されている画像も取得する
- CSS の `background-image` や `content: url()` を含むすべての画像を抽出する
- blob / object URL や相対パスの画像も抽出する
- 抽出した画像を **新しいタブ**で一覧表示する
- viewer 側で **最小サイズの指定（初期値：400×400）** ができる
- URL一致の重複は除外する
- 読み込み失敗した画像は viewer 側で除外する
- 大量画像サイトでも快適に動作する（Lazy Load 採用）
- 画像クリックで元画像を新しいタブで開く
- `srcset` は最大解像度の画像を抽出する
- Optional として Zip ダウンロード機能を提供する

---

## 3. ユーザー操作フロー

1. ユーザーが拡張アイコンをクリック
2. content script がアクティブタブ内の画像を収集
3. background が新しいタブ（viewer）を開く
4. viewer.html が画像一覧を表示する
5. viewer で最小サイズを指定してフィルタリングできる
6. 読み込み失敗した画像は自動で除外
7. 画像クリックで元画像を新しいタブで開く
8. Optional：画像を Zip としてダウンロードできる

---

## 4. 抽出対象（拡張版）

- `<img>` の `src`
- `<source>` / `<picture>` の `srcset`
- CSS の `background-image`
- CSS の `content: url()`
- JavaScript によって動的に追加された画像（MutationObserver）
- 右クリック禁止など CSS による制限がある画像
- blob URL（`blob:`）
- object URL（`URL.createObjectURL()`）
- 相対パスの画像（絶対 URL に変換して扱う）
- `<video poster>`
- `<link rel="preload" as="image">`
- `<meta property="og:image">`

---

## 5. 抽出ロジック

### ● URL重複の除外（初期バージョンから必須）

同じ URL の画像は 1 回だけ抽出する。

### ● 相対パスの絶対 URL 化

```
new URL(path, location.href)
```

### ● 動的追加の検知

MutationObserver を使用して、SPA（Instagram / X / Pinterest）でも確実に取得。

### ● srcset の最大解像度抽出（重要）

`srcset` の並び順は高解像度順である保証がないため、  
descriptor を解析して最大解像度の URL を抽出する。

- `400w` → 幅 400px
- `2x` → DPI 2倍
- descriptor がない場合 → 最初の URL（HTML仕様準拠）

---

## 6. 機能（正式）

### ● 最小サイズの指定（viewer で入力可能）

新しく開いたタブ（viewer.html）に、最小サイズを指定するためのテキストボックスを設置する。

- 初期値：**幅 400px / 高さ 400px**
- viewer 側でフィルタリングを行い、条件を満たす画像のみを表示する
- 抽出ロジックは全画像を取得し、表示段階でサイズフィルタを適用する
- 入力 UI
  - 最小幅：`<input type="number">`
  - 最小高さ：`<input type="number">`
  - 「適用」ボタンでフィルタリングを再実行

---

## 7. 読み込み失敗の扱い（正式）

### ● 読み込み失敗した画像は viewer 側で除外する

viewer.js：

```
img.onerror = () => {
  img.remove();
};
```

### ● Optional：再読み込み機能

読み込み失敗した画像だけ再試行するボタンを後から追加可能。

---

## 8. 大量画像サイトへの対応（正式）

### ● Lazy Load（採用）

IntersectionObserver を使い、  
画面に近づいた画像だけ読み込む。

メリット：

- 初期表示が高速
- メモリ消費が少ない
- Instagram / Pinterest でも快適

### ● キュー方式（Optional）

Zip ダウンロード時に大量画像を扱う場合に追加する。

---

## 9. viewer の表示仕様

- 画像をグリッド形式で一覧表示
- Lazy Load により遅延読み込み
- 最小サイズフィルタを適用可能
- 読み込み失敗は自動除外
- **画像クリックで元画像を新しいタブで開く（正式）**
- Optional：Zip ダウンロードボタン
- Optional：画像のメタ情報表示

---

## 10. コンポーネント構成

### ● content script

- ページ内の DOM にアクセスし、画像を抽出
- CSS の解析
- MutationObserver による動的追加の検知
- URL重複の除外
- srcset の最大解像度抽出

### ● background（service worker）

- content script から受け取った画像リストを保持
- viewer.html を新しいタブで開く

### ● viewer（extension page）

- 画像一覧を表示
- Lazy Load
- 最小サイズフィルタ
- 読み込み失敗の除外
- 画像クリックで新しいタブで開く
- Optional：Zip ダウンロード

---

## 11. フォルダ構成（案）

```
chrome-extension-image-extractor/
  manifest.json
  src/
    content/
      content.js
    background/
      background.js
    viewer/
      viewer.html
      viewer.js
    popup/
      popup.html
      popup.js
```

---

## 12. manifest.json に必要な権限

- "activeTab"
- "tabs"
- "scripting"
- "host_permissions": ["<all_urls>"]

---

## 13. 今後の拡張案（Optional）

- 読み込み失敗の再試行
- Zip ダウンロードの進捗表示
- 重複判定の強化（ハッシュ一致）
- ソート機能（サイズ順など）
- 画像の個別ダウンロード
- ダークモード対応
- 画像のメタ情報（MIME type 等）表示

---

## 14. 収益化（Optional）

本拡張は無料で利用可能とするが、将来的な収益化手段として以下を Optional 機能として検討する。

### ● バナー広告（viewer 下部）

- viewer.html の最下部に高さ 40〜60px 程度の小さな広告枠を設置する
- 操作の邪魔にならない位置に限定する
- 画像一覧の閲覧体験を損なわないことを最優先とする
- 広告ネットワーク例：Google AdSense、Buy Me a Coffee の埋め込み広告など

### ● 寄付ボタン（Buy Me a Coffee / Ko-fi）

- viewer の右上に控えめな寄付ボタンを設置する
- 寄付を強制する文言は使用しない
- ボタンは小さく、UI の邪魔にならない色・サイズにする
- 海外ユーザー向けの寄付文化を想定

### ● Pro版（有料版）への誘導（将来的に）

- Zip ダウンロード、重複判定強化、ソート機能などを Pro版として提供
- viewer 下部に「Pro版はこちら」などの控えめなリンクを設置する
- 初期バージョンでは実装しない

### ● 注意事項

- ポップアップ広告や操作を妨げる広告は採用しない
- 広告や寄付がユーザー体験を損なわないことを最優先とする
- 収益化は Optional であり、拡張の基本機能は無料で提供する

---

## まとめ

Image Extractor は **「アクティブタブの画像をすべて抽出し、新しいタブで一覧表示する拡張」** であり、  
SNS や大量画像サイトにも対応できる堅牢な仕様となっている。
