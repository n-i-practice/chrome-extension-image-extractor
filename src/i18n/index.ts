/**
 * viewer 向けの辞書ベース i18n。
 *
 * - 対応: en / ja（未対応言語は en）
 * - locale 決定: chrome.storage.local → navigator.language → en
 * - 静的文言: data-i18n / data-i18n-attr + applyStaticI18n()
 * - 動的文言: t(key, params?)
 *
 * 使い方（viewer 初期化時）:
 *   await resolveLocale();
 *   applyStaticI18n();
 *   // 以降 t("status.imageCount", { count: n }) など
 */
import { en } from "./en";
import { ja } from "./ja";
import type { Locale, MessageKey, MessageParams, Messages } from "./types";

export type { Locale, MessageKey, MessageParams, Messages };
export { en, ja };

/** chrome.storage.local に保存するキー名 */
const STORAGE_KEY = "locale";

/** 未対応言語・未設定時のフォールバック（英語優先） */
const DEFAULT_LOCALE: Locale = "en";

const dictionaries: Record<Locale, Messages> = { en, ja };

/** 現在有効な locale。resolveLocale / setLocale で更新する */
let currentLocale: Locale = DEFAULT_LOCALE;

/** 現在の locale を返す（resolveLocale 前は DEFAULT_LOCALE） */
export function getLocale(): Locale {
  return currentLocale;
}

/** 値が対応 locale（en | ja）かどうか */
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}

/**
 * BCP 47 言語タグなどを en / ja に正規化する。
 * 例: "ja-JP" → "ja", "en-US" → "en", "fr" → "en"（未対応）
 */
export function normalizeLocale(raw: string | null | undefined): Locale {
  if (!raw) {
    return DEFAULT_LOCALE;
  }
  const base = raw.toLowerCase().split("-")[0];
  if (base === "ja") {
    return "ja";
  }
  if (base === "en") {
    return "en";
  }
  return DEFAULT_LOCALE;
}

/**
 * 起動時に呼ぶ。locale を次の優先順で決めて currentLocale に反映する。
 * 1. chrome.storage.local の保存値（ユーザーが言語切替した場合）
 * 2. navigator.language（ブラウザ言語）
 * 3. en（フォールバック）
 *
 * 呼び出し後、getLocale() / t() / applyStaticI18n() はこの結果を使う。
 */
export async function resolveLocale(): Promise<Locale> {
  const stored = await readStoredLocale();
  if (stored) {
    currentLocale = stored;
    return currentLocale;
  }

  currentLocale = normalizeLocale(navigator.language);
  return currentLocale;
}

/**
 * ユーザーが言語を切り替えたときに呼ぶ。
 * メモリ上の currentLocale を更新し、chrome.storage.local に永続化する。
 * 呼び出し後に applyStaticI18n() と動的文言の再描画が必要。
 */
export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  await chrome.storage.local.set({ [STORAGE_KEY]: locale });
}

/**
 * 辞書テンプレート内の {name} を params の値で置換する。
 * 対応するキーが無いプレースホルダはそのまま残す。
 */
function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * 現在の locale でメッセージを取得する。
 * 欠落時は en → キー文字列の順でフォールバックする。
 *
 * @example t("status.imageCount", { count: 12 })
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const dict = dictionaries[currentLocale] ?? dictionaries[DEFAULT_LOCALE];
  const fallback = dictionaries[DEFAULT_LOCALE][key];
  const template = dict[key] ?? fallback ?? key;
  return interpolate(template, params);
}

/**
 * data-i18n / data-i18n-attr を持つ要素へ翻訳を反映する。
 * - data-i18n="key" → 要素テキストを更新
 * - data-i18n-attr="aria-label|title|placeholder" がある場合は属性のみ更新（本文は触らない）
 * - 子に input がある label は、入力欄を壊さないよう先頭テキストノードのみ更新
 * - あわせて document.documentElement.lang も更新する
 */
export function applyStaticI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !isMessageKey(key)) {
      return;
    }
    const text = t(key);
    const attrList = el.getAttribute("data-i18n-attr");
    if (attrList) {
      for (const attr of attrList.split("|")) {
        const name = attr.trim();
        if (name) {
          el.setAttribute(name, text);
        }
      }
      return;
    }
    setElementText(el, text);
  });

  document.documentElement.lang = currentLocale;
}

/** en 辞書に存在するキーかどうか（不正な data-i18n を無視するため） */
function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}

/**
 * 要素の表示テキストを差し替える。
 * 子要素（例: label > input）がある場合は textContent 全体置換を避け、
 * 空白以外の先頭テキストノードだけを更新する。
 */
function setElementText(el: HTMLElement, text: string): void {
  const hasElementChild = Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE,
  );
  if (!hasElementChild) {
    el.textContent = text;
    return;
  }

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      node.textContent = text;
      return;
    }
  }

  // テキストノードが無い場合は先頭に追加する
  el.insertBefore(document.createTextNode(text), el.firstChild);
}

/**
 * chrome.storage.local から保存済み locale を読む。
 * storage 未準備・不正値のときは null（呼び出し側でブラウザ言語へ進む）。
 */
async function readStoredLocale(): Promise<Locale | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}
