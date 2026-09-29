# TODO — 未実装項目一覧

## 完了済み（viewer）

- 画像の自然サイズ（naturalWidth / naturalHeight）の取得
- 読み込み失敗画像の除外
- SVG / GIF の非表示フィルター
- 最小幅・最小高さフィルター
- フィルター適用中の最小サイズ表示
- フィルター適用後の表示件数表示
- 最小サイズ入力値のクリア（入力値のみ 0 に戻す）
- 最小サイズ入力の不正文字抑止
- 入力欄フォーカス時の入力値全選択
- 画像カードからモーダルへの遷移
- 拡大表示・原寸大表示・原寸大画像のドラッグ
- 透過画像用の市松模様背景

---

## 抽出ロジック（content script）

- ~~CSS の `background-image` 抽出~~（完了）
- CSS の `content: url()` 抽出
- MutationObserver による動的画像追加の検知（SPA対応）
- `<meta property="og:image">` の抽出
- `<video poster>` の抽出
- `<link rel="preload" as="image">` の抽出
- debounce（300ms）による追加画像のバッチ処理
- 抽出URLの正規化と重複除外
- `blob:` / `data:` URL の抽出対応

### srcset の追加対応

現在は `srcset` から最大候補を選択する処理を実装済み。以下は追加確認・改善項目。

- 画像読み込み失敗時の候補フォールバック

---

## viewer 側の未実装・改善

- 大量画像向けの Lazy Load（IntersectionObserver）
- フィルター変更前後の UI テスト追加
- 表示件数・画像読み込み失敗件数などの詳細な状態表示
- キーボード操作（Escapeでモーダルを閉じる、矢印キーで画像移動）
- タッチ操作による原寸大画像のパン対応

---

## background 側の未実装・改善

- 画像抽出結果のURL正規化と重複除外
- `chrome.storage.session` の保存件数上限への対応
- session 保存失敗時の viewer へのフォールバック
- 画像抽出処理・viewer 起動処理のエラー表示

※ `open-image` メッセージによる新しいタブでの画像表示は、現行viewerではモーダル表示を採用しているためTODOから除外。

---

## v1（初期リリース）

- 多言語対応（基盤 `src/i18n/` 完了。viewer 接続・manifest `_locales` は未着手。詳細は `docs/i18n-TODO.md`）

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
