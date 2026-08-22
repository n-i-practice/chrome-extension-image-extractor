# 📘 Image Extractor — 仕様書（100点の最終完全版）

## 1. 概要

**Image Extractor** は、アクティブタブに表示されているすべての画像を抽出し、新しいタブ（viewer）で一覧表示する Chrome 拡張です。

抽出対象には、通常の `<img>` だけでなく、CSS や JavaScript によって生成・追加された画像、blob URL、相対パスなど、ページ上で画像として扱われる可能性があるものを広く含みます。

本拡張は **Manifest V3 を前提**とし、

- popup は使用せず、拡張アイコンクリック時に `chrome.action.onClicked` で viewer を開く
- content script が DOM と CSS を走査
- URL を正規化し重複除外
- background が viewer を開く
- viewer が自然サイズと最小サイズフィルタを適用する

という実行モデルで動作します。

CSS 画像の抽出は **best effort** とし、ブラウザ制約により完全抽出は保証しません。

### ● background の役割

- `chrome.action.onClicked` を受信して viewer を開く
- content script から画像リストを受信
- URL 正規化・重複除外
- `chrome.storage.session` に画像リストを保存
- viewer タブを開く

---

## 2. 目的（Requirements）

- アクティブタブに表示されている画像をすべて取得
- CSS / JS 制御の画像も取得
- CSS の `background-image` / `content: url()` を含む
- blob / object URL / 相対パスも抽出
- 抽出した画像を **新しいタブ（viewer）** で一覧表示
- viewer で **最小サイズフィルタ（初期値：400×400）**
- URL一致の重複除外（正規化後一致）
- 読み込み失敗画像は viewer 側で除外
- Lazy Load による高速表示
- 画像クリックで元画像を新しいタブで開く
- srcset は最大解像度を抽出
- Optional：Zip ダウンロード

---

## 3. 実行モデル（重要）

### ● content script の実行タイミング

1. DOMContentLoaded で初回スキャン
2. MutationObserver で追加画像を監視
3. 追加画像は debounce（300ms）でまとめて処理
4. SPA（Instagram / X / Pinterest）でも継続収集
5. 画像が一定時間（例：5秒）増えなければ収集終了

### ● background の役割

- content script から画像リストを受信
- URL 正規化・重複除外
- `chrome.storage.session` に画像リストを保存
- viewer タブを開く

### ● viewer の役割

- session から画像リストを読み込む
- IntersectionObserver による Lazy Load
- naturalWidth / naturalHeight を取得
- 最小サイズフィルタを適用
- 読み込み失敗画像を除外
- 画像クリックで background にメッセージ送信
- background が `chrome.tabs.create` で新しいタブを開く

---

## 4. データ構造（ImageRecord）※必須

```
ImageRecord {
  id: string,                 // UUID
  src: string,                // 正規化済みURL
  srcType: string,            // img / background / srcset / og:image / blob / data
  origin: string,             // 抽出元（DOMノード情報）
  naturalWidth: number,       // viewer側で取得
  naturalHeight: number,      // viewer側で取得
  isValid: boolean            // 読み込み成功/失敗
}
```

---

## 5. 抽出対象（拡張版）

- `<img>` の `src`
- `<source>` / `<picture>` の `srcset`
- CSS の `background-image`
- CSS の `content: url()`
- 動的追加画像（MutationObserver）
- blob URL（`blob:`）
- object URL（`URL.createObjectURL()`）
- 相対パス（絶対 URL に変換）
- `<video poster>`
- `<link rel="preload" as="image">`
- `<meta property="og:image">`

### ● CSS 抽出の制約（best effort）

- cross-origin stylesheet の cssRules は参照不可
- computed style / CSSOM の範囲で可能な限り抽出
- CSS 画像の完全抽出は保証しない

---

## 6. URL重複除外（正規化）

### ● 正規化ルール

- 相対パス → `new URL(path, location.href)`
- http/https は別物
- クエリ（?v=123）は別物
- blob / data URL は文字列一致

### ● 重複除外条件

```
正規化後の src が完全一致した場合、重複とみなす
```

---

## 7. srcset の最大解像度抽出

- `w` → 最大幅
- `x` → 最大倍率
- 並び順は無視
- descriptor がない場合 → 最初の URL
- 404 / invalid の場合は次候補にフォールバック

---

## 8. viewer の表示仕様

### ● Lazy Load

IntersectionObserver により、画面に近づいた画像だけ読み込む。

### ● 最小サイズフィルタ

- naturalWidth / naturalHeight を使用
- 0 の場合は除外
- 初期値：400×400
- フィルタは **画像読み込み後（onload）** に適用

### ● 読み込み失敗

- `img.onerror` → `isValid = false`
- viewer から除外
- Zip ダウンロード対象にも含めない

### ● 画像クリック（必ず background 経由）

## 8.1 Viewer の状態遷移仕様（完全版）

viewer は以下の 3 状態を持つ。

- **grid（一覧）**
- **zoom（拡大）**
- **original（原寸大）**

状態はユーザー操作により線形に遷移する。

---

## 🔄 状態遷移一覧

### 1. 一覧 → 拡大（grid → zoom）

- 画像カード（item）クリック時
- 拡大表示は flex による中央寄せ
- `object-fit: contain` により画面サイズ最大で表示

---

### 2. 拡大 → 一覧（zoom → grid）

- ✕ボタン（close-btn）クリック時
- overlay は使用しない
- modal を閉じ、状態を GRID に戻す

---

### 3. 拡大 → 原寸大（zoom → original）

