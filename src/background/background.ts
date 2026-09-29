import { MAX_SESSION_IMAGES } from "../shared/limits";
import { normalizeAndDedupeUrls } from "../shared/normalize-url";
import {
  imagesNoticeSessionKey,
  imagesSessionKey,
  type ImagesNotice,
  viewerRefsSessionKey,
  viewerTabSessionKey,
} from "../shared/session-keys";

// Chrome API の型を使うために @types/chrome が必要
// npm install --save-dev @types/chrome

/** session 保存に失敗した一覧を、viewer-opened まで保持する */
const pendingFallbackImages = new Map<
  string,
  { images: string[]; notice: ImagesNotice }
>();

/**
 * viewerRefs の取得→更新→保存を直列化する。
 * 同じ id への並行 register / unregister による上書きを防ぐ。
 */
let sessionOpQueue: Promise<void> = Promise.resolve();

function enqueueSessionOp<T>(op: () => Promise<T>): Promise<T> {
  const run = sessionOpQueue.then(op, op);
  sessionOpQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * viewer タブを session id に紐づける。
 * 同じ id を複数タブで開いている場合は参照一覧に積む。
 * 登録直後にタブが既に閉じていればすぐ掃除する（create との競合対策）。
 */
function registerViewerTab(tabId: number, id: string): Promise<void> {
  return enqueueSessionOp(async () => {
    const tabKey = viewerTabSessionKey(tabId);
    const refsKey = viewerRefsSessionKey(id);

    const existing = await chrome.storage.session.get(refsKey);
    const refs: number[] = Array.isArray(existing[refsKey])
      ? (existing[refsKey] as number[]).filter((n) => typeof n === "number")
      : [];
    if (!refs.includes(tabId)) {
      refs.push(tabId);
    }

    await chrome.storage.session.set({
      [tabKey]: id,
      [refsKey]: refs,
    });

    // tabs.create 直後〜対応表保存前に閉じられた場合への保険
    try {
      await chrome.tabs.get(tabId);
    } catch {
      // 同一キュー内で解除する（二重ロック回避）
      await unregisterViewerTabUnlocked(tabId);
    }
  });
}

/**
 * タブと session id の紐づけを外す。
 * その id を参照するタブが無くなったときだけ images / refs を削除する。
 */
function unregisterViewerTab(tabId: number): Promise<void> {
  return enqueueSessionOp(() => unregisterViewerTabUnlocked(tabId));
}

async function unregisterViewerTabUnlocked(tabId: number): Promise<void> {
  const tabKey = viewerTabSessionKey(tabId);
  const result = await chrome.storage.session.get(tabKey);
  const id = result[tabKey];
  if (typeof id !== "string" || !id) {
    return;
  }

  const refsKey = viewerRefsSessionKey(id);
  const refsResult = await chrome.storage.session.get(refsKey);
  const refs: number[] = Array.isArray(refsResult[refsKey])
    ? (refsResult[refsKey] as number[]).filter((n) => typeof n === "number")
    : [];
  const nextRefs = refs.filter((n) => n !== tabId);

  if (nextRefs.length === 0) {
    await chrome.storage.session.remove([
      tabKey,
      refsKey,
      imagesSessionKey(id),
      imagesNoticeSessionKey(id),
    ]);
    pendingFallbackImages.delete(id);
    console.log("Removed session images (last viewer closed):", tabId, id);
    return;
  }

  await chrome.storage.session.remove(tabKey);
  await chrome.storage.session.set({ [refsKey]: nextRefs });
  console.log("Detached viewer tab; session images kept:", tabId, id, nextRefs);
}

function capImages(images: string[]): {
  images: string[];
  truncated: boolean;
  originalCount: number;
} {
  const originalCount = images.length;
  if (originalCount <= MAX_SESSION_IMAGES) {
    return { images, truncated: false, originalCount };
  }
  return {
    images: images.slice(0, MAX_SESSION_IMAGES),
    truncated: true,
    originalCount,
  };
}

async function openViewerTab(
  id: string,
  delivery: "session" | "fallback",
): Promise<chrome.tabs.Tab> {
  const viewerUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  viewerUrl.searchParams.set("id", id);
  if (delivery === "fallback") {
    viewerUrl.searchParams.set("delivery", "fallback");
  }
  return chrome.tabs.create({
    url: viewerUrl.href,
    active: true,
  });
}

async function openViewerError(error: "extract"): Promise<void> {
  const viewerUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  viewerUrl.searchParams.set("error", error);
  await chrome.tabs.create({
    url: viewerUrl.href,
    active: true,
  });
}

async function deliverImagesToViewer(
  images: string[],
): Promise<void> {
  const capped = capImages(images);
  const id = crypto.randomUUID();
  const imagesKey = imagesSessionKey(id);
  const noticeKey = imagesNoticeSessionKey(id);

  console.log(
    "Received image URLs:",
    capped.originalCount,
    "→",
    capped.images.length,
    "session id:",
    id,
  );

  const sessionNotice: ImagesNotice = {
    truncated: capped.truncated,
    originalCount: capped.originalCount,
    delivery: "session",
  };

  try {
    await chrome.storage.session.set({
      [imagesKey]: capped.images,
      [noticeKey]: sessionNotice,
    });
  } catch (error) {
    console.warn("session save failed; falling back to message delivery", error);
    const fallbackNotice: ImagesNotice = {
      truncated: capped.truncated,
      originalCount: capped.originalCount,
      delivery: "fallback",
    };
    pendingFallbackImages.set(id, {
      images: capped.images,
      notice: fallbackNotice,
    });

    const tab = await openViewerTab(id, "fallback");
    if (tab.id != null) {
      await registerViewerTab(tab.id, id);
    }
    return;
  }

  const tab = await openViewerTab(id, "session");
  if (tab.id != null) {
    await registerViewerTab(tab.id, id);
  }
}

async function sendFallbackIfPending(
  tabId: number,
  sessionId: string,
): Promise<void> {
  const pending = pendingFallbackImages.get(sessionId);
  if (!pending) {
    return;
  }
  pendingFallbackImages.delete(sessionId);
  await chrome.tabs.sendMessage(tabId, {
    type: "fallback-images",
    sessionId,
    images: pending.images,
    notice: pending.notice,
  });
}

// 拡張アイコンがクリックされたときの処理
chrome.action.onClicked.addListener(async () => {
  try {
    // 現在アクティブなタブを取得
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // タブが取得できない場合は何もしない
    if (!tab?.id) {
      await openViewerError("extract");
      return;
    }

    // content.js がすでにタブに注入されているかどうかを確認
    const checks = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => typeof window.extractImages === "function",
    });

    const hasFunction: boolean = Boolean(checks?.[0]?.result);

    if (hasFunction) {
      // content.js がすでにタブに注入されている場合は、直接関数を呼び出す
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.extractImages(),
      });
    } else {
      // content.js をタブに注入して実行
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["scripts/content.js"],
      });
    }
  } catch (error) {
    console.error("Failed to extract images:", error);
    try {
      await openViewerError("extract");
    } catch (openError) {
      console.error("Failed to open error viewer:", openError);
    }
  }
});

// content / viewer からのメッセージ
chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; payload?: string[]; sessionId?: string },
    sender,
  ) => {
    if (message?.type === "viewer-opened") {
      const id = message.sessionId;
      const tabId = sender.tab?.id;
      if (typeof id === "string" && id && tabId != null) {
        void (async () => {
          await registerViewerTab(tabId, id);
          await sendFallbackIfPending(tabId, id);
        })();
      }
      return;
    }

    if (message?.type !== "image-urls") {
      return;
    }

    void deliverImagesToViewer(normalizeAndDedupeUrls(message.payload ?? []));
  },
);

// viewer タブを閉じたら参照を外す（F5 では発火しない）
chrome.tabs.onRemoved.addListener((tabId) => {
  void unregisterViewerTab(tabId);
});
