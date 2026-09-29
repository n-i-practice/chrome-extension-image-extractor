/**
 * CSS background-image から画像 URL を抽出する（best effort）
 * - getComputedStyle で適用済みスタイルを取得
 * - ::before / ::after も対象
 * - url(...) のみ抽出（gradient 等は無視）
 * - 相対パスは絶対 URL に変換
 * - cross-origin stylesheet の未適用ルールは取得できない
 */

const URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/**
 * background-image などの CSS 値から url(...) を取り出す
 */
export function extractUrlsFromCssValue(value: string): string[] {
  if (!value || value === "none") {
    return [];
  }

  const urls: string[] = [];
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(value)) !== null) {
    const rawUrl = match[2].trim();
    if (!rawUrl) {
      continue;
    }

    try {
      urls.push(new URL(rawUrl, location.href).href);
    } catch {
      // 壊れた URL はスキップ
    }
  }

  return urls;
}

/**
 * ページ内の要素（および疑似要素）から background-image URL を収集する
 */
export function extractBackgroundImages(
  root: ParentNode = document,
): string[] {
  const elements = root.querySelectorAll("*");
  const urls: string[] = [];

  elements.forEach((el) => {
    if (!(el instanceof Element)) {
      return;
    }

    const styles = [
      getComputedStyle(el).backgroundImage,
      getComputedStyle(el, "::before").backgroundImage,
      getComputedStyle(el, "::after").backgroundImage,
    ];

    for (const bg of styles) {
      urls.push(...extractUrlsFromCssValue(bg));
    }
  });

  return urls;
}
