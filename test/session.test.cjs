/**
 * 第1段階: viewer のセッション分離・参照管理の回帰テスト。
 * 内部関数は呼ばず、content/viewer メッセージと tabs.onRemoved から検証する。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBackgroundHarness } = require("./helpers/background-harness.cjs");

const IMAGE_A = "https://example.test/a.png";
const IMAGE_B = "https://example.test/b.png";
const sessionId = (tab) => new URL(tab.url).searchParams.get("id");

async function extract(harness, images = [IMAGE_A]) {
  const before = harness.created().length;
  harness.extract(images);
  await harness.settle();
  const tab = harness.created()[before];
  assert.ok(tab, "抽出結果の viewer が作成される");
  assert.ok(sessionId(tab), "viewer URL にセッション ID がある");
  return tab;
}

// キー全体を照合し、画像だけでなく通知・参照・対応表の残存も検出する。
function assertSessions(harness, sessions) {
  const expected = {};
  for (const { tab, images, refs = [tab.id] } of sessions) {
    const id = sessionId(tab);
    expected["images:" + id] = images;
    expected["imagesNotice:" + id] = {
      truncated: false,
      originalCount: images.length,
      delivery: "session",
    };
    expected["viewerRefs:" + id] = [...refs].sort((a, b) => a - b);
    for (const ref of refs) expected["viewerTab:" + ref] = id;
  }
  const actual = harness.snapshot();
  for (const [key, value] of Object.entries(actual)) {
    if (key.startsWith("viewerRefs:")) value.sort((a, b) => a - b);
  }
  assert.deepEqual(actual, expected);
}

test("同時に抽出した一覧が別のセッションに保存される", async () => {
  const h = createBackgroundHarness();
  h.extract([IMAGE_A]);
  h.extract([IMAGE_B]);
  await h.settle();
  const tabs = h.created();
  assert.equal(tabs.length, 2);
  assert.notEqual(sessionId(tabs[0]), sessionId(tabs[1]));
  const data = h.snapshot();
  const tabA = tabs.find(tab => data["images:" + sessionId(tab)][0] === IMAGE_A);
  const tabB = tabs.find(tab => data["images:" + sessionId(tab)][0] === IMAGE_B);
  assert.ok(tabA);
  assert.ok(tabB);
  assertSessions(h, [{ tab: tabA, images: [IMAGE_A] }, { tab: tabB, images: [IMAGE_B] }]);
});

test("初回起動と F5 による再登録で参照が重複しない", async () => {
  const h = createBackgroundHarness();
  const tab = await extract(h);
  h.viewerOpened(tab);
  h.viewerOpened(tab);
  await h.settle();
  assert.equal(h.created().length, 1);
  assertSessions(h, [{ tab, images: [IMAGE_A] }]);
  h.closeTabs([tab.id]);
  await h.settle();
  assertSessions(h, []);
});

test("複製元を閉じても複製先の画像・通知を保持し、最後に全キーを削除する", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  await h.settle();
  h.closeTabs([original.id]);
  await h.settle();
  h.viewerOpened(duplicate); // 残った viewer の F5 相当
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A], refs: [duplicate.id] }]);
  h.closeTabs([duplicate.id]);
  await h.settle();
  assertSessions(h, []);
});

test("複製先を先に閉じても元の viewer を保持する", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  await h.settle();
  h.closeTabs([duplicate.id]);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A] }]);
});

test("複製タブを同時登録しても参照が欠落しない", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const a = h.duplicate(original);
  const b = h.duplicate(original);
  h.viewerOpened(a);
  h.viewerOpened(b);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A], refs: [original.id, a.id, b.id] }]);
  h.closeTabs([original.id, b.id]);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A], refs: [a.id] }]);
});

test("最後の複数タブを同時終了しても参照や画像が残らない", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  await h.settle();
  h.closeTabs([original.id, duplicate.id]);
  await h.settle();
  assertSessions(h, []);
});

test("複製の登録中に元タブを閉じても新しい参照を保持する", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  h.closeTabs([original.id]);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A], refs: [duplicate.id] }]);
});

test("混在するウィンドウの終了で、別ウィンドウのセッションだけを保持する", async () => {
  const h = createBackgroundHarness();
  const a = await extract(h, [IMAGE_A]);
  const duplicateA = h.duplicate(a);
  const b = await extract(h, [IMAGE_B]);
  const duplicateB = h.duplicate(b);
  h.viewerOpened(duplicateA);
  h.viewerOpened(duplicateB);
  await h.settle();
  h.closeTabs([duplicateA.id, b.id, duplicateB.id]);
  await h.settle();
  assertSessions(h, [{ tab: a, images: [IMAGE_A] }]);
});

test("tabs.create 完了前に閉じられた viewer の保存データを掃除する", async () => {
  const h = createBackgroundHarness({ closeDuringCreate: true });
  await extract(h);
  assertSessions(h, []);
  // 内部の掃除でキューが停止していれば、後続処理のデータが残る。
  await extract(h, [IMAGE_B]);
  assertSessions(h, []);
});

test("viewer-opened の登録と同時にその複製を閉じても元タブを保持する", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  h.closeTabs([duplicate.id]);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A] }]);
  h.closeTabs([original.id]);
  await h.settle();
  assertSessions(h, []);
});

test("無関係なタブの終了と重複する終了通知では他の一覧を変更しない", async () => {
  const h = createBackgroundHarness();
  const a = await extract(h);
  const b = await extract(h, [IMAGE_B]);
  h.closeUnrelatedTab();
  await h.settle();
  assertSessions(h, [{ tab: a, images: [IMAGE_A] }, { tab: b, images: [IMAGE_B] }]);
  h.closeTabs([a.id, a.id]);
  await h.settle();
  assertSessions(h, [{ tab: b, images: [IMAGE_B] }]);
});

test("Service Worker の再起動後も保存した参照を使って保持・削除できる", async () => {
  const h = createBackgroundHarness();
  const original = await extract(h);
  const duplicate = h.duplicate(original);
  h.viewerOpened(duplicate);
  await h.restartWorker();
  h.closeTabs([original.id]);
  await h.settle();
  assertSessions(h, [{ tab: original, images: [IMAGE_A], refs: [duplicate.id] }]);
  h.closeTabs([duplicate.id]);
  await h.settle();
  assertSessions(h, []);
});
