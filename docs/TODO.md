# TODO — 未実装項目一覧（SPECIFICATION.md 対応）

## 抽出ロジック（content script）

- srcset の最大解像度抽出（w / x / descriptor）
- CSS の `content: url()` 抽出
- MutationObserver による動的画像追加の検知（SPA対応）
- `<meta property="og:image">` の抽出
- `<video poster>` の抽出
- `<link rel="preload" as="image">` の抽出
- debounce（300ms）による追加画像のバッチ処理

---

## viewer 側の未実装

- naturalWidth / naturalHeight の取得
- 最小サイズフィルタ（400×400 未満を除外）
- 読み込み失敗画像の除外（isValid=false）
- 画像クリック → background 経由で新しいタブを開く処理
- Lazy Load（IntersectionObserver）※部分的に未実装の場合
- 透過 PNG / SVG の背景にタイル模様（白＋グレー）を敷いて透過部分を可視化する

---

## background 側の未実装

- viewer からの `open-image` メッセージを受け取り、  
  `chrome.tabs.create` で新しいタブを開く処理

---

## viewer.jsのバグ

- zoom 状態でも画像を中央配置する仕様の反映（left/top のズレ修正）

---

## v2（機能拡張）

- Zip ダウンロード
- 画像再試行（retry）
- ソート機能（サイズ順など）

---

## v3（高度機能）

- メタ情報表示
- 重複判定強化（ハッシュ一致）
- ダークモード
- Pro版 / 広告 / 寄付機能
