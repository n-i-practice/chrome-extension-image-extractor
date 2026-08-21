const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const overlay = document.getElementById("overlay");
const zoomBtn = document.getElementById("zoom-btn");

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

      modalImg.classList.remove("original");
      modalImg.style.left = "0px";
      modalImg.style.top = "0px";
    });

    div.appendChild(img);
    grid.appendChild(div);
  });
});

// オーバーレイ部分をクリックで拡大表示を閉じる
overlay.addEventListener("click", () => {
  if (modalImg.classList.contains("original")) {
    return; // 原寸大のときは閉じない
  }

  modal.classList.add("hidden");
});

zoomBtn.addEventListener("click", () => {
  const isOriginal = modalImg.classList.toggle("original");

  const zoomIn = document.getElementById("zoom-in-icon");
  const zoomOut = document.getElementById("zoom-out-icon");

  if (isOriginal) {
    // 拡大・縮小ボタンの表示切り替え
    zoomIn.style.display = "none";
    zoomOut.style.display = "block";

    // 原寸大の画像サイズを取得
    const rect = modalImg.getBoundingClientRect();
    const imgWidth = rect.width;
    const imgHeight = rect.height;

    // 画面中央に配置するための left/top を計算
    const centerX = (window.innerWidth - imgWidth) / 2;
    const centerY = (window.innerHeight - imgHeight) / 2;

    modalImg.style.left = `${centerX}px`;
    modalImg.style.top = `${centerY}px`;
  } else {
    // 拡大・縮小ボタンの表示切り替え
    zoomIn.style.display = "block";
    zoomOut.style.display = "none";

    // 通常サイズに戻すときは中央揃えに任せる
    modalImg.style.left = "0px";
    modalImg.style.top = "0px";
  }
});

let isDragging = false;
let startX = 0;
let startY = 0;
let imgX = 0;
let imgY = 0;

modalImg.addEventListener("mousedown", (e) => {
  // オリジナルサイズのときだけドラッグ可能
  if (!modalImg.classList.contains("original")) return;

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
  if (!isDragging) return;

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
  const minLeft = winWidth - imgWidth - 100; // 右端 +100px
  const maxLeft = 100; // 左端 +100px

  const minTop = winHeight - imgHeight - 100; // 下端 +100px
  const maxTop = 100; // 上端 +100px

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
