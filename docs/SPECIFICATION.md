# 📘 Image Extractor — 仕様書（viewerの仕様はVIEWER_SPER.mdを参照）

## 概要

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
- `chrome.storage.session` に画像リストを保存
- viewer タブを開く

---

## 目的（Requirements）

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

## 実行モデル（重要）

### ● content script の実行タイミング

1. アイコンクリック時（スクリプト注入時）に初回スキャンを実行
2. MutationObserver で追加画像を監視
3. 追加画像は debounce（300ms）でまとめて処理
4. SPA（Instagram / X / Pinterest）でも継続収集
5. 画像が一定時間（例：5秒）増えなければ収集終了

### ● background の役割

- content script から画像リストを受信
- URL 正規化・重複除外
- `chrome.storage.session` に画像リストを保存
- viewer タブを開く

---

## データ構造（ImageRecord）※必須

```
ImageRecord {
  id: string,                 // v1必須: 重複除外・DOM管理に必要
  src: string,                // v1必須: 正規化済みURL（最重要）
  ext: string,                // v1必須: 拡張子（svg/gif/png/jpg/webp）フィルタ用
  srcType: string,            // v1任意: img/background/srcset/blob/data（v2以降で有用）
  origin: string,             // v1任意: 抽出元の簡易情報（詳細はv2以降）
  naturalWidth: number,       // v1必須: 最小サイズフィルタに必要
  naturalHeight: number,      // v1必須: 最小サイズフィルタに必要
  isValid: boolean            // v1必須: viewer側で読み込み失敗を除外するため必要
}
```

---

## 抽出対象（拡張版）

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

## URL重複除外（正規化）

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

## srcset の最大解像度抽出

- `w` → 最大幅
- `x` → 最大倍率
- 並び順は無視
- descriptor がない場合 → 最初の URL
- 404 / invalid の場合は次候補にフォールバック

---

## background ↔ viewer のデータ受け渡し

### ● メッセージ設計

```
content → background:
  chrome.runtime.sendMessage({ type: "image-urls", payload: string[] })

background → session:
  chrome.storage.session.set({
    "images:<id>": string[],   // 一覧本体
    "viewerTab:<tabId>": "<id>" // タブ閉じ時の掃除用
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

#### 容量・失敗時（未実装の方針）

- session の容量制限により、**画像保存上限は「最大 1500 件」** とする
- 保存失敗時は fallback として viewer に直接 message passing
- SPA で画像が増え続ける場合は収集を打ち切る

---

## Manifest V3 の正式定義

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

## 大量画像サイトへの対策

- 画像収集は **逐次処理（バッチ処理）**
- content script は **MutationObserver + debounce**
- 重複判定は content script 側で事前に行う
- CORS により naturalWidth が取得できないケースを許容

---

## バージョン構成（v1 / v2 / v3）

### ● v1（初期リリース）

- 画像収集
- 読み込み失敗除外

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

## 収益化（Optional）

### ● バナー広告（viewer 下部）

- 高さ 40〜60px
- 操作の邪魔にならない位置
- AdSense / Buy Me a Coffee など

### ● 寄付ボタン

- 強制文言は使用しない

### ● Pro版誘導

- Zip / ソート / 高度機能を Pro版化

---

## ブラウザ制約（重要）

- CSSOM は cross-origin stylesheet の cssRules を参照不可
- MutationObserver は SPA の内部状態変化を完全に捕捉できない場合がある
- CORS により naturalWidth / naturalHeight が取得できないケースがある
- CSS 画像の完全抽出は保証されない

---
