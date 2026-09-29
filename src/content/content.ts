import { extractBackgroundImages } from "./extractors/background-image";
import { getLargestFromSrcset } from "./extractors/srcset";
import { normalizeImageUrl } from "../shared/normalize-url";

// Chrome API の型を使うために @types/chrome が必要
// npm install --save-dev @types/chrome

function extractImages(): void {
  // 抽出した画像 URL の一覧（background に送る）
  const srcList: string[] = [];
  // 正規化後の URL を記録し、重複追加を防ぐ
  const seen = new Set<string>();

  // URL を正規化し、空・無効・既追加ならスキップする
  const addUrl = (url: string | null | undefined): void => {
    const normalized = normalizeImageUrl(url, location.href);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    srcList.push(normalized);
  };

  // ページ内のすべての <img> 要素を取得
  const imgs: HTMLImageElement[] = Array.from(document.querySelectorAll("img"));

  imgs.forEach((img) => {
    const srcset: string | null = img.getAttribute("srcset");
    let bestSrc: string | null = null;

    if (srcset) {
      bestSrc = getLargestFromSrcset(srcset);
    }

    if (bestSrc) {
      addUrl(bestSrc);
    } else if (img.currentSrc) {
      addUrl(img.currentSrc);
    } else if (img.src) {
      addUrl(img.src);
    }
  });

  // CSS background-image（要素 / ::before / ::after）
  for (const url of extractBackgroundImages()) {
    addUrl(url);
  }

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
