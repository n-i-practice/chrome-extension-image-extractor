/**
 * 実際の viewer HTML と TypeScript を jsdom 上で起動する。
 * DOM・イベント伝播は jsdom、Chrome API と画像の読み込み・寸法はテストで制御する。
 * CSS レイアウトやブラウザー自身のキー操作は再現せず、実機確認に分ける。
 */
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { JSDOM, VirtualConsole } = require("jsdom");
const { buildSync } = require("esbuild");

const html = readFileSync(path.resolve(__dirname, "../../src/viewer/viewer.html"), "utf8");
const code = buildSync({
  entryPoints: [path.resolve(__dirname, "../../src/viewer/viewer.ts")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
}).outputFiles[0].text;

const IMAGES = [
  { src: "https://example.test/large-a.png", width: 1600, height: 1200 },
  { src: "https://example.test/large-b.png", width: 1800, height: 1400 },
  { src: "https://example.test/small.png", width: 600, height: 500 },
];

async function createViewerHarness(t, {
  images = IMAGES, cached = false, autoLoad = true,
  search = "?id=test-session", notice, sessionReadFails = false,
  onOpened, pendingFallback = false,
} = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => errors.push(error));
  const dom = new JSDOM(html, {
    url: "https://extension.test/viewer/viewer.html" + search,
    runScripts: "outside-only",
    virtualConsole,
  });
  const { window } = dom;
  const { document } = window;
  t.after(() => {
    window.close();
    // イベント内の例外が jsdom に吸収されても、テストは失敗させる。
    if (errors.length) throw new AggregateError(errors, "Viewer の DOM イベント処理で例外");
  });
  window.innerWidth = 1000;
  window.innerHeight = 800;
  const localStorage = { locale: "en" };
  const listeners = new Set();
  const timers = new Map();
  let timerId = 0;
  const sent = [];
  let sessionReads = 0;
  const message = payload => { for (const listener of [...listeners]) listener(payload); };
  // fallback の8秒待ちは仮想タイマーで進め、実時間に依存させない。
  window.setTimeout = (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.chrome = {
    storage: {
      local: {
        async get() { return { ...localStorage }; },
        async set(values) { Object.assign(localStorage, values); },
      },
      session: {
        async get() {
          sessionReads++;
          if (sessionReadFails) throw new Error("Simulated session read failure");
          return {
            "images:test-session": images.map(image => image.src),
            "imagesNotice:test-session": notice,
          };
        },
      },
    },
    runtime: {
      onMessage: {
        addListener: listener => listeners.add(listener),
        removeListener: listener => listeners.delete(listener),
      },
      async sendMessage(payload) {
        sent.push(payload);
        if (onOpened) onOpened(message);
      },
    },
  };

  // src を変えた直後は未読込に戻し、明示的な load までは自然サイズを返さない。
  const loaded = new WeakMap();
  function imageSize(img) {
    const src = img.getAttribute("src");
    if (!cached && loaded.get(img) !== src) return null;
    return images.find(image => image.src === src) ?? null;
  }
  Object.defineProperties(window.HTMLImageElement.prototype, {
    naturalWidth: { configurable: true, get() { return imageSize(this)?.width ?? 0; } },
    naturalHeight: { configurable: true, get() { return imageSize(this)?.height ?? 0; } },
    complete: { configurable: true, get() { return imageSize(this) !== null; } },
  });
  function loadImage(img) {
    loaded.set(img, img.getAttribute("src"));
    img.dispatchEvent(new window.Event("load"));
  }

  window.eval(code);
  // init の非同期 storage 読み出しと、その後のカード生成まで待つ。
  await nextTurn();
  const getCards = () => [...document.querySelectorAll("#grid .item")];
  const cards = getCards();
  const expectedCount = pendingFallback || search.includes("error=") || sessionReadFails ? 0 : images.length;
  if (cards.length !== expectedCount) throw new Error("Viewer の初期化が完了しなかった");
  // 読み込み順序によるフィルター・モーダル同期を検証する場合は手動で load する。
  if (autoLoad) for (const card of cards) loadImage(card.querySelector("img"));

  const el = id => document.getElementById(id);
  const img = el("modal-img");
  // jsdom にレイアウトはないため、原寸画像の実寸と inline の位置だけを補う。
  Object.defineProperties(img, {
    offsetWidth: { get: () => img.naturalWidth },
    offsetHeight: { get: () => img.naturalHeight },
  });
  img.getBoundingClientRect = () => ({
    left: Number.parseFloat(img.style.left) || 0,
    top: Number.parseFloat(img.style.top) || 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
  });

  function mouse(target, type, options = {}) {
    const event = new window.MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100, ...options,
    });
    target.dispatchEvent(event);
    return event;
  }
  return {
    window, document, get cards() { return getCards(); }, img, el, mouse,
    message, sent, sessionReads: () => sessionReads,
    listenerCount: () => listeners.size,
    timerCount: () => timers.size,
    async expireFallback() {
      for (const [id, timer] of timers) {
        if (timer.ms !== 8000) throw new Error("Unexpected timer duration");
        timers.delete(id);
        timer.callback();
      }
      await nextTurn();
    },
    async settle() { await nextTurn(); },
    failThumbnail(index) {
      const thumbnail = getCards()[index].querySelector("img");
      loaded.delete(thumbnail);
      thumbnail.dispatchEvent(new window.Event("error"));
    },
    failModal() {
      loaded.delete(img);
      img.dispatchEvent(new window.Event("error"));
    },
    loadModal: () => loadImage(img),
    loadThumbnail: index => loadImage(getCards()[index].querySelector("img")),
    open(index = 0, { load = true } = {}) {
      getCards()[index].querySelector(".thumb").click();
      if (load) loadImage(img);
    },
    key(key, options = {}, target = document.activeElement) {
      const event = new window.KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, key, ...options,
      });
      target.dispatchEvent(event);
      return event;
    },
    imageClick() {
      mouse(img, "mousedown");
      mouse(document, "mouseup");
      mouse(img, "click");
    },
    drag(dx, dy) {
      mouse(img, "mousedown");
      mouse(document, "mousemove", { clientX: 100 + dx, clientY: 100 + dy });
      mouse(document, "mouseup", { clientX: 100 + dx, clientY: 100 + dy });
      // mouseup 後に発生する click まで含め、誤った表示切替を検出する。
      mouse(img, "click", { clientX: 100 + dx, clientY: 100 + dy });
    },
  };
}

module.exports = { createViewerHarness, IMAGES };
