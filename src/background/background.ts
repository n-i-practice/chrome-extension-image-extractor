import { normalizeAndDedupeUrls } from "../shared/normalize-url";
import {
  imagesSessionKey,
  viewerRefsSessionKey,
  viewerTabSessionKey,
} from "../shared/session-keys";

// Chrome API の型を使うために @types/chrome が必要
// npm install --save-dev @types/chrome

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
    ]);
    console.log("Removed session images (last viewer closed):", tabId, id);
    return;
  }

  await chrome.storage.session.remove(tabKey);
  await chrome.storage.session.set({ [refsKey]: nextRefs });
  console.log("Detached viewer tab; session images kept:", tabId, id, nextRefs);
}

// 拡張アイコンがクリックされたときの処理
chrome.action.onClicked.addListener(async () => {
  // 現在アクティブなタブを取得
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  // タブが取得できない場合は何もしない
  if (!tab?.id) {
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
        void registerViewerTab(tabId, id);
      }
      return;
    }

    if (message?.type !== "image-urls") {
      return;
    }

    void (async () => {
      // content 側でも正規化しているが、受け取り側でも保険として再適用する
      const images = normalizeAndDedupeUrls(message.payload ?? []);
      const id = crypto.randomUUID();
      const imagesKey = imagesSessionKey(id);

      console.log("Received image URLs:", images.length, "session id:", id);

      await chrome.storage.session.set({ [imagesKey]: images });

      const viewerUrl = new URL(
        chrome.runtime.getURL("viewer/viewer.html"),
      );
      viewerUrl.searchParams.set("id", id);

      const tab = await chrome.tabs.create({
        url: viewerUrl.href,
        active: true,
      });

      if (tab.id != null) {
        await registerViewerTab(tab.id, id);
      }
    })();
  },
);

// viewer タブを閉じたら参照を外す（F5 では発火しない）
chrome.tabs.onRemoved.addListener((tabId) => {
  void unregisterViewerTab(tabId);
});
