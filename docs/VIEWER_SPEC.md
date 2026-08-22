## Viewer の状態遷移仕様（イベント駆動・完全版）

viewer は以下の 3 状態を持つ。

- **grid（一覧）**
- **zoom（拡大）**
- **original（原寸大）**

状態はユーザー操作（イベント）によって遷移し、  
各イベントは viewer.js 内の状態遷移関数（enterGridState / enterZoomState / enterOriginalState）を実行する。

---

## 🔄 状態遷移一覧（イベント → 実行される処理）

```
GRID
↓ (item click)
ZOOM
↑ (close / overlay)
↓ (zoom-in)
ORIGINAL
↑ (zoom-out)
↓ (close / overlay)
GRID
```

### 一覧 → 拡大（grid → zoom）

**イベント**

- ユーザーが一覧の画像カード（item）をクリックする

**実行される処理**

- modal を表示
- modal-img にクリックされた画像の src を設定
- enterZoomState() を実行
  - modal-img を中央寄せ
  - left/top を 0 にリセット
  - zoom-in アイコンを表示
  - zoom-out アイコンを非表示
  - overlay を表示

---

### 拡大 → 一覧（zoom → grid）

**イベント**

- ✕ボタン（close-btn）をクリック
- overlay をクリック

**実行される処理**

- enterGridState() を実行
  - modal を非表示
  - overlay を非表示
  - viewerState を GRID に変更

---

### 拡大 → 原寸大（zoom → original）

**イベント**

- zoom ボタン（＋）をクリック

**実行される処理**

- enterOriginalState() を実行
  - modal-img に original クラスを付与
  - zoom-in アイコンを非表示
  - zoom-out アイコンを表示
  - overlay を非表示
  - modal-img の natural size を取得
  - 画像中央が画面中央に来るように left/top を計算して配置

---

### 原寸大 → 拡大（original → zoom）

**イベント**

- zoom ボタン（−）をクリック

**実行される処理**

- enterZoomState() を実行
  - modal-img の original クラスを削除
  - left/top を 0 にリセット
  - zoom-in アイコンを表示
  - zoom-out アイコンを非表示
  - overlay を表示

---

### 原寸大 → 一覧（original → grid）

**イベント**

- ✕ボタン（close-btn）をクリック
- overlay をクリック

**実行される処理**

- enterGridState() を実行
  - modal を非表示
  - overlay を非表示
  - modal-img の left/top をリセット
  - viewerState を GRID に変更

---

## 🖱 ドラッグ仕様（original 状態のみ）

### ドラッグ開始（mousedown）

**イベント**

- original 状態で modal-img を mousedown

**実行される処理**

- ブラウザ標準の画像ドラッグを無効化
- dragging クラスを付与
- 開始位置（startX/startY）を記録
- 現在の画像位置（imgX/imgY）を記録

---

### ドラッグ中（mousemove）

**イベント**

- isDragging = true の状態で mousemove

**実行される処理**

- dx/dy を計算
- newLeft/newTop を算出
- 画像サイズと画面サイズからドラッグ可能範囲を動的に決定
- modal-img の left/top を更新

---

### ドラッグ終了（mouseup）

**イベント**

- mouseup

**実行される処理**

- dragging クラスを削除
- isDragging を false に設定

---

## 🔐 安全仕様

- overlay は zoom / original の両状態で閉じる操作として有効
- zoom / original → grid の遷移時は必ず left/top をリセット
- original 状態でのドラッグは画像が画面より大きい場合のみ有効
