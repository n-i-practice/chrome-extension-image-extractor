/**
 * 第3段階: サイズ・形式フィルターと件数・モーダル操作の整合性を確認する。
 * 実際の入力／変更イベントを使い、内部のフィルター関数は呼び出さない。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { createViewerHarness } = require("./helpers/viewer-harness.cjs");

// 境界ちょうど／片軸だけ不足／形式の大小文字・クエリを含める。
const IMAGES = [
  { src: "https://example.test/boundary.png", width: 400, height: 400 },
  { src: "https://example.test/narrow.png", width: 399, height: 800 },
  { src: "https://example.test/short.png", width: 800, height: 399 },
  { src: "https://example.test/vector.SVG?size=large#image", width: 1200, height: 900 },
  { src: "https://example.test/animation.GIF?v=1", width: 1200, height: 900 },
  { src: "https://example.test/large.png", width: 1600, height: 1200 },
  { src: "https://example.test/tall.png", width: 600, height: 1600 },
];
const setup = (t, options = {}) => createViewerHarness(t, { images: IMAGES, ...options });
const hidden = el => el.classList.contains("hidden");

function editSize(h, width, height) {
  for (const [id, value] of [["min-width", width], ["min-height", height]]) {
    h.el(id).value = String(value);
    h.el(id).dispatchEvent(new h.window.Event("input", { bubbles: true }));
  }
}
function applySize(h, width, height) {
  editSize(h, width, height);
  h.el("apply-size-filter").click();
}
function toggle(h, ext, checked) {
  h.el("filter-" + ext).checked = checked;
  h.el("filter-" + ext).dispatchEvent(new h.window.Event("change", { bubbles: true }));
}
function assertVisible(h, indices) {
  const cards = [...h.document.querySelectorAll("#grid .item")];
  assert.deepEqual(
    cards.filter(card => card.style.display !== "none").map(card => card.dataset.src),
    indices.map(index => IMAGES[index].src),
  );
  assert.equal(h.el("visible-count").textContent, "Showing: " + indices.length + " images");
}
function assertActive(h, width, height) {
  assert.equal(h.el("filter-info").textContent,
    "Active: width ≥ " + width + "px / height ≥ " + height + "px");
}
function assertClosed(h) {
  assert.ok(hidden(h.el("modal")));
  assert.equal(h.img.getAttribute("src"), null);
  for (const el of h.document.body.children) assert.equal(el.hasAttribute("inert"), false);
}

test("初期条件は両軸 400px 以上で、境界を含み片軸不足を除く", async t => {
  const h = await setup(t);
  assert.equal(h.el("min-width").value, "400");
  assert.equal(h.el("min-height").value, "400");
  assertActive(h, 400, 400);
  assertVisible(h, [0, 3, 4, 5, 6]);
  assert.equal(h.el("info").textContent, "7 images");
});

test("入力の編集中は一覧・件数・適用条件を変えず、適用ボタンで両軸を確定する", async t => {
  const h = await setup(t);
  editSize(h, 800, 800);
  assertVisible(h, [0, 3, 4, 5, 6]);
  assertActive(h, 400, 400);
  h.el("apply-size-filter").click();
  assertVisible(h, [3, 4, 5]);
  assertActive(h, 800, 800);
  assert.equal(h.el("info").textContent, "7 images", "元の総数はフィルターで変わらない");
});

for (const field of ["min-width", "min-height"]) {
  test(field + " の Enter で幅・高さの両方を適用する", async t => {
    const h = await setup(t);
    editSize(h, 1200, 900);
    assert.equal(h.key("Enter", {}, h.el(field)).defaultPrevented, true);
    assertVisible(h, [3, 4, 5]);
    assertActive(h, 1200, 900);
  });
}

test("クリアは入力だけを 0 に戻し、適用するまで既存条件を保持する", async t => {
  const h = await setup(t);
  applySize(h, 800, 800);
  h.el("clear-size-filter").click();
  assert.equal(h.el("min-width").value, "0");
  assert.equal(h.el("min-height").value, "0");
  assertVisible(h, [3, 4, 5]);
  assertActive(h, 800, 800);
  // 別のフィルター変更でも、入力欄の 0 を勝手に採用しない。
  toggle(h, "svg", true);
  assertVisible(h, [4, 5]);
  assertActive(h, 800, 800);
  h.el("apply-size-filter").click();
  assertVisible(h, [0, 1, 2, 4, 5, 6]);
  assertActive(h, 0, 0);
});

test("0 は該当軸の制限を解除し、もう一方の条件は残す", async t => {
  const h = await setup(t);
  applySize(h, 0, 1000);
  assertVisible(h, [5, 6]);
  applySize(h, 1000, 0);
  assertVisible(h, [3, 4, 5]);
  applySize(h, 0, 0);
  assertVisible(h, [0, 1, 2, 3, 4, 5, 6]);
});

for (const value of ["", "-1", "1.5"]) {
  test("サイズ入力 " + JSON.stringify(value) + " を適用すると 0 に補正する", async t => {
    const h = await setup(t);
    applySize(h, value, 400);
    assert.equal(h.el("min-width").value, "0");
    assertActive(h, 0, 400);
    assertVisible(h, [0, 1, 3, 4, 5, 6]);
    applySize(h, 400, value);
    assert.equal(h.el("min-height").value, "0");
    assertActive(h, 400, 0);
    assertVisible(h, [0, 2, 3, 4, 5, 6]);
  });
}

test("サイズ入力は数字・削除を許可し、不正文字や混在した貼り付けを抑止する", async t => {
  const h = await setup(t);
  for (const field of ["min-width", "min-height"]) {
    for (const [data, prevented] of [
      ["123", false], [null, false], ["e", true], ["-", true], [".", true], ["12px", true],
    ]) {
      const event = new h.window.InputEvent("beforeinput", {
        bubbles: true, cancelable: true, data,
        inputType: data === null ? "deleteContentBackward" : "insertText",
      });
      h.el(field).dispatchEvent(event);
      assert.equal(event.defaultPrevented, prevented, field + ": " + data);
    }
  }
});

test("SVG・GIF の非表示を独立して切り替え、解除すると元の順序で戻る", async t => {
  const h = await setup(t);
  toggle(h, "svg", true);
  assertVisible(h, [0, 4, 5, 6]);
  toggle(h, "gif", true);
  assertVisible(h, [0, 5, 6]);
  toggle(h, "svg", false);
  assertVisible(h, [0, 3, 5, 6]);
  toggle(h, "gif", false);
  assertVisible(h, [0, 3, 4, 5, 6]);
});

test("形式とサイズを組み合わせても、形式の解除でサイズ不足の画像を復活させない", async t => {
  const h = await setup(t);
  applySize(h, 1200, 900);
  toggle(h, "svg", true);
  toggle(h, "gif", true);
  assertVisible(h, [5]);
  toggle(h, "svg", false);
  assertVisible(h, [3, 5]);
  toggle(h, "gif", false);
  assertVisible(h, [3, 4, 5]);
});

test("0件まで絞り込んでから条件を緩めると、同じカードを再表示できる", async t => {
  const h = await setup(t);
  applySize(h, 2000, 2000);
  assertVisible(h, []);
  assert.equal(h.document.querySelectorAll("#grid .item").length, 7);
  assert.equal(h.el("info").textContent, "7 images");
  applySize(h, 400, 400);
  assertVisible(h, [0, 3, 4, 5, 6]);
  h.open(0);
  assert.equal(hidden(h.el("modal")), false);
});

test("抽出画像が空でも、サイズ・形式条件を操作できる", async t => {
  const h = await setup(t, { images: [] });
  applySize(h, 0, 0);
  toggle(h, "svg", true);
  toggle(h, "gif", true);
  assertVisible(h, []);
  assert.equal(h.el("info").textContent, "No images found");
  assertClosed(h);
});

test("非表示カードは直接クリックされてもモーダルを開かない", async t => {
  const h = await setup(t);
  toggle(h, "svg", true);
  for (const index of [1, 2, 3]) {
    h.cards[index].querySelector(".thumb").click();
    assertClosed(h);
  }
});

test("前後移動は形式・サイズで非表示になった画像を飛ばす", async t => {
  const h = await setup(t);
  toggle(h, "svg", true);
  toggle(h, "gif", true);
  h.open(0);
  assert.ok(hidden(h.el("prev-btn")));
  h.el("next-btn").click();
  assert.equal(h.img.getAttribute("src"), IMAGES[5].src);
  h.key("ArrowRight");
  assert.equal(h.img.getAttribute("src"), IMAGES[6].src);
  assert.ok(hidden(h.el("next-btn")));
  h.key("ArrowLeft");
  assert.equal(h.img.getAttribute("src"), IMAGES[5].src);
  h.el("prev-btn").click();
  assert.equal(h.img.getAttribute("src"), IMAGES[0].src);
});

test("現在画像が残る条件変更では原寸表示を保ち、前後の位置を再計算する", async t => {
  const h = await setup(t);
  h.open(5);
  h.imageClick();
  // 実画面では背景が inert。ここでは条件変更時の同期処理をイベントで検証する。
  applySize(h, 1200, 900);
  toggle(h, "svg", true);
  toggle(h, "gif", true);
  assertVisible(h, [5]);
  assert.ok(h.img.classList.contains("original"));
  assert.equal(h.img.getAttribute("src"), IMAGES[5].src);
  assert.ok(hidden(h.el("prev-btn")));
  assert.ok(hidden(h.el("next-btn")));
  toggle(h, "svg", false);
  assert.equal(hidden(h.el("prev-btn")), false);
  h.key("ArrowLeft");
  assert.equal(h.img.getAttribute("src"), IMAGES[3].src);
});

for (const mode of ["zoom", "original", "loading"]) {
  test(mode + " の現在画像が形式条件で消えたら閉じ、解除後に再表示できる", async t => {
    const h = await setup(t);
    h.open(3, { load: mode !== "loading" });
    if (mode === "original") h.imageClick();
    toggle(h, "svg", true);
    assertVisible(h, [0, 4, 5, 6]);
    assertClosed(h);
    toggle(h, "svg", false);
    h.open(3);
    assert.equal(h.img.getAttribute("src"), IMAGES[3].src);
    assert.equal(h.img.classList.contains("original"), false);
  });
}

test("サイズ変更で現在画像を除外すると閉じ、全件非表示でも操作状態が残らない", async t => {
  const h = await setup(t);
  h.open(0);
  applySize(h, 800, 800);
  assertClosed(h);
  assertVisible(h, [3, 4, 5]);
  h.open(5);
  applySize(h, 2000, 2000);
  assertClosed(h);
  assertVisible(h, []);
  assert.ok(hidden(h.el("prev-btn")));
  assert.ok(hidden(h.el("next-btn")));
});

test("遅れて読み込んだ画像にも確定済み条件を使い、未適用の入力は使わない", async t => {
  const h = await setup(t, { autoLoad: false });
  applySize(h, 800, 800);
  toggle(h, "svg", true);
  editSize(h, 0, 0);
  assertVisible(h, []);
  h.loadThumbnail(3); // 形式で除外
  h.loadThumbnail(0); // サイズで除外
  assertVisible(h, []);
  h.loadThumbnail(5);
  assertVisible(h, [5]);
  h.loadThumbnail(4);
  assertVisible(h, [4, 5]);
  assertActive(h, 800, 800);
});

test("先行するカードが遅れて表示されても、拡大中の現在画像と前後の位置を保つ", async t => {
  const h = await setup(t, { autoLoad: false });
  applySize(h, 400, 400);
  h.loadThumbnail(5);
  h.open(5);
  assert.ok(hidden(h.el("prev-btn")));
  h.loadThumbnail(3);
  h.loadThumbnail(6);
  assertVisible(h, [3, 5, 6]);
  assert.equal(h.img.getAttribute("src"), IMAGES[5].src);
  assert.equal(hidden(h.el("prev-btn")), false);
  assert.equal(hidden(h.el("next-btn")), false);
  h.key("ArrowLeft");
  assert.equal(h.img.getAttribute("src"), IMAGES[3].src);
  h.key("ArrowRight");
  h.key("ArrowRight");
  assert.equal(h.img.getAttribute("src"), IMAGES[6].src);
});

test("言語変更後も確定した条件・未適用の入力・表示件数を維持する", async t => {
  const h = await setup(t);
  applySize(h, 800, 800);
  toggle(h, "svg", true);
  editSize(h, 0, 0);
  h.el("locale-select").value = "ja";
  h.el("locale-select").dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await nextTurn();
  assert.equal(h.el("visible-count").textContent, "表示中：2件");
  assert.equal(h.el("filter-info").textContent, "適用中：横 ≥ 800px / 縦 ≥ 800px");
  assert.equal(h.el("min-width").value, "0");
  assert.equal(h.el("min-height").value, "0");
  assert.deepEqual(h.cards.filter(card => card.style.display !== "none").map(card => card.dataset.src),
    [IMAGES[4].src, IMAGES[5].src]);
  h.el("locale-select").value = "en";
  h.el("locale-select").dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await nextTurn();
  assertVisible(h, [4, 5]);
  assertActive(h, 800, 800);
});
