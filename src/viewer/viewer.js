// ===============================
// Viewer State Enum（追加）
// ===============================
const ViewerState = {
  GRID: "grid",
  ZOOM: "zoom",
  ORIGINAL: "original",
};

// 現在の状態（初期値は一覧）
let viewerState = ViewerState.GRID;

const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("close-btn");
const zoomBtn = document.getElementById("zoom-btn");
const zoomInIcon = document.getElementById("zoom-in-icon");
const zoomOutIcon = document.getElementById("zoom-out-icon");

// 画像のURLが連携されたら一覧表示する
chrome.storage.session.get("images").then(({ images }) => {
  const grid = document.getElementById("grid");
  const info = document.getElementById("info");

  if (!images || images.length === 0) {
    info.textContent = "画像がありません";
    return;
  }

  info.textContent = `${images.length} 件の画像`;

  // 一覧に表示する項目を作成
  images.forEach((url) => {
    const div = document.createElement("div");
    div.className = "item";

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = url;

    img.addEventListener("click", () => {
      modalImg.src = img.src;
      modal.classList.remove("hidden");

      enterZoomState();
    });

    div.appendChild(img);
    grid.appendChild(div);
  });
});

overlay.addEventListener("click", () => {
  enterGridState();
});

closeBtn.addEventListener("click", () => {
  enterGridState();
});

zoomBtn.addEventListener("click", () => {
  if (viewerState === ViewerState.ZOOM) {
    enterOriginalState();
  } else {
    enterZoomState();
  }
});

let isDragging = false;
let startX = 0;
let startY = 0;
let imgX = 0;
let imgY = 0;

modalImg.addEventListener("mousedown", (e) => {
  // オリジナルサイズのときだけドラッグ可能
  if (viewerState !== ViewerState.ORIGINAL) {
    return;
  }

  // ブラウザの標準画像ドラッグを無効化
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

  // ★ 端から100pxまでしかドラッグできないように制限
  const centerX = (winWidth - imgWidth) / 2;
  const maxLeft = centerX + 100;
  const minLeft = centerX - 100;

  const centerY = (winHeight - imgHeight) / 2;
  const maxTop = centerY + 100;
  const minTop = centerY - 100;

  // clamp（範囲に収める）
  newLeft = Math.min(Math.max(newLeft, minLeft), maxLeft);
  newTop = Math.min(Math.max(newTop, minTop), maxTop);

  modalImg.style.left = `${newLeft}px`;
  modalImg.style.top = `${newTop}px`;
});

document.addEventListener("mouseup", () => {
  isDragging = false;
  modalImg.classList.remove("dragging");
});

/**
 * 一覧表示状態遷移時の処理
 * modalImg のクラスや left/top の調整、ボタンの表示切り替えなどを行う
 * これにより、拡大・縮小ボタンの表示切り替えや、一覧表示の画像を画面中央に配置する処理が一元化される
 */
function enterGridState() {
  viewerState = ViewerState.GRID;

  // モーダルを閉じる
  modal.classList.add("hidden");
}

/**
 * 拡大表示状態遷移時の処理
 * modalImg のクラスや left/top の調整、ボタンの表示切り替えなどを行う
 * これにより、拡大・縮小ボタンの表示切り替えや、拡大画像の画像を画面中央に配置する処理が一元化される
 */
function enterZoomState() {
  viewerState = ViewerState.ZOOM;

  modalImg.classList.remove("original");
  modalImg.style.left = "0px";
  modalImg.style.top = "0px";

  // 拡大・縮小ボタンの表示切り替え
  zoomInIcon.style.display = "block";
  zoomOutIcon.style.display = "none";
}

/**
 * 原寸大表示状態遷移時の処理
 * modalImg のクラスや left/top の調整、ボタンの表示切り替えなどを行う
 * これにより、拡大・縮小ボタンの表示切り替えや、原寸大の画像を画面中央に配置する処理が一元化される
 */
function enterOriginalState() {
  viewerState = ViewerState.ORIGINAL;

  modalImg.classList.add("original");

  // 拡大・縮小ボタンの表示切り替え
  zoomInIcon.style.display = "none";
  zoomOutIcon.style.display = "block";

  // 原寸大の画像サイズを取得
  const rect = modalImg.getBoundingClientRect();
  const imgWidth = rect.width;
  const imgHeight = rect.height;

  // 画面中央に配置するための left/top を計算
  const centerX = (window.innerWidth - imgWidth) / 2;
  const centerY = (window.innerHeight - imgHeight) / 2;

  modalImg.style.left = `${centerX}px`;
  modalImg.style.top = `${centerY}px`;
}
