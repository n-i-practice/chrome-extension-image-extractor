# Chrome拡張 Viewer 実装で学んだこと

## 1. 拡張のデータ連携（content → background → viewer）

- 画像一覧は `chrome.storage.session` を使って viewer に渡す
- viewer 側では `chrome.storage.session.get("images")` で受け取る
- SPA や動的ページでも安定して画像一覧を表示できる
- content → background → viewer の流れを明確にすると実装が迷わない

## 2. Viewer の状態管理（State Machine）

- `GRID`（一覧）
- `ZOOM`（画面フィット拡大）
- `ORIGINAL`（原寸大）
- 状態遷移を関数化することで UI の分岐が明確になり、コードが整理される

## 3. モーダル表示の基本構造

- `.hidden` の ON/OFF でモーダルを制御
- overlay クリックで閉じる
- 画像クリックでモーダルを開く
- 誤操作を防ぐためにボタンを右上・右下に配置

## 4. ズームボタンの設計（UI/UX）

- ボタンサイズは `5vh`＋`min-width/min-height` が最適
- SVG は `width:100%; height:100%` でボタンにフィット
- 背景や余白は CSS、アイコンは SVG に分離
- ズームは右下、閉じるは右上が自然で誤操作が減る

## 5. SVG の理解（viewBox と内部座標）

- viewBox は「内部座標のキャンバス」
- width/height は「表示サイズ（CSS）」
- viewBox を広げるとアイコンが相対的に小さくなる
- 背景や枠線は `<rect>` を使うと安定
- SVG の線（line/path）は viewBox に合わせて座標を設計する

## 6. ドラッグ移動の実装（原寸大モード）

- `mousedown → mousemove → mouseup` の基本パターン
- `e.preventDefault()` でブラウザの画像ドラッグを無効化
- `getBoundingClientRect()` で現在位置を取得
- clamp（範囲制限）でドラッグ可能領域を制御
- 原寸大モードだけドラッグ可能にすることで UX が向上

## 7. 画像の中央配置ロジック

- 原寸大のときは
  - `(window.innerWidth - imgWidth) / 2`
  - `(window.innerHeight - imgHeight) / 2`
- 拡大表示のときは left/top を 0 に戻す
- 状態ごとに位置をリセットすることで UI が安定する

## 8. UI の細部調整（SVG と CSS の役割分担）

- SVG の背景は `<rect>` で描くと枠線も付けられる
- CSS の `background` は便利だが枠線は描けない
- アイコンの統一感は viewBox と stroke-width で決まる
- ボタンのサイズは CSS、アイコンの形は SVG で分離するのが最適
