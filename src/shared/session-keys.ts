/**
 * viewer ごとの画像一覧を chrome.storage.session で扱うためのキーヘルパ
 *
 * - images:<uuid>     … 画像 URL 一覧
 * - viewerTab:<tabId> … タブ閉じ時に images を消すための対応表
 *
 * 詳細: docs/SPECIFICATION.md「chrome.storage.session の扱い」
 */

export const IMAGES_KEY_PREFIX = "images:";
export const VIEWER_TAB_KEY_PREFIX = "viewerTab:";

export function imagesSessionKey(id: string): string {
  return `${IMAGES_KEY_PREFIX}${id}`;
}

export function viewerTabSessionKey(tabId: number): string {
  return `${VIEWER_TAB_KEY_PREFIX}${tabId}`;
}
