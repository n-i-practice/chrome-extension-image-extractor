/**
 * 実際の background を独立した VM で起動する Chrome API のテスト用実装。
 * storage は値を複製し、各 API を非同期にすることで参照共有や同期実行による
 * 偽の成功を避ける。検証は公開イベントと保存結果に対して行う。
 */
const vm = require("node:vm");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { buildSync } = require("esbuild");

const backgroundCode = buildSync({
  entryPoints: [path.resolve(__dirname, "../../src/background/background.ts")],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "browser",
  target: "es2022",
}).outputFiles[0].text;

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      for (const listener of listeners) listener(...args);
    },
  };
}

function createBackgroundHarness({ closeDuringCreate = false } = {}) {
  const storage = {};
  const tabs = new Map();
  const createdTabs = [];
  let nextTabId = 1;
  let pendingCalls = 0;
  let completedCalls = 0;
  let events;

  // API ごとにイベントループを進め、get と set の間で別イベントが動けるようにする。
  async function apiCall(operation) {
    pendingCalls++;
    try {
      await nextTurn();
      return await operation();
    } finally {
      pendingCalls--;
      completedCalls++;
    }
  }

  function closeTabs(ids) {
    for (const id of ids) {
      tabs.delete(id);
      events.removed.emit(id, { isWindowClosing: ids.length > 1 });
    }
  }

  function startWorker() {
    events = {
      clicked: createEvent(),
      message: createEvent(),
      removed: createEvent(),
    };
    const chrome = {
      action: { onClicked: events.clicked },
      runtime: {
        onMessage: events.message,
        getURL: (file) => "chrome-extension://test-extension/" + file,
      },
      storage: {
        session: {
          get: (keys) => apiCall(() => {
            if (keys == null) return structuredClone(storage);
            const result = {};
            for (const key of typeof keys === "string" ? [keys] : keys) {
              if (Object.hasOwn(storage, key)) result[key] = storage[key];
            }
            return structuredClone(result);
          }),
          set: (values) => {
            const copy = structuredClone(values);
            return apiCall(() => { Object.assign(storage, copy); });
          },
          remove: (keys) => apiCall(() => {
            for (const key of typeof keys === "string" ? [keys] : keys) {
              delete storage[key];
            }
          }),
        },
      },
      tabs: {
        onRemoved: events.removed,
        create: (options) => apiCall(async () => {
          const tab = { id: nextTabId++, ...structuredClone(options) };
          tabs.set(tab.id, tab);
          createdTabs.push(tab);
          if (closeDuringCreate) {
            closeTabs([tab.id]);
            // 対応表の登録より先に onRemoved が実行される順序を作る。
            await nextTurn();
          }
          return structuredClone(tab);
        }),
        get: (id) => apiCall(() => {
          if (!tabs.has(id)) throw new Error("No tab with id: " + id);
          return structuredClone(tabs.get(id));
        }),
        sendMessage: () => {
          throw new Error("Unexpected fallback delivery in session-management tests");
        },
      },
    };

    vm.runInNewContext(backgroundCode, {
      module: { exports: {} },
      chrome,
      URL,
      crypto: { randomUUID },
      console: { log() {}, warn() {}, error() {} },
    });
  }

  /**
   * 未完了の API と、その結果から続くマイクロタスクが落ち着くまで待つ。
   * 固定ミリ秒の sleep は使わない。待機上限に達したらテストを失敗させる。
   */
  async function settle() {
    for (let turn = 0; turn < 200; turn++) {
      const previous = completedCalls;
      await nextTurn();
      if (pendingCalls !== 0 || previous !== completedCalls) continue;
      await nextTurn();
      if (pendingCalls === 0 && previous === completedCalls) return;
    }
    throw new Error("Background did not settle within 200 event-loop turns");
  }

  startWorker();
  return {
    settle,
    closeTabs,
    snapshot: () => structuredClone(storage),
    created: () => structuredClone(createdTabs),
    extract(images) {
      events.message.emit({ type: "image-urls", payload: images }, {});
    },
    viewerOpened(tab) {
      const sessionId = new URL(tab.url).searchParams.get("id");
      events.message.emit({ type: "viewer-opened", sessionId }, { tab });
    },
    duplicate(tab) {
      const duplicate = { ...tab, id: nextTabId++ };
      tabs.set(duplicate.id, duplicate);
      return structuredClone(duplicate);
    },
    // Chrome の通常タブが閉じても、セッションを変更しないことを検証する。
    closeUnrelatedTab() {
      closeTabs([nextTabId++]);
    },
    async restartWorker() {
      await settle();
      startWorker();
    },
  };
}

module.exports = { createBackgroundHarness };
