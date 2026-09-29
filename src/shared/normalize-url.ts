/**
 * 画像 URL の正規化と重複除外（仕様: docs/SPECIFICATION.md）
 *
 * 正規化ルール:
 * - 相対パス → new URL(path, base) で絶対化
 * - http / https は別物
 * - クエリ（?v=123）は別物
 * - blob: / data: は trim 後の文字列一致
 *
 * 重複除外: 正規化後の文字列が完全一致したものは 1 件にまとめる
 */

/**
 * 1 件の URL を正規化する。無効・空なら null。
 * @param baseHref content script では location.href を渡す。絶対 URL のみなら省略可。
 */
export function normalizeImageUrl(
  raw: string | null | undefined,
  baseHref?: string,
): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // blob / data は URL パースで崩れることがあるため、文字列のまま扱う
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  try {
    return baseHref
      ? new URL(trimmed, baseHref).href
      : new URL(trimmed).href;
  } catch {
    return null;
  }
}

/**
 * 正規化済み URL 列から、出現順を保ったまま重複を除く。
 */
export function dedupeUrls(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    result.push(url);
  }

  return result;
}

/**
 * 生 URL 列を正規化し、無効値を除いたうえで重複除外する。
 */
export function normalizeAndDedupeUrls(
  urls: Iterable<string | null | undefined>,
  baseHref?: string,
): string[] {
  const normalized: string[] = [];

  for (const raw of urls) {
    const url = normalizeImageUrl(raw, baseHref);
    if (url) {
      normalized.push(url);
    }
  }

  return dedupeUrls(normalized);
}
