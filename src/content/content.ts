import { getLargestFromSrcset } from "./extractors/srcset";

// Chrome API の型を使うために @types/chrome が必要
// npm install --save-dev @types/chrome

function extractImages(): void {
  // ページ内のすべての <img> 要素を取得
  const imgs: HTMLImageElement[] = Array.from(document.querySelectorAll("img"));
  const srcList: string[] = [];

  imgs.forEach((img) => {
    const srcset: string | null = img.getAttribute("srcset");
    let bestSrc: string | null = null;

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
declare global {
  interface Window {
    extractImages: () => void;
  }
}

window.extractImages = extractImages;

// function未登録時の自動実行
extractImages();
