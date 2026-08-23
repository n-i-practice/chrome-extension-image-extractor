import { getLargestFromSrcset } from "./extractors/srcset.js";

function extractImages() {
  // ページ内のすべての <img> 要素を取得
  const imgs = Array.from(document.querySelectorAll("img"));
  const srcList = [];

  imgs.forEach((img) => {
    const srcset = img.getAttribute("srcset");
    let bestSrc = null;

    if (srcset) {
      bestSrc = getLargestFromSrcset(srcset);
    }

    if (bestSrc) {
      srcList.push(bestSrc);
    } else if (img.currentSrc) {
      srcList.push(img.currentSrc);
    } else if (img.src) {
      srcList.push(img.src);
    }
  });

  // 抽出した画像URL一覧を background.js に送信
  chrome.runtime.sendMessage({
    type: "image-urls",
    payload: srcList,
  });
}

// background から呼び出せるように window に登録
window.extractImages = extractImages;

// function未登録時の自動実行
extractImages();
