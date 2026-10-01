import type { Messages } from "./types";

export const en: Messages = {
  "page.title": "Image Gallery",
  "filter.minSizeTitle": "Minimum size (px)",
  "filter.width": "Width",
  "filter.height": "Height",
  "filter.apply": "Apply",
  "filter.clear": "Clear",
  "filter.extTitle": "File type filter",
  "filter.hideSvg": "Hide SVG",
  "filter.hideGif": "Hide GIF",
  "status.imageCount": "{count} images",
  "status.noImages": "No images found",
  "status.visibleCount": "Showing: {count} images",
  "status.filterActive":
    "Active: width ≥ {width}px / height ≥ {height}px",
  "status.truncated":
    "Showing the first {limit} of {total} images (session limit).",
  "status.fallbackDelivery":
    "Could not save to session. The list was sent temporarily; reload may clear it.",
  "status.extractFailed": "Could not extract images from this page.",
  "status.loadFailed":
    "Could not load the image list. Please extract images again from the original page.",
  "lang.label": "Language",
  "lang.en": "English",
  "lang.ja": "日本語",
  "modal.close": "Close",
  "modal.zoomIn": "Fit to screen",
  "modal.zoomOut": "Actual size",
  "modal.prev": "Previous image",
  "modal.next": "Next image",
};
