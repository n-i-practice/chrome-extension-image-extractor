export type Locale = "en" | "ja";

export type MessageParams = Record<string, string | number>;

/** 辞書キーは en.ts のキーを正とする */
export type MessageKey =
  | "page.title"
  | "support.link"
  | "filter.minSizeTitle"
  | "filter.width"
  | "filter.height"
  | "filter.apply"
  | "filter.clear"
  | "filter.extTitle"
  | "filter.hideSvg"
  | "filter.hideGif"
  | "status.imageCount"
  | "status.noImages"
  | "status.visibleCount"
  | "status.loadingCount"
  | "status.failedCount"
  | "status.filteredCount"
  | "status.filterActive"
  | "status.truncated"
  | "status.fallbackDelivery"
  | "status.extractFailed"
  | "status.loadFailed"
  | "lang.label"
  | "lang.en"
  | "lang.ja"
  | "modal.close"
  | "modal.zoomIn"
  | "modal.zoomOut"
  | "modal.prev"
  | "modal.next";

export type Messages = Record<MessageKey, string>;
