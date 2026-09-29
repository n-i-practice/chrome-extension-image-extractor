/**
 * srcset から最大解像度の画像 URL を抽出する
 * - w descriptor: 480w, 800w → 数値が大きいもの
 * - x descriptor: 1x, 2x → 倍率が大きいもの
 * - descriptor がない場合 → 先頭の URL
 * - 相対パスは必ず絶対 URL に変換する
 */

export function getLargestFromSrcset(srcset: string): string | null {
  if (!srcset) {
    return null;
  }

  const items: string[] = srcset.split(",");
  const candidates: { url: string; value: number }[] = [];

  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const rawUrl = parts[0];
    const descriptor = parts[1];

    // 相対パス → 絶対 URL に変換
    let url: string;
    try {
      url = new URL(rawUrl, location.href).href;
    } catch {
      // URL が壊れている場合はスキップ
      continue;
    }

    // descriptor がない場合は先頭 URL を採用（仕様どおり）
    if (!descriptor) {
      return url;
    }

    let value: number | null = null;

    if (descriptor.endsWith("w")) {
      const num = parseInt(descriptor.slice(0, -1), 10);
      if (!Number.isNaN(num)) {
        value = num;
      }
    } else if (descriptor.endsWith("x")) {
      const num = parseFloat(descriptor.slice(0, -1));
      if (!Number.isNaN(num)) {
        // w と比較するため、基準幅 100 CSS px を仮定してスケール（Nx ≈ N*100w）
        value = num * 100;
      }
    }

    if (value !== null) {
      candidates.push({ url, value });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.value - a.value);

  return candidates[0].url;
}
