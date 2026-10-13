/**
 * Image Extractor の viewer 本体。
 *
 * - session（または fallback メッセージ）から画像 URL を受け取り一覧表示する
 * - 最小サイズ / SVG・GIF フィルターを適用する
 * - カードクリックでモーダル拡大表示し、左右矢印で前後移動する
 * - 文言は src/i18n の辞書経由（refreshI18n）
 */
import {
  applyStaticI18n,
  getLocale,
  isLocale,
  resolveLocale,
  setLocale,
  t,
} from "../i18n";
import { MAX_SESSION_IMAGES } from "../shared/limits";
import {
  imagesNoticeSessionKey,
  imagesSessionKey,
  type ImagesNotice,
} from "../shared/session-keys";

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
const prevBtn = document.getElementById("prev-btn") as HTMLButtonElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
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
const noticesEl = document.getElementById("notices") as HTMLElement;

/**
 * モーダル表示中は background（header / main など）を inert にして
 * Tab で裏の入力へフォーカスが移らないようにする。
 */
function setBackgroundInert(enabled: boolean): void {
  for (const el of Array.from(document.body.children)) {
    if (el === modal) {
      continue;
    }
    if (enabled) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }
}

/** 抽出で受け取った画像URL件数（失敗しても減らさない。言語切替時の再描画用） */
let totalImageCount = 0;
/** サムネ読み込みに失敗してカードを除外した件数 */
let failedImageCount = 0;
/** init 完了後に true。それまでは件数文言を出さない */
let imagesLoaded = false;
/** session / fallback 由来の通知（切り詰め・一時受け渡し） */
let activeNotice: ImagesNotice | null = null;
/** 抽出失敗などで一覧を開けなかった場合のエラー種別 */
let pageError: "extract" | "load" | null = null;

/**
 * 拡大表示中の、表示中（フィルター後）一覧におけるインデックス。
 * 前後ナビはこのインデックスを基準に移動する。閉じているときは -1。
 */
