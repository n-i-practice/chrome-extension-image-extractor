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

  // content.js をアクティブタブに注入して画像抽出処理を開始
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/content.js"],
  });
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
