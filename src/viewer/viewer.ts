import {
  applyStaticI18n,
  getLocale,
  isLocale,
  resolveLocale,
  setLocale,
  t,
} from "../i18n";

// ===============================
// Viewer State Enum（表示状態の定義）
// ===============================
const ViewerState = {
  GRID: "grid", // 一覧表示
  ZOOM: "zoom", // 拡大表示
  ORIGINAL: "original", // 原寸大表示（ドラッグ可能）
} as const;

type ViewerStateType = (typeof ViewerState)[keyof typeof ViewerState];
let viewerState: ViewerStateType = ViewerState.GRID;

// ===============================
// DOM 要素
// ===============================
const modal = document.getElementById("modal") as HTMLElement;
const modalImg = document.getElementById("modal-img") as HTMLImageElement;
const overlay = document.getElementById("overlay") as HTMLElement;
const closeBtn = document.getElementById("close-btn") as HTMLElement;
const zoomBtn = document.getElementById("zoom-btn") as HTMLElement;
const zoomInIcon = document.getElementById("zoom-in-icon") as HTMLElement;
const zoomOutIcon = document.getElementById("zoom-out-icon") as HTMLElement;
const grid = document.getElementById("grid") as HTMLElement;
const info = document.getElementById("info") as HTMLElement;
const filterInfo = document.getElementById("filter-info") as HTMLElement;
const visibleCount = document.getElementById("visible-count") as HTMLElement;
const localeSelect = document.getElementById(
  "locale-select",
) as HTMLSelectElement;

/** 読み込み済み画像件数（言語切替時の件数表示再描画用） */
let totalImageCount = 0;
let imagesLoaded = false;

// フィルター用チェックボックス
const filterSvgCheckbox = document.getElementById(
  "filter-svg",
) as HTMLInputElement;
const filterGifCheckbox = document.getElementById(
  "filter-gif",
) as HTMLInputElement;
const minWidthInput = document.getElementById("min-width") as HTMLInputElement;
const minHeightInput = document.getElementById(
  "min-height",
) as HTMLInputElement;
const applySizeFilterButton = document.getElementById(
  "apply-size-filter",
) as HTMLButtonElement;
const clearSizeFilterButton = document.getElementById(
  "clear-size-filter",
) as HTMLButtonElement;

// フィルター用変数
// 適用中の最小サイズの値を保持する。入力中の値と適用後の値を分けて扱う。
let committedMinWidth: number = 0;
let committedMinHeight: number = 0;

function commitMinSizeFilter(): void {
  const widthValue = Number(minWidthInput.value || "0");
  const heightValue = Number(minHeightInput.value || "0");

  const safeWidth =
    Number.isInteger(widthValue) && widthValue >= 0 ? widthValue : 0;
  const safeHeight =
    Number.isInteger(heightValue) && heightValue >= 0 ? heightValue : 0;

  minWidthInput.value = String(safeWidth);
  minHeightInput.value = String(safeHeight);

  committedMinWidth = safeWidth;
  committedMinHeight = safeHeight;
}

// ===============================
// 拡張子判定
// ===============================
function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
    return ext;
  } catch {
    return "";
  }
}

// ===============================
// ImageRecord 型
// ===============================
interface ImageRecord {
  id: string;
  src: string;
  ext: string;
  naturalWidth: number;
  naturalHeight: number;
  isValid: boolean;
}