let currentModalIndex = -1;

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
// 適用中の最小サイズ。仕様どおり初期値は 400×400 で、起動時点からフィルター適用済みとする。
const DEFAULT_MIN_SIZE = 400;
let committedMinWidth: number = DEFAULT_MIN_SIZE;
let committedMinHeight: number = DEFAULT_MIN_SIZE;

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
    const parsed = new URL(url);
    // blob / data のパスはファイル名ではないため、拡張子として扱わない。
    if (parsed.protocol === "blob:" || parsed.protocol === "data:") {
      return "";
    }
    // ディレクトリ内のドットや、拡張子のないパス全体を拾わない。
    const filename = parsed.pathname.slice(parsed.pathname.lastIndexOf("/") + 1);
    return filename.match(/.+\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? "";
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
/**
 * カード下部メタ行の文言。サイズ未取得時は — を使う（数値と記号のみなので i18n 不要）。
 */
function formatCardMeta(
  width: number,
  height: number,
  ext: string,
): string {
  const size = width > 0 && height > 0 ? `${width}x${height}` : "—";
  const type = ext || "—";
  return `${size} · ${type}`;
}

function createCard(record: ImageRecord): void {
  const div = document.createElement("div");
  div.className = "item";
  div.dataset.ext = record.ext;
  // 前後ナビ・フィルター同期で URL 照合するため、カード側にも src を持たせる
  div.dataset.src = record.src;
  div.dataset.width = "0";
  div.dataset.height = "0";
  // pending: サイズ未確定。loaded になってからフィルター判定する
  div.dataset.loadState = "pending";

  // 上: サムネ / 下: サイズ・拡張子（メタ情報の第1段）
  const thumbWrap = document.createElement("div");
  thumbWrap.className = "item-thumb";

  const img = document.createElement("img");
  img.className = "thumb";
  img.src = record.src;
  thumbWrap.appendChild(img);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = formatCardMeta(0, 0, record.ext);

  // naturalWidth / naturalHeight の取得（サイズフィルター・メタ行用）
  img.onload = () => {
    record.naturalWidth = img.naturalWidth;
    record.naturalHeight = img.naturalHeight;
    record.isValid = true;
    div.dataset.loadState = "loaded";
    div.dataset.width = String(record.naturalWidth);
    div.dataset.height = String(record.naturalHeight);
    meta.textContent = formatCardMeta(
      record.naturalWidth,
      record.naturalHeight,
      record.ext,
    );
    applyFilters();
  };

  img.onerror = () => {
    record.isValid = false;
    failedImageCount += 1;
    div.remove(); // 読み込み失敗は除外
    // 除去後の件数とモーダル位置をまとめて再評価する。最後の失敗でも0件にする。
    applyFilters();
  };

  // サムネ・メタ行どちらをクリックしても拡大表示を開く
  div.addEventListener("click", () => {
    const items = getVisibleItems();
    const index = items.indexOf(div);
    if (index < 0) {
      return;
    }
    openModalAtIndex(index);
  });

  div.appendChild(thumbWrap);
  div.appendChild(meta);
  grid.appendChild(div);
}

/**
 * フィルター適用後に画面へ出ているカード一覧。
 * 前後ナビの対象もこの集合に限定する（非表示カードは飛ばす）。
 */
function getVisibleItems(): HTMLDivElement[] {
  return Array.from(grid.querySelectorAll<HTMLDivElement>(".item")).filter(
    (item) => item.style.display !== "none",
  );
}

/**
 * 指定インデックスの画像をモーダルで開く。
 * 切り替え時はすぐ ZOOM 状態にし、原寸設定をリセットする。
 * 前画像の残像を避けるため、読み込み完了まで画像は非表示にする。
 * 自然サイズに依存するズームボタン表示だけ onload 後に更新する。
 */
function openModalAtIndex(index: number): void {
  const items = getVisibleItems();
  if (index < 0 || index >= items.length) {
    return;
  }

  // resetToZoomLayout 前に判定（初回オープン時だけ閉じるボタンへフォーカス）
  const openingFromGrid = viewerState === ViewerState.GRID;

  currentModalIndex = index;
  const src = items[index].dataset.src ?? "";
  if (!src) {
    return;
  }

  // 読み込み待ち中も矢印が効くよう、表示と同時に ZOOM へ移す
  resetToZoomLayout();

  // 前画像の残像を出さないよう、読み込み完了まで非表示にする
  modalImg.style.visibility = "hidden";
  modalImg.onload = () => {
    modalImg.style.visibility = "visible";
    updateZoomControlsForCurrentImage();
  };
  modalImg.onerror = () => {
    // 失敗時も空のままにせず、破画像アイコン等を見せる
    modalImg.style.visibility = "visible";
  };
  modalImg.src = src;
  modal.classList.remove("hidden");
  setBackgroundInert(true);

  // キャッシュ済み画像は onload が発火しないことがある
  if (modalImg.complete && modalImg.naturalWidth > 0) {
    modalImg.onload = null;
    modalImg.onerror = null;
    modalImg.style.visibility = "visible";
    updateZoomControlsForCurrentImage();
  }

  updateNavButtons();

  // Tab が裏に逃げないよう、初回表示時はモーダル内へフォーカスを移す
  if (openingFromGrid) {
    closeBtn.focus();
  }
}

/**
 * 先頭／末尾、または表示が1枚以下のときは該当側の矢印を隠す。
 */
function updateNavButtons(): void {
  const items = getVisibleItems();
  const atStart = currentModalIndex <= 0;
  const atEnd = currentModalIndex < 0 || currentModalIndex >= items.length - 1;

  prevBtn.classList.toggle("hidden", atStart || items.length <= 1);
  nextBtn.classList.toggle("hidden", atEnd || items.length <= 1);
  updateModalAriaLabels();
}

/** delta: -1 で前、+1 で次。範囲外なら何もしない。 */
function showAdjacentImage(delta: number): void {
  if (viewerState === ViewerState.GRID) {
    return;
  }
  const items = getVisibleItems();
  const nextIndex = currentModalIndex + delta;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return;
  }
  openModalAtIndex(nextIndex);
}

