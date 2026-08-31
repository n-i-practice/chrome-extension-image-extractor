// ===============================
// Viewer State Enum（表示状態の定義）
// ===============================
const ViewerState = {
  GRID: "grid", // 一覧表示
  ZOOM: "zoom", // 拡大表示
  ORIGINAL: "original", // 原寸大表示（ドラッグ可能）
};

let viewerState = ViewerState.GRID;

// ===============================
// DOM 要素
// ===============================
const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("close-btn");
const zoomBtn = document.getElementById("zoom-btn");
const zoomInIcon = document.getElementById("zoom-in-icon");
const zoomOutIcon = document.getElementById("zoom-out-icon");
const grid = document.getElementById("grid");
const info = document.getElementById("info");

// ===============================
// 拡張子判定
// ===============================
function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop().toLowerCase();
    return ext || "";
  } catch {
    return "";
  }
}

// ===============================
// ImageRecord の生成（v1 必須項目のみ）
// ===============================
function createImageRecord(url) {
  return {
    id: crypto.randomUUID(), // v1必須
    src: url, // v1必須
    ext: getExtension(url), // v1必須（SVG/GIFフィルタ用）
    naturalWidth: 0, // v1必須（最小サイズフィルタ用）
    naturalHeight: 0, // v1必須
    isValid: false, // v1必須（読み込み失敗除外）
  };
}

// ===============================
// カード生成
// ===============================
function createCard(record) {
  const div = document.createElement("div");
  div.className = "item";
  div.dataset.ext = record.ext;

  const img = document.createElement("img");
  img.className = "thumb";
  img.src = record.src;

  // naturalWidth / naturalHeight の取得
  img.onload = () => {
    record.naturalWidth = img.naturalWidth;
    record.naturalHeight = img.naturalHeight;
    record.isValid = true;
  };

  img.onerror = () => {
    record.isValid = false;
    div.remove(); // 読み込み失敗は除外
  };

  // 画像クリック → 拡大表示
  img.addEventListener("click", () => {
    modalImg.src = record.src;
    modal.classList.remove("hidden");
    enterZoomState();
  });

  div.appendChild(img);
  grid.appendChild(div);
}

// ===============================
// 画像一覧の読み込み
// ===============================
chrome.storage.session.get("images").then(({ images }) => {
  if (!images || images.length === 0) {
    info.textContent = "画像がありません";
    return;
  }

  info.textContent = `${images.length} 件の画像`;

  images.forEach((url) => {
    const record = createImageRecord(url);
    createCard(record);
  });
});

// ===============================
// 閉じる操作
// ===============================
overlay.addEventListener("click", enterGridState);
closeBtn.addEventListener("click", enterGridState);

// ===============================
// 拡大 / 原寸大切り替え
// ===============================
zoomBtn.addEventListener("click", () => {
  if (viewerState === ViewerState.ZOOM) {
    enterOriginalState();
  } else {
    enterZoomState();
  }
});

// ===============================
// 原寸大ドラッグ処理
// ===============================
let isDragging = false;
let startX = 0;
let startY = 0;
let imgX = 0;
let imgY = 0;

modalImg.addEventListener("mousedown", (e) => {
  if (viewerState !== ViewerState.ORIGINAL) return;

  e.preventDefault();
  modalImg.draggable = false;

  isDragging = true;
  modalImg.classList.add("dragging");

  startX = e.clientX;
  startY = e.clientY;

  const rect = modalImg.getBoundingClientRect();
  imgX = rect.left;
  imgY = rect.top;
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  let newLeft = imgX + dx;
  let newTop = imgY + dy;

  const imgWidth = modalImg.offsetWidth;
  const imgHeight = modalImg.offsetHeight;
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;

  const canDragX = imgWidth > winWidth;
  const canDragY = imgHeight > winHeight;

  if (canDragX) {
    const minLeft = winWidth - imgWidth;
    const maxLeft = 0;
    newLeft = Math.min(Math.max(newLeft, minLeft), maxLeft);
  } else {
    newLeft = imgX;
  }

  if (canDragY) {
    const minTop = winHeight - imgHeight;
    const maxTop = 0;
    newTop = Math.min(Math.max(newTop, minTop), maxTop);
  } else {
    newTop = imgY;
  }

  modalImg.style.left = `${newLeft}px`;
  modalImg.style.top = `${newTop}px`;
});

document.addEventListener("mouseup", () => {
  isDragging = false;
  modalImg.classList.remove("dragging");
});

// ===============================
// 状態遷移：GRID
// ===============================
function enterGridState() {
  viewerState = ViewerState.GRID;
  modal.classList.add("hidden");
}

// ===============================
// 状態遷移：ZOOM
// ===============================
function enterZoomState() {
  viewerState = ViewerState.ZOOM;

  modalImg.classList.remove("original");
  modalImg.style.left = "0px";
  modalImg.style.top = "0px";

  const naturalWidth = modalImg.naturalWidth;
  const naturalHeight = modalImg.naturalHeight;
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;

  zoomInIcon.style.display =
    naturalWidth <= winWidth && naturalHeight <= winHeight ? "none" : "block";

  zoomOutIcon.style.display = "none";
}

// ===============================
// 状態遷移：ORIGINAL
// ===============================
function enterOriginalState() {
  viewerState = ViewerState.ORIGINAL;

  modalImg.classList.add("original");

  zoomInIcon.style.display = "none";
  zoomOutIcon.style.display = "block";

  const rect = modalImg.getBoundingClientRect();
  const imgWidth = rect.width;
  const imgHeight = rect.height;

  const centerX = (window.innerWidth - imgWidth) / 2;
  const centerY = (window.innerHeight - imgHeight) / 2;

  modalImg.style.left = `${centerX}px`;
  modalImg.style.top = `${centerY}px`;
}