// ===============================
// ImageRecord の生成（v1 必須項目のみ）
// ===============================
function createImageRecord(url: string): ImageRecord {
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
function createCard(record: ImageRecord): void {
  const div = document.createElement("div");
  div.className = "item";
  div.dataset.ext = record.ext;
  div.dataset.width = "0";
  div.dataset.height = "0";

  const img = document.createElement("img");
  img.className = "thumb";
  img.src = record.src;

  // naturalWidth / naturalHeight の取得
  img.onload = () => {
    record.naturalWidth = img.naturalWidth;
    record.naturalHeight = img.naturalHeight;
    record.isValid = true;
    div.dataset.width = String(record.naturalWidth);
    div.dataset.height = String(record.naturalHeight);
    applyFilters();
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
// フィルター適用処理
// ===============================
function applyFilters(): void {
  const hideSvg = filterSvgCheckbox.checked;
  const hideGif = filterGifCheckbox.checked;

  const items = grid.querySelectorAll<HTMLDivElement>(".item");

  let visible = 0;

  items.forEach((item) => {
    const ext = item.dataset.ext ?? "";
    const width = Number(item.dataset.width ?? "0");
    const height = Number(item.dataset.height ?? "0");

    let hidden = false;

    if (hideSvg && ext === "svg") {
      hidden = true;
    }

    if (hideGif && ext === "gif") {
      hidden = true;
    }

    if (width < committedMinWidth || height < committedMinHeight) {
      hidden = true;
    }

    item.style.display = hidden ? "none" : "";

    if (!hidden) {
      visible++;
    }
  });

  // 表示中件数を更新
  visibleCount.textContent = t("status.visibleCount", { count: visible });
}

// ===============================
// フィルター情報の更新
// ===============================
function updateFilterInfo(): void {
  filterInfo.textContent = t("status.filterActive", {
    width: committedMinWidth,
    height: committedMinHeight,
  });
}

function updateInfoText(): void {
  if (!imagesLoaded) {
    return;
  }
  if (totalImageCount === 0) {
    info.textContent = t("status.noImages");
    return;
  }
  info.textContent = t("status.imageCount", { count: totalImageCount });
}

/** モーダル操作ボタンの aria-label（次に実行される操作を表す） */
function updateModalAriaLabels(): void {
  closeBtn.setAttribute("aria-label", t("modal.close"));
  if (viewerState === ViewerState.ORIGINAL) {
    zoomBtn.setAttribute("aria-label", t("modal.zoomIn"));
  } else {
    zoomBtn.setAttribute("aria-label", t("modal.zoomOut"));
  }
}

/** 静的・動的文言を現在の locale で再適用する */
function refreshI18n(): void {
  applyStaticI18n();
  localeSelect.value = getLocale();
  updateInfoText();
  updateFilterInfo();
  applyFilters();
  updateModalAriaLabels();
}

// ===============================
// フィルターイベント
// ===============================
// SVG チェックボックス変更時: SVG 画像を非表示にする
filterSvgCheckbox.addEventListener("change", applyFilters);
// GIF チェックボックス変更時: GIF 画像を非表示にする
filterGifCheckbox.addEventListener("change", applyFilters);

// 「適用」ボタン押下時: 入力値を整えてサイズフィルターを再評価する
applySizeFilterButton.addEventListener("click", () => {
  commitMinSizeFilter();
  applyFilters();
  updateFilterInfo();
});

// 「クリア」ボタン押下時: 入力値だけを 0 に戻し、フィルターは再適用しない
clearSizeFilterButton.addEventListener("click", () => {
  minWidthInput.value = "0";
  minHeightInput.value = "0";
});

// 入力直前に 0 以上の整数以外を止める
minWidthInput.addEventListener("beforeinput", (event: InputEvent) => {
  const inserted = event.data ?? "";
  if (inserted && /\D/.test(inserted)) {
    event.preventDefault();
  }
});
minHeightInput.addEventListener("beforeinput", (event: InputEvent) => {
  const inserted = event.data ?? "";
  if (inserted && /\D/.test(inserted)) {
    event.preventDefault();
  }
});

// フォーカス時に入力値を全選択する
minWidthInput.addEventListener("focus", () => {
  minWidthInput.select();
});
minHeightInput.addEventListener("focus", () => {
  minHeightInput.select();
});

// 横幅 Enter 時: 空欄なら 0 を補完してサイズフィルターを再適用する
minWidthInput.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitMinSizeFilter();
    applyFilters();
    updateFilterInfo();
  }
});
// 縦幅 Enter 時: 空欄なら 0 を補完してサイズフィルターを再適用する
minHeightInput.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitMinSizeFilter();
    applyFilters();
    updateFilterInfo();
  }
});

// 初期表示と画像読み込みは locale 解決後に行う
void init();

localeSelect.addEventListener("change", () => {
  const value = localeSelect.value;
  if (!isLocale(value)) {
    return;
  }
  void setLocale(value).then(() => {
    refreshI18n();
  });
});

async function init(): Promise<void> {
  await resolveLocale();
  refreshI18n();

  const result = await chrome.storage.session.get("images");
  const images = result.images ?? [];
  imagesLoaded = true;
  totalImageCount = images.length;
  updateInfoText();

  if (images.length === 0) {
    return;
  }

  images.forEach((url: string) => {
    const record = createImageRecord(url);
    createCard(record);
  });
}

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

modalImg.addEventListener("mousedown", (e: MouseEvent) => {
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

document.addEventListener("mousemove", (e: MouseEvent) => {
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
function enterGridState(): void {
  viewerState = ViewerState.GRID;
  modal.classList.add("hidden");
}

// ===============================
// 状態遷移：ZOOM
// ===============================
function enterZoomState(): void {
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
  updateModalAriaLabels();
}

// ===============================
// 状態遷移：ORIGINAL
// ===============================
function enterOriginalState(): void {
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
  updateModalAriaLabels();
}