/**
 * フィルター変更後、表示中モーダルのインデックスを同期する。
 * 現在の画像が非表示になった／消えた場合はモーダルを閉じる。
 */
function syncModalAfterFilterChange(): void {
  if (viewerState === ViewerState.GRID) {
    return;
  }

  const items = getVisibleItems();
  if (items.length === 0) {
    enterGridState();
    return;
  }

  const currentSrc = modalImg.getAttribute("src") ?? "";
  const index = items.findIndex((item) => item.dataset.src === currentSrc);
  if (index < 0) {
    enterGridState();
    return;
  }

  currentModalIndex = index;
  updateNavButtons();
}

// ===============================
// フィルター適用処理
// ===============================
/**
 * カードを読み込み中 / 表示中 / フィルター非表示に分けて再評価する。
 * 失敗件数はカード除去時に failedImageCount へ積む。
 */
function applyFilters(): void {
  const hideSvg = filterSvgCheckbox.checked;
  const hideGif = filterGifCheckbox.checked;

  const items = grid.querySelectorAll<HTMLDivElement>(".item");

  let visible = 0;
  let loading = 0;
  let filtered = 0;

  items.forEach((item) => {
    // サイズ未確定の間は一覧に出さず、フィルター非表示とも分けて数える
    if (item.dataset.loadState !== "loaded") {
      loading += 1;
      item.style.display = "none";
      return;
    }

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

    if (hidden) {
      filtered += 1;
    } else {
      visible += 1;
    }
  });

  updateStatusCounts(visible, loading, filtered);
  // モーダル表示中に可視集合が変わったら前後ナビの位置も合わせる
  syncModalAfterFilterChange();
}

/**
 * 表示中を必須とし、読み込み中・失敗・フィルター非表示は件数があるときだけ併記する。
 */
function updateStatusCounts(
  visible: number,
  loading: number,
  filtered: number,
): void {
  const parts = [t("status.visibleCount", { count: visible })];
  if (loading > 0) {
    parts.push(t("status.loadingCount", { count: loading }));
  }
  if (failedImageCount > 0) {
    parts.push(t("status.failedCount", { count: failedImageCount }));
  }
  if (filtered > 0) {
    parts.push(t("status.filteredCount", { count: filtered }));
  }
  visibleCount.textContent = parts.join(" · ");
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
  if (pageError === "extract") {
    info.textContent = t("status.extractFailed");
    return;
  }
  if (pageError === "load") {
    info.textContent = t("status.loadFailed");
    return;
  }
  if (totalImageCount === 0) {
    info.textContent = t("status.noImages");
    return;
  }
  info.textContent = t("status.imageCount", { count: totalImageCount });
}

/**
 * モーダル操作ボタンの aria-label を現在の言語で更新する。
 * アイコンのみのボタン向け（閉じる / 前後 / ズーム）。
 */
function updateModalAriaLabels(): void {
  closeBtn.setAttribute("aria-label", t("modal.close"));
  prevBtn.setAttribute("aria-label", t("modal.prev"));
  nextBtn.setAttribute("aria-label", t("modal.next"));
  if (viewerState === ViewerState.ORIGINAL) {
    zoomBtn.setAttribute("aria-label", t("modal.zoomIn"));
  } else {
    zoomBtn.setAttribute("aria-label", t("modal.zoomOut"));
  }
}

