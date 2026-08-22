// ===============================
// Viewer State Enum（表示状態の定義）
// ===============================
const ViewerState = {
  GRID: "grid", // 一覧表示
  ZOOM: "zoom", // 拡大表示
  ORIGINAL: "original", // 原寸大表示（ドラッグ可能）
};

// 現在の viewer の状態（初期値は一覧）
let viewerState = ViewerState.GRID;

// DOM 要素の取得
const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("close-btn");
const zoomBtn = document.getElementById("zoom-btn");
const zoomInIcon = document.getElementById("zoom-in-icon");
const zoomOutIcon = document.getElementById("zoom-out-icon");

// ===============================================
// 画像一覧の読み込み（background → session storage）
// ===============================================
chrome.storage.session.get("images").then(({ images }) => {
  const grid = document.getElementById("grid");
  const info = document.getElementById("info");

  // 画像がない場合の表示
  if (!images || images.length === 0) {
    info.textContent = "画像がありません";
    return;
  }

  info.textContent = `${images.length} 件の画像`;

  // 一覧表示の画像カードを生成
  images.forEach((url) => {
    const div = document.createElement("div");
    div.className = "item";

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = url;

    // 画像クリック → 拡大表示へ遷移
    img.addEventListener("click", () => {
      modalImg.src = img.src;
      modal.classList.remove("hidden");
      enterZoomState();
    });

    div.appendChild(img);
    grid.appendChild(div);
  });
});

// ===============================================
// 閉じる操作（overlay / closeボタン）
// ===============================================
overlay.addEventListener("click", () => {
  enterGridState();
});

closeBtn.addEventListener("click", () => {
  enterGridState();
});

// ===============================================
// 拡大 / 原寸大の切り替えボタン
// ===============================================
zoomBtn.addEventListener("click", () => {
  if (viewerState === ViewerState.ZOOM) {
    enterOriginalState();
  } else {
    enterZoomState();
  }
});

// ===============================================
// 原寸大ドラッグ用の変数
// ===============================================
let isDragging = false;
let startX = 0;
let startY = 0;
let imgX = 0;
let imgY = 0;

// ===============================================
// 原寸大画像のドラッグ開始
// ===============================================
modalImg.addEventListener("mousedown", (e) => {
  // 原寸大状態以外ではドラッグ不可
  if (viewerState !== ViewerState.ORIGINAL) {
    return;
  }

  // ブラウザ標準の画像ドラッグを無効化
  e.preventDefault();
  modalImg.draggable = false;

  isDragging = true;
  modalImg.classList.add("dragging");

  // マウス開始位置
  startX = e.clientX;
  startY = e.clientY;

  // 現在の画像位置
  const rect = modalImg.getBoundingClientRect();
  imgX = rect.left;
  imgY = rect.top;
});

// ===============================================
// 原寸大画像のドラッグ中
// ===============================================
document.addEventListener("mousemove", (e) => {
  if (!isDragging) {
    return;
  }

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  let newLeft = imgX + dx;
  let newTop = imgY + dy;

  // 画像サイズ
  const imgWidth = modalImg.offsetWidth;
  const imgHeight = modalImg.offsetHeight;

  // 画面サイズ
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;

  // ★ ドラッグ可能範囲（中央 ±100px）
  const centerX = (winWidth - imgWidth) / 2;
  const maxLeft = centerX + 100;
  const minLeft = centerX - 100;

  const centerY = (winHeight - imgHeight) / 2;
  const maxTop = centerY + 100;
  const minTop = centerY - 100;

  // 範囲内に収める
  newLeft = Math.min(Math.max(newLeft, minLeft), maxLeft);
  newTop = Math.min(Math.max(newTop, minTop), maxTop);

  modalImg.style.left = `${newLeft}px`;
  modalImg.style.top = `${newTop}px`;
});

// ===============================================
// ドラッグ終了
// ===============================================
document.addEventListener("mouseup", () => {
  isDragging = false;
  modalImg.classList.remove("dragging");
});

// ===============================================
// 状態遷移：一覧表示（GRID）
// ===============================================
function enterGridState() {
  viewerState = ViewerState.GRID;

  // モーダルを閉じる
  modal.classList.add("hidden");
}

// ===============================================
// 状態遷移：拡大表示（ZOOM）
// ===============================================
function enterZoomState() {
  viewerState = ViewerState.ZOOM;

  // 原寸大クラスを外す
  modalImg.classList.remove("original");

  // 位置リセット
  modalImg.style.left = "0px";
  modalImg.style.top = "0px";

  // ボタン切り替え（拡大 → 原寸大）
  zoomInIcon.style.display = "block";
  zoomOutIcon.style.display = "none";
}

// ===============================================
// 状態遷移：原寸大表示（ORIGINAL）
// ===============================================
function enterOriginalState() {
  viewerState = ViewerState.ORIGINAL;

  modalImg.classList.add("original");

  // ボタン切り替え（原寸大 → 拡大）
  zoomInIcon.style.display = "none";
  zoomOutIcon.style.display = "block";

  // 原寸大画像のサイズを取得
  const rect = modalImg.getBoundingClientRect();
  const imgWidth = rect.width;
  const imgHeight = rect.height;

  // 画面中央に配置
  const centerX = (window.innerWidth - imgWidth) / 2;
  const centerY = (window.innerHeight - imgHeight) / 2;

  modalImg.style.left = `${centerX}px`;
  modalImg.style.top = `${centerY}px`;
}
