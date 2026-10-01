/**
 * 第4段階: 取得・保存・配信・画像読み込みの失敗と通知の回帰テスト。
 * API の失敗はテスト側で注入し、公開イベントと保存結果・画面を確認する。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBackgroundHarness } = require("./helpers/background-harness.cjs");
const { createViewerHarness, IMAGES } = require("./helpers/viewer-harness.cjs");
const urls = IMAGES.map(image => image.src);
const idOf = tab => new URL(tab.url).searchParams.get("id");
const hidden = el => el.classList.contains("hidden");
const FALLBACK = { truncated: false, originalCount: 3, delivery: "fallback" };
const LOAD_ERROR = "Could not load the image list. Please extract images again from the original page.";

async function extract(h, images = urls) {
  h.extract(images);
  await h.settle();
  return h.created().at(-1);
}
async function language(h, value) {
  h.el("locale-select").value = value;
  h.el("locale-select").dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await h.settle();
}

for (const [name, options, fault] of [
  ["対象タブなし", { activeTab: false }],
  ["タブ取得失敗", {}, "tabs.query"],
  ["注入可否の確認失敗", {}, "script.check"],
  ["初回の注入失敗", {}, "script.extract"],
  ["注入済みページでの実行失敗", { hasExtractor: true }, "script.extract"],
]) {
  test(name + " ではエラー Viewer を開き、画像セッションを作らない", async () => {
    const h = createBackgroundHarness(options);
    if (fault) h.failNext(fault);
    h.clickAction();
    await h.settle();
    assert.equal(h.created().length, 1);
    const url = new URL(h.created()[0].url);
    assert.equal(url.pathname, "/viewer/viewer.html");
    assert.equal(url.searchParams.get("error"), "extract");
    assert.equal(url.searchParams.has("id"), false);
    assert.deepEqual(h.snapshot(), {});
  });
}

test("エラー Viewer も作成できない場合は記録して終わり、次回操作を妨げない", async () => {
  const h = createBackgroundHarness();
  h.failNext("script.check");
  h.failNext("tabs.create");
  h.clickAction();
  await h.settle();
  assert.equal(h.created().length, 0);
  assert.ok(h.errors().some(message => message.includes("Failed to open error viewer")));
  h.failNext("script.check");
  h.clickAction();
  await h.settle();
  assert.equal(h.created().length, 1);
});

test("抽出エラー画面は保存データを読まず、日本語への切り替えにも対応する", async t => {
  const h = await createViewerHarness(t, { search: "?error=extract" });
  assert.equal(h.el("info").textContent, "Could not extract images from this page.");
  assert.equal(h.cards.length, 0);
  assert.equal(h.sessionReads(), 0);
  assert.equal(h.sent.length, 0);
  await language(h, "ja");
  assert.equal(h.el("info").textContent, "このページから画像を抽出できませんでした。");
});

for (const count of [1500, 1501]) {
  test(count + " 件の保存で上限と元件数を正しく通知する", async () => {
    const h = createBackgroundHarness();
    const images = Array.from({ length: count }, (_, i) => "https://example.test/" + i + ".png");
    const tab = await extract(h, images);
    const id = idOf(tab);
    assert.deepEqual(h.snapshot()["images:" + id], images.slice(0, 1500));
    assert.deepEqual(h.snapshot()["imagesNotice:" + id], {
      truncated: count > 1500, originalCount: count, delivery: "session",
    });
    h.closeTabs([tab.id]);
    await h.settle();
    assert.deepEqual(h.snapshot(), {});
  });
}

test("画像保存に失敗したら該当 Viewer の起動後だけ一度配信し、通知も表示する", async t => {
  const h = createBackgroundHarness();
  h.failNext("images.save");
  const tab = await extract(h);
  const id = idOf(tab);
  assert.equal(new URL(tab.url).searchParams.get("delivery"), "fallback");
  assert.equal(h.snapshot()["images:" + id], undefined);
  assert.deepEqual(h.sent(), []);
  h.viewerOpened(tab);
  await h.settle();
  const delivery = h.sent()[0];
  assert.equal(delivery.tabId, tab.id);
  assert.deepEqual(delivery.message, { type: "fallback-images", sessionId: id, images: urls, notice: FALLBACK });
  h.viewerOpened(tab);
  await h.settle();
  assert.equal(h.sent().length, 1);

  // background が実際に生成したペイロードを、別起動した Viewer へ渡す。
  const v = await createViewerHarness(t, {
    search: "?id=" + id + "&delivery=fallback",
    onOpened: send => send(delivery.message),
  });
  assert.equal(v.cards.length, 3);
  assert.equal(v.sessionReads(), 0);
  assert.equal(v.el("notices").hidden, false);
  assert.match(v.el("notices").textContent, /sent temporarily/);
  assert.equal(v.listenerCount(), 0);
  assert.equal(v.timerCount(), 0);
  await language(v, "ja");
  assert.match(v.el("notices").textContent, /一時的に一覧を受け渡しました/);
  h.closeTabs([tab.id]);
  await h.settle();
  assert.deepEqual(h.snapshot(), {});
});

test("上限超過と保存失敗が重なっても、配信は1500件で両方の通知を持つ", async () => {
  const h = createBackgroundHarness();
  h.failNext("images.save");
  const images = Array.from({ length: 1501 }, (_, i) => "https://example.test/" + i + ".png");
  const tab = await extract(h, images);
  h.viewerOpened(tab);
  await h.settle();
  assert.deepEqual(h.sent()[0].message.images, images.slice(0, 1500));
  assert.deepEqual(h.sent()[0].message.notice, {
    truncated: true, originalCount: 1501, delivery: "fallback",
  });
});

test("保存失敗の同時セッションでも配信先・画像を取り違えない", async () => {
  const h = createBackgroundHarness();
  h.failNext("images.save");
  const a = await extract(h, [urls[0]]);
  h.failNext("images.save");
  const b = await extract(h, [urls[1]]);
  h.viewerOpened(b);
  h.viewerOpened(a);
  await h.settle();
  assert.equal(h.sent().length, 2);
  assert.deepEqual(h.sent().find(item => item.tabId === a.id).message.images, [urls[0]]);
  assert.deepEqual(h.sent().find(item => item.tabId === b.id).message.images, [urls[1]]);
});

for (const saveFails of [false, true]) {
  test((saveFails ? "fallback" : "session") + " の Viewer 作成失敗ではデータを片付け、後続の抽出が動く", async () => {
    const h = createBackgroundHarness();
    const survivor = await extract(h, [urls[0]]);
    const survivorData = h.snapshot();
    if (saveFails) h.failNext("images.save");
    h.failNext("tabs.create");
    await extract(h);
    assert.deepEqual(h.snapshot(), survivorData);
    assert.ok(h.errors().some(message => message.includes("Failed to deliver images")));
    assert.equal(new URL(h.created()[1].url).searchParams.get("error"), "extract");
    const next = await extract(h);
    assert.deepEqual(h.snapshot()["images:" + idOf(next)], urls);
    h.closeTabs([next.id]);
    await h.settle();
    assert.deepEqual(h.snapshot(), survivorData);
    h.closeTabs([survivor.id]);
    await h.settle();
    assert.deepEqual(h.snapshot(), {});
  });
}

test("fallback の送信先が消えても未処理例外にせず、後続の抽出を処理する", async () => {
  const h = createBackgroundHarness();
  h.failNext("images.save");
  const tab = await extract(h);
  h.failNext("tabs.sendMessage");
  h.viewerOpened(tab);
  await h.settle();
  assert.ok(h.errors().some(message => message.includes("Failed to register or deliver")));
  h.closeTabs([tab.id]);
  await h.settle();
  assert.deepEqual(h.snapshot(), {});
  const next = await extract(h);
  assert.deepEqual(h.snapshot()["images:" + idOf(next)], urls);
});

test("別セッション・別種別の配信は無視し、正しい配信で待機を解除する", async t => {
  const h = await createViewerHarness(t, {
    search: "?id=test-session&delivery=fallback", pendingFallback: true,
  });
  h.message({ type: "fallback-images", sessionId: "other", images: urls });
  h.message({ type: "unrelated", sessionId: "test-session", images: urls });
  await h.settle();
  assert.equal(h.cards.length, 0);
  assert.equal(h.listenerCount(), 1);
  h.message({ type: "fallback-images", sessionId: "test-session", images: urls, notice: FALLBACK });
  await h.settle();
  assert.equal(h.cards.length, 3);
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.timerCount(), 0);
});

test("fallback が届かない場合はエラーを表示し、遅れた配信を取り込まない", async t => {
  const h = await createViewerHarness(t, {
    search: "?id=test-session&delivery=fallback", pendingFallback: true,
  });
  await h.expireFallback();
  assert.equal(h.el("info").textContent, LOAD_ERROR);
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.timerCount(), 0);
  h.message({ type: "fallback-images", sessionId: "test-session", images: urls });
  await h.settle();
  assert.equal(h.cards.length, 0);
});

test("session 読み出し失敗はエラーを表示し、言語変更後も維持する", async t => {
  const h = await createViewerHarness(t, { sessionReadFails: true });
  assert.equal(h.el("info").textContent, LOAD_ERROR);
  assert.equal(h.cards.length, 0);
  await language(h, "ja");
  assert.equal(h.el("info").textContent, "画像一覧を読み込めませんでした。元のページからもう一度画像を抽出してください。");
});

test("fallback と上限の通知は両方表示し、通常・不正な通知では表示しない", async t => {
  const h = await createViewerHarness(t, {
    notice: { truncated: true, originalCount: 1501, delivery: "fallback" },
  });
  assert.equal(h.el("notices").querySelectorAll(".notice").length, 2);
  assert.match(h.el("notices").textContent, /first 1500 of 1501/);
  await language(h, "ja");
  assert.match(h.el("notices").textContent, /1501 件中の先頭 1500 件/);
  for (const notice of [undefined, { ...FALLBACK, delivery: "session" }, { truncated: "yes" }]) {
    const normal = await createViewerHarness(t, { notice });
    assert.equal(normal.el("notices").hidden, true);
    assert.equal(normal.el("notices").children.length, 0);
  }
});

test("サムネ読み込み失敗でカード・表示件数を更新し、前後移動からも除く", async t => {
  const h = await createViewerHarness(t);
  h.failThumbnail(1);
  assert.equal(h.cards.length, 2);
  assert.equal(h.el("visible-count").textContent, "Showing: 2 images");
  h.open(0);
  h.key("ArrowRight");
  assert.equal(h.img.getAttribute("src"), urls[2]);
  assert.ok(hidden(h.el("next-btn")));
});

test("現在画像の読み込みが失敗したら閉じ、最後の失敗でも0件に更新する", async t => {
  const h = await createViewerHarness(t);
  h.open(1);
  h.failThumbnail(1);
  assert.ok(hidden(h.el("modal")));
  assert.equal(h.img.getAttribute("src"), null);
  assert.equal(h.document.querySelector("main").hasAttribute("inert"), false);
  h.failThumbnail(0);
  h.failThumbnail(0);
  assert.equal(h.el("visible-count").textContent, "Showing: 0 images");
});

test("後から失敗したサムネがあっても、残った現在画像とナビ位置を保持する", async t => {
  const h = await createViewerHarness(t);
  h.open(1);
  h.failThumbnail(0);
  assert.equal(h.img.getAttribute("src"), urls[1]);
  assert.ok(hidden(h.el("prev-btn")));
  h.key("ArrowRight");
  assert.equal(h.img.getAttribute("src"), urls[2]);
});

test("モーダル画像の失敗でも次の画像への移動と Escape が使える", async t => {
  const h = await createViewerHarness(t);
  h.open(0, { load: false });
  h.failModal();
  assert.equal(h.img.style.visibility, "visible");
  assert.ok(hidden(h.el("zoom-btn")));
  h.key("ArrowRight");
  h.loadModal();
  assert.equal(h.img.getAttribute("src"), urls[1]);
  assert.equal(h.img.style.visibility, "visible");
  h.key("Escape");
  assert.ok(hidden(h.el("modal")));
});


test("一覧とエラー画面の作成が両方失敗しても、保存データを残さない", async () => {
  const h = createBackgroundHarness();
  h.failNext("tabs.create");
  h.failNext("tabs.create");
  await extract(h);
  assert.deepEqual(h.snapshot(), {});
  assert.equal(h.created().length, 0);
  assert.ok(h.errors().some(message => message.includes("Failed to open error viewer")));
});

test("空配列の fallback 配信は成功した0件として扱い、タイムアウトと区別する", async t => {
  const h = await createViewerHarness(t, {
    images: [], search: "?id=test-session&delivery=fallback",
    onOpened: send => send({
      type: "fallback-images", sessionId: "test-session", images: [],
      notice: { ...FALLBACK, originalCount: 0 },
    }),
  });
  assert.equal(h.el("info").textContent, "No images found");
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.timerCount(), 0);
  assert.equal(h.el("notices").hidden, false);
});


for (const delivery of ["session", "fallback"]) {
  for (const fault of ["viewerRefs.get", "viewerRefs.save"]) {
    test(delivery + " の登録だけが " + fault + " で失敗してもエラータブを増やさない", async () => {
      const h = createBackgroundHarness();
      if (delivery === "fallback") h.failNext("images.save");
      h.failNext(fault);
      await extract(h);
      assert.equal(h.created().length, 1, "一覧タブ作成後の登録失敗ではエラー画面を追加しない");
      const tab = h.created()[0];
      const id = idOf(tab);
      assert.ok(id);
      assert.equal(new URL(tab.url).searchParams.has("error"), false);
      assert.ok(h.errors().some(message => message.includes("Failed to deliver images")));
      if (delivery === "session") assert.deepEqual(h.snapshot()["images:" + id], urls);
      else assert.deepEqual(h.sent(), []);

      // 初回登録の一時的な失敗から、Viewer の起動通知で回復できることも確認する。
      h.viewerOpened(tab);
      await h.settle();
      assert.equal(h.created().length, 1);
      assert.deepEqual(h.snapshot()["viewerRefs:" + id], [tab.id]);
      assert.equal(h.snapshot()["viewerTab:" + tab.id], id);
      if (delivery === "fallback") {
        assert.equal(h.sent()[0].tabId, tab.id);
        assert.deepEqual(h.sent()[0].message.images, urls);
      }
      h.closeTabs([tab.id]);
      await h.settle();
      assert.deepEqual(h.snapshot(), {});
      const next = await extract(h);
      assert.deepEqual(h.snapshot()["images:" + idOf(next)], urls);
    });
  }
}