/** session 保存失敗・件数切り詰めなどの通知バナーを描画する */
function renderNotices(): void {
  noticesEl.replaceChildren();
  const hasNotice =
    activeNotice?.delivery === "fallback" || activeNotice?.truncated;
  if (!hasNotice) {
    noticesEl.hidden = true;
    return;
  }

  noticesEl.hidden = false;

  if (activeNotice?.delivery === "fallback") {
    const p = document.createElement("p");
    p.className = "notice";
    p.textContent = t("status.fallbackDelivery");
    noticesEl.appendChild(p);
  }

  if (activeNotice?.truncated) {
    const p = document.createElement("p");
    p.className = "notice";
    p.textContent = t("status.truncated", {
      limit: MAX_SESSION_IMAGES,
      total: activeNotice.originalCount,
    });
    noticesEl.appendChild(p);
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
  renderNotices();
}

function isImagesNotice(value: unknown): value is ImagesNotice {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.truncated === "boolean" &&
    typeof v.originalCount === "number" &&
    (v.delivery === "session" || v.delivery === "fallback")
  );
}

/**
 * session 保存失敗時、background から送られる fallback-images を待つ。
 * viewer-opened より先に listener を張ること（取りこぼし防止）。
 */
function waitForFallbackImages(
  sessionId: string,
  timeoutMs: number,
): Promise<{ images: string[]; notice: ImagesNotice | null } | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      // 空の抽出結果と、受け渡しが完了しなかった場合を区別する。
      resolve(null);
    }, timeoutMs);

    function handler(
      message: {
        type?: string;
        sessionId?: string;
        images?: string[];
        notice?: ImagesNotice;
      },
    ): void {
      if (
        message?.type !== "fallback-images" ||
        message.sessionId !== sessionId
      ) {
        return;
      }
      window.clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(handler);
      resolve({
        images: Array.isArray(message.images) ? message.images : [],
        notice: isImagesNotice(message.notice) ? message.notice : null,
      });
    }

    chrome.runtime.onMessage.addListener(handler);
  });
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

  const params = new URLSearchParams(location.search);
  const errorParam = params.get("error");
  if (errorParam === "extract") {
    pageError = "extract";
    imagesLoaded = true;
    totalImageCount = 0;
    failedImageCount = 0;
    updateInfoText();
    updateStatusCounts(0, 0, 0);
    renderNotices();
    return;
  }

  const sessionId = params.get("id");
  const delivery = params.get("delivery");

  // fallback 受信 listener を viewer-opened より先に張る
  const fallbackWait =
    sessionId && delivery === "fallback"
      ? waitForFallbackImages(sessionId, 8000)
      : null;

  // 複製タブでも参照カウントに載せる（background が id ごとの生存管理をする）
  if (sessionId) {
    void chrome.runtime.sendMessage({
      type: "viewer-opened",
      sessionId,
    });
  }

  let images: string[] = [];
  activeNotice = null;

  try {
    if (fallbackWait) {
      const fallback = await fallbackWait;
      if (!fallback) {
        throw new Error("Timed out waiting for fallback images");
      }
      images = fallback.images;
      activeNotice = fallback.notice;
    } else if (sessionId) {
      const imagesKey = imagesSessionKey(sessionId);
      const noticeKey = imagesNoticeSessionKey(sessionId);
      const result = await chrome.storage.session.get([imagesKey, noticeKey]);
      images = (result[imagesKey] as string[] | undefined) ?? [];
      const notice = result[noticeKey];
      activeNotice = isImagesNotice(notice) ? notice : null;
    }
  } catch (error) {
    // 読み出し失敗を「画像なし」と混同せず、言語切替後も再抽出の案内を維持する。
    console.error("Failed to load viewer images:", error);
    pageError = "load";
  }

  imagesLoaded = true;
  totalImageCount = images.length;
  failedImageCount = 0;
  updateInfoText();
  renderNotices();

  if (images.length === 0) {
    updateStatusCounts(0, 0, 0);
    return;
  }

  images.forEach((url: string) => {
    const record = createImageRecord(url);
    createCard(record);
  });
  // 読み込み完了前の「読み込み中」件数をすぐ出す
  applyFilters();
}

// ===============================
// 閉じる操作
// ===============================
overlay.addEventListener("click", enterGridState);
closeBtn.addEventListener("click", enterGridState);

