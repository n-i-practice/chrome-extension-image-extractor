// 末尾に「?script」を付けて content.js をインポートします
// これにより、Viteが開発/本番に合わせて自動的に「正しい出力パス」を文字列として返してくれます
import contentScriptPath from "../content/content.js?script";

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
  const hasFunction = checks?.[0]?.result;

  if (hasFunction) {
    // content.js がすでにタブに注入されている場合は、直接関数を呼び出す
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.extractImages(),
    });
  } else {
    // content.js をタブに注入して実行}
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [contentScriptPath],
    });
  }
});

// content.js からのメッセージ受信（抽出した画像URL一覧）
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "image-urls") {
    console.log("Received image URLs:", message.payload);

    // 画像一覧を session storage に保存（viewer が読み取る）
    chrome.storage.session.set({ images: message.payload }).then(() => {
      console.log("saved to session");

      // viewer.html を新しいタブで開く
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/viewer/viewer.html"),
        active: true,
      });
    });
  }
});