- zoom ボタン（＋）クリック時
- 原寸大画像は `position: absolute`
- `object-fit: none`
- 画像中央が画面中央に来るように JS で配置
- ドラッグ可能かどうかは画像サイズに応じて動的に判定
  - 画像が画面より大きい → ドラッグ可能
  - 画像が画面より小さい → ドラッグ不可（中央固定）

---

### 4. 原寸大 → 拡大（original → zoom）

- zoom ボタン（−）クリック時
- `left/top` をリセットし、flex の中央寄せに戻す
- 状態を ZOOM に戻す

---

### 5. 原寸大 → 一覧（original → grid）

- ✕ボタン（close-btn）クリック時
- `left/top` をリセット
- modal を閉じ、状態を GRID に戻す

---

## 🖼 各状態の表示仕様

### ✔ 一覧（grid）

- グリッド表示
- `object-fit: contain`
- 画像クリックで zoom へ遷移
- modal は非表示

---

### ✔ 拡大（zoom）

- modal を表示
- overlay は使用しない
- flex による中央寄せ
- zoom ボタンで original へ遷移
- ✕ボタンで grid へ戻る

---

### ✔ 原寸大（original）

- `position: absolute`
- `object-fit: none`
- 画像中央を画面中央に配置
- ドラッグ可能かどうかは動的判定
  - 画像が画面より大きい → ドラッグ可能
  - 画像が画面より小さい → ドラッグ不可
- zoom ボタンで zoom に戻る（位置リセット）
- ✕ボタンで grid に戻る（位置リセット）

---

## 🖱 ドラッグ仕様（original 状態のみ）

- `mousedown` → ドラッグ開始
- `mousemove` → 位置更新
- `mouseup` → ドラッグ終了

### ● ドラッグ可能条件

- 画像が画面より大きい場合のみドラッグ可能
- 画像が画面より小さい場合は中央固定でドラッグ不可

### ● ドラッグ可能範囲

- 範囲は画像サイズと画面サイズに応じて動的に決定
- 固定値による制限は行わない

### ● 状態遷移時の位置リセット

- zoom / grid に戻る際は必ず `left/top` をリセット

---

## 🔐 安全仕様

- overlay は使用しない
- 閉じる操作は ✕ボタンのみ
- original 状態でも ✕ボタンで閉じられる
- zoom / original → grid の遷移時は必ず位置リセット

---

## 9. background ↔ viewer のデータ受け渡し

### ● メッセージ設計

```
content → background:
  chrome.runtime.sendMessage({ type: "images", payload: ImageRecord[] })

background → viewer:
  chrome.storage.session.set({ images })

viewer → background:
  chrome.runtime.sendMessage({ type: "open-image", src })
```

### ● chrome.storage.session の扱い（重要）

- 画像リストは viewer 起動時に session から読み込む
- session の容量制限により、  
  **画像保存上限は「最大 1500 件」** とする
- 保存失敗時は fallback として viewer に直接 message passing
- SPA で画像が増え続ける場合は収集を打ち切る

---

## 10. Manifest V3 の正式定義

```
{
  "manifest_version": 3,
  "name": "Image Extractor",
  "version": "1.0",
  "action": {
    "default_title": "Image Extractor"
  },
  "background": {
    "service_worker": "background.js"
  },
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

---

## 11. 大量画像サイトへの対策

- 画像収集は **逐次処理（バッチ処理）**
- viewer は **Lazy Load**
- content script は **MutationObserver + debounce**
- 重複判定は content script 側で事前に行う
- CORS により naturalWidth が取得できないケースを許容
- data URL は viewer 表示可だが Zip 対象外

---

## 12. viewer の実体（明文化）

viewer は拡張内のページ：

```
src/viewer/viewer.html
src/viewer/viewer.js
```

background は以下で開く：

```
chrome.tabs.create({
  url: chrome.runtime.getURL("src/viewer/viewer.html")
})
```

---

## 13. バージョン構成（v1 / v2 / v3）

### ● v1（初期リリース）

- 画像収集
- viewer 表示
- Lazy Load
- 最小サイズフィルタ
- 読み込み失敗除外
- 画像クリック → background → 新しいタブ

### ● v2（機能拡張）

- Zip ダウンロード
- 画像再試行
- ソート機能（サイズ順など）

### ● v3（高度機能）

- メタ情報表示
- 重複判定強化（ハッシュ一致）
- ダークモード
- Pro版 / 広告 / 寄付

---

## 14. 収益化（Optional）

### ● バナー広告（viewer 下部）

- 高さ 40〜60px
- 操作の邪魔にならない位置
- AdSense / Buy Me a Coffee など

### ● 寄付ボタン

- viewer 右上に控えめに配置
- 強制文言は使用しない

### ● Pro版誘導

- Zip / ソート / 高度機能を Pro版化
- viewer 下部に控えめなリンク

---

## 15. ブラウザ制約（重要）

- CSSOM は cross-origin stylesheet の cssRules を参照不可
- MutationObserver は SPA の内部状態変化を完全に捕捉できない場合がある
- CORS により naturalWidth / naturalHeight が取得できないケースがある
- CSS 画像の完全抽出は保証されない

---

## まとめ

本仕様書は、  
**基本設計＋詳細設計＋実行モデル＋データモデル＋制約＋バージョン構成＋収益化＋session 上限**  
を完全に統合した **100点の最終仕様書** です。

この仕様書はそのまま実装可能であり、  
GitHub Copilot が迷わずコードを書けるレベルで具体的です。