// ===============================
// 前後ナビ
// ===============================
prevBtn.addEventListener("click", (event: MouseEvent) => {
  event.stopPropagation(); // overlay への伝播で閉じないようにする
  showAdjacentImage(-1);
});
nextBtn.addEventListener("click", (event: MouseEvent) => {
  event.stopPropagation();
  showAdjacentImage(1);
});

// 拡大・原寸表示中のキーボード操作
// - Escape: モーダルを閉じる
// - 左右キー: 前後移動（入力欄フォーカス中・修飾キー付きは除外。Alt+← 等のブラウザ操作を妨げない）
document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (viewerState === ViewerState.GRID) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    enterGridState();
    return;
  }

  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  // Alt/Ctrl/Meta 付きはブラウザや OS のショートカットに譲る
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  ) {
    return;
  }

  event.preventDefault();
  showAdjacentImage(event.key === "ArrowLeft" ? -1 : 1);
});

// ===============================
// 拡大 / 原寸大切り替え（ボタン）
// ===============================
zoomBtn.addEventListener("click", () => {
  if (viewerState === ViewerState.ZOOM) {
    enterOriginalState();
  } else {
    enterZoomState();
  }
});

// ===============================
// 画像クリックで拡大 ↔ 原寸、原寸時はドラッグ
// ===============================
/** 原寸表示中のパン中かどうか */
let isDragging = false;
/** 画像上でポインタ押下中か（拡大・原寸とも、ドラッグ判定に使う） */
let isPointerDownOnImage = false;
/** 今回のポインタ操作で閾値以上動いたか（動いたら click での表示切替を抑止） */
let dragMoved = false;
let startX = 0;
let startY = 0;
let imgX = 0;
let imgY = 0;
/** クリックとドラッグを区別する移動量（px） */
const DRAG_THRESHOLD_PX = 4;

/**
 * 原寸表示が画面より大きく意味があるか（ズームボタン表示と同条件）。
 */
function canShowOriginalSize(): boolean {
  return (
    modalImg.naturalWidth > window.innerWidth ||
    modalImg.naturalHeight > window.innerHeight
  );
}

modalImg.addEventListener("mousedown", (e: MouseEvent) => {
  if (
    viewerState !== ViewerState.ZOOM &&
    viewerState !== ViewerState.ORIGINAL
  ) {
    return;
  }
  if (e.button !== 0) {
    return;
  }

  // ブラウザの画像ドラッグゴーストを抑止
  e.preventDefault();
  modalImg.draggable = false;

  isPointerDownOnImage = true;
  dragMoved = false;
  startX = e.clientX;
  startY = e.clientY;

  // 原寸時のみパン開始。クリックだけの場合は mouseup → click で表示切替する
  if (viewerState === ViewerState.ORIGINAL) {
    isDragging = true;
    modalImg.classList.add("dragging");

    const rect = modalImg.getBoundingClientRect();
    imgX = rect.left;
    imgY = rect.top;
  }
});

document.addEventListener("mousemove", (e: MouseEvent) => {
  if (!isPointerDownOnImage) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  // 拡大表示でもドラッグなら原寸へ切り替えない（何もしない）
  if (
    !dragMoved &&
    (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX)
  ) {
    dragMoved = true;
    // 拡大表示中のドラッグは無効であることをカーソルで示す
    if (viewerState === ViewerState.ZOOM) {
      modalImg.classList.add("drag-not-allowed");
    }
  }

  if (!isDragging) return;

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
  isPointerDownOnImage = false;
  isDragging = false;
  modalImg.classList.remove("dragging", "drag-not-allowed");
});

// ドラッグせずに画像をクリックしたときだけ表示モードを切り替える
modalImg.addEventListener("click", () => {
  if (dragMoved) {
    dragMoved = false;
    return;
  }

  if (viewerState === ViewerState.ZOOM && canShowOriginalSize()) {
    enterOriginalState();
  } else if (viewerState === ViewerState.ORIGINAL) {
    enterZoomState();
  }
});

