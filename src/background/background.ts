import { normalizeAndDedupeUrls } from "../shared/normalize-url";
import {
  imagesSessionKey,
  viewerTabSessionKey,
} from "../shared/session-keys";

// Chrome API の型を使うために @types/chrome が必要
// npm install --save-dev @types/chrome

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

// content.js からのメッセージ受信（抽出した画像URL一覧）
chrome.runtime.onMessage.addListener(
  (message: { type?: string; payload?: string[] }) => {
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

      // SW 再起動後も掃除できるよう、対応表も session に残す
      if (tab.id != null) {
        await chrome.storage.session.set({
          [viewerTabSessionKey(tab.id)]: id,
        });
      }
    })();
  },
);

// viewer タブを閉じたら、その一覧だけ session から削除する（F5 では発火しない）
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const tabKey = viewerTabSessionKey(tabId);
    const result = await chrome.storage.session.get(tabKey);
    const id = result[tabKey];
    if (typeof id !== "string" || !id) {
      return;
    }

    await chrome.storage.session.remove([tabKey, imagesSessionKey(id)]);
    console.log("Removed session images for closed viewer tab:", tabId, id);
  })();
});
