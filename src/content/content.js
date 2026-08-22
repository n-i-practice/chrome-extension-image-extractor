(() => {
  // ページ内のすべての <img> 要素を取得
  const imgs = Array.from(document.querySelectorAll("img"));

  // 各画像の src を抽出して一覧化
  const srcList = imgs.map((img) => img.src);

  // 抽出した画像URL一覧を background.js に送信
  chrome.runtime.sendMessage({
    type: "image-urls",
    payload: srcList,
  });
})();
