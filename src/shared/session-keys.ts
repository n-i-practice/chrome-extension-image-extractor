/**
 * viewer ごとの画像一覧を chrome.storage.session で扱うためのキーヘルパ
 *
 * - images:<uuid>       … 画像 URL 一覧
 * - imagesNotice:<uuid> … 切り詰めなどの通知メタ
 * - viewerTab:<tabId>   … tabId → uuid
 * - viewerRefs:<uuid>   … 同じ uuid を開いている tabId 一覧（参照カウント）
 *
 * 詳細: docs/SPECIFICATION.md「chrome.storage.session の扱い」
 */

export const IMAGES_KEY_PREFIX = "images:";
export const IMAGES_NOTICE_KEY_PREFIX = "imagesNotice:";
export const VIEWER_TAB_KEY_PREFIX = "viewerTab:";
export const VIEWER_REFS_KEY_PREFIX = "viewerRefs:";

export type ImagesNotice = {
  truncated: boolean;
  originalCount: number;
  delivery: "session" | "fallback";
};

export function imagesSessionKey(id: string): string {
  return `${IMAGES_KEY_PREFIX}${id}`;
}

export function imagesNoticeSessionKey(id: string): string {
  return `${IMAGES_NOTICE_KEY_PREFIX}${id}`;
}

export function viewerTabSessionKey(tabId: number): string {
  return `${VIEWER_TAB_KEY_PREFIX}${tabId}`;
}

export function viewerRefsSessionKey(id: string): string {
  return `${VIEWER_REFS_KEY_PREFIX}${id}`;
}