// ===============================
// 状態遷移：GRID
// ===============================
function enterGridState(): void {
  viewerState = ViewerState.GRID;
  currentModalIndex = -1;
  modalImg.onload = null; // 閉じた後に遅延 onload が走らないようにする
  modalImg.onerror = null;
  // 次回オープン時に前画像が一瞬映らないよう src を破棄する
  modalImg.removeAttribute("src");
  modalImg.style.visibility = "hidden";
  modal.classList.add("hidden");
  setBackgroundInert(false);
  updateNavButtons();
}

// ===============================
// 状態遷移：ZOOM
// ===============================
/**
 * モーダルを ZOOM レイアウトへ戻す（状態・原寸クラス・位置）。
 * 画像の自然サイズがまだ分からなくても呼んでよい。
 * ズームボタンはサイズ確定まで隠す（空のボタンにフォーカスが当たらないようにする）。
 */
function resetToZoomLayout(): void {
  viewerState = ViewerState.ZOOM;
  isPointerDownOnImage = false;
  isDragging = false;
  dragMoved = false;
  modalImg.classList.remove("original", "dragging", "can-zoom-in", "drag-not-allowed");
  modalImg.style.left = "0px";
  modalImg.style.top = "0px";
  zoomBtn.classList.add("hidden");
  zoomInIcon.style.display = "none";
  zoomOutIcon.style.display = "none";
  updateModalAriaLabels();
}

/**
 * 読み込み済み画像の自然サイズに応じてズームボタン・カーソルを更新する。
 * 画面に収まる画像ではボタンを隠し、クリックでの原寸切替も不可にする。
 */
function updateZoomControlsForCurrentImage(): void {
  if (viewerState !== ViewerState.ZOOM) {
    return;
  }

  const fitsInViewport = !canShowOriginalSize();

  if (fitsInViewport) {
    zoomBtn.classList.add("hidden");
    zoomInIcon.style.display = "none";
    zoomOutIcon.style.display = "none";
    modalImg.classList.remove("can-zoom-in");
  } else {
    zoomBtn.classList.remove("hidden");
    zoomInIcon.style.display = "block";
    zoomOutIcon.style.display = "none";
    // 原寸へ切り替え可能なときだけ虫眼鏡（拡大）カーソル
    modalImg.classList.add("can-zoom-in");
  }

  updateModalAriaLabels();
}

function enterZoomState(): void {
  resetToZoomLayout();
  updateZoomControlsForCurrentImage();
}

/**
 * 原寸表示の画像を画面中央へ置き直す。
 * ドラッグ中フラグも解除する（リサイズ時の位置ずれ防止）。
 */
function recenterOriginalImage(): void {
  isDragging = false;
  modalImg.classList.remove("dragging");

  const rect = modalImg.getBoundingClientRect();
  const imgWidth = rect.width;
  const imgHeight = rect.height;

  const centerX = (window.innerWidth - imgWidth) / 2;
  const centerY = (window.innerHeight - imgHeight) / 2;

  modalImg.style.left = `${centerX}px`;
  modalImg.style.top = `${centerY}px`;
}

// ウィンドウサイズ変更時:
// - ZOOM: 原寸大ボタンの表示を再判定
// - ORIGINAL: ドラッグをリセットして中央へ再配置
window.addEventListener("resize", () => {
  if (viewerState === ViewerState.ZOOM) {
    updateZoomControlsForCurrentImage();
  } else if (viewerState === ViewerState.ORIGINAL) {
    recenterOriginalImage();
  }
});

// ===============================
// 状態遷移：ORIGINAL
// ===============================
function enterOriginalState(): void {
  viewerState = ViewerState.ORIGINAL;

  // can-zoom-in を外し、.original の zoom-out カーソルにする
  modalImg.classList.remove("can-zoom-in");
  modalImg.classList.add("original");

  zoomBtn.classList.remove("hidden");
  zoomInIcon.style.display = "none";
  zoomOutIcon.style.display = "block";

  recenterOriginalImage();
  updateModalAriaLabels();
}
