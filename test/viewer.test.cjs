/**
 * 第2段階: Viewer の公開 DOM 操作に対する回帰テスト。
 * 内部変数には触らず、表示クラス・画像 URL・位置・フォーカスで結果を確認する。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createViewerHarness, IMAGES } = require("./helpers/viewer-harness.cjs");

const hidden = el => el.classList.contains("hidden");
const original = h => h.img.classList.contains("original");
const src = h => h.img.getAttribute("src");

function assertClosed(h) {
  assert.ok(hidden(h.el("modal")));
  assert.equal(src(h), null);
  assert.equal(h.img.style.visibility, "hidden");
  assert.equal(h.img.onload, null);
  assert.equal(h.img.onerror, null);
  for (const el of h.document.body.children) assert.equal(el.hasAttribute("inert"), false);
}

test("カードのサムネ・メタ行から開き、背景を inert にして閉じるボタンへフォーカスする", async t => {
  const h = await createViewerHarness(t);
  for (const [index, selector] of [".thumb", ".item-meta"].entries()) {
    h.cards[index].querySelector(selector).click();
    assert.equal(hidden(h.el("modal")), false);
    assert.equal(src(h), IMAGES[index].src);
    assert.equal(h.document.activeElement, h.el("close-btn"));
    for (const el of h.document.body.children) {
      assert.equal(el.hasAttribute("inert"), el !== h.el("modal"));
    }
    assert.equal(h.img.style.visibility, "hidden");
    assert.ok(hidden(h.el("zoom-btn")));
    h.loadModal();
    assert.equal(h.img.style.visibility, "visible");
    assert.equal(hidden(h.el("zoom-btn")), false);
    h.el("close-btn").click();
    assertClosed(h);
  }
});

test("キャッシュ済み画像は load を待たずに表示とズーム操作を有効にする", async t => {
  const h = await createViewerHarness(t, { cached: true });
  h.open(0, { load: false });
  assert.equal(h.img.style.visibility, "visible");
  assert.equal(hidden(h.el("zoom-btn")), false);
  h.imageClick();
  assert.ok(original(h));
});

for (const control of ["image", "button"]) {
  test(control + " のクリックで拡大と原寸を往復できる", async t => {
    const h = await createViewerHarness(t);
    h.open();
    const click = () => control === "image" ? h.imageClick() : h.el("zoom-btn").click();
    click();
    assert.ok(original(h));
    assert.equal(hidden(h.el("modal")), false);
    assert.equal(h.img.style.left, "-300px");
    assert.equal(h.img.style.top, "-200px");
    assert.equal(h.el("zoom-out-icon").style.display, "block");
    click();
    assert.equal(original(h), false);
    assert.equal(h.img.style.left, "0px");
    assert.equal(h.img.style.top, "0px");
    assert.ok(h.img.classList.contains("can-zoom-in"));
    assert.equal(h.el("zoom-in-icon").style.display, "block");
  });
}

test("画面内に収まる画像は原寸ボタンを隠し、画像クリックでも切り替えない", async t => {
  const h = await createViewerHarness(t);
  h.open(2);
  assert.ok(hidden(h.el("zoom-btn")));
  assert.equal(h.img.classList.contains("can-zoom-in"), false);
  h.imageClick();
  assert.equal(original(h), false);
});

for (const mode of ["zoom", "original"]) {
  test(mode + " で 4px 以上ドラッグした直後の click は表示を切り替えない", async t => {
    const h = await createViewerHarness(t);
    h.open();
    if (mode === "original") h.imageClick();
    for (const [dx, dy] of [[4, 0], [0, -4]]) {
      h.drag(dx, dy);
      assert.equal(original(h), mode === "original");
      assert.equal(h.img.classList.contains("dragging"), false);
      assert.equal(h.img.classList.contains("drag-not-allowed"), false);
    }
    h.imageClick();
    assert.equal(original(h), mode !== "original", "次の通常クリックは抑止しない");
  });

  test(mode + " で 4px 未満の手ぶれはクリックとして扱う", async t => {
    const h = await createViewerHarness(t);
    h.open();
    if (mode === "original") h.imageClick();
    h.drag(3, -3);
    assert.equal(original(h), mode !== "original");
  });
}

test("原寸画像のパンは上下左右の端で止まる", async t => {
  const h = await createViewerHarness(t);
  h.open();
  h.imageClick();
  h.drag(2000, 2000);
  assert.equal(h.img.style.left, "0px");
  assert.equal(h.img.style.top, "0px");
  h.drag(-2000, -2000);
  assert.equal(h.img.style.left, "-600px");
  assert.equal(h.img.style.top, "-400px");
  assert.ok(original(h));
});

test("画面に収まる軸はパンせず、はみ出す軸だけ動かす", async t => {
  const h = await createViewerHarness(t, {
    images: [{ src: IMAGES[0].src, width: 1600, height: 500 }],
  });
  h.open();
  h.imageClick();
  h.drag(100, 100);
  assert.equal(h.img.style.left, "-200px");
  assert.equal(h.img.style.top, "150px");
});

test("左ボタン以外の押下ではドラッグを始めない", async t => {
  const h = await createViewerHarness(t);
  h.open();
  h.imageClick();
  for (const button of [1, 2]) {
    assert.equal(h.mouse(h.img, "mousedown", { button }).defaultPrevented, false);
    h.mouse(h.document, "mousemove", { clientX: 500 });
    h.mouse(h.document, "mouseup");
    assert.equal(h.img.style.left, "-300px");
    assert.equal(h.img.classList.contains("dragging"), false);
  }
});

test("矢印ボタンで前後移動し、先頭・末尾では対応する矢印を隠す", async t => {
  const h = await createViewerHarness(t);
  h.open();
  assert.ok(hidden(h.el("prev-btn")));
  assert.equal(hidden(h.el("next-btn")), false);
  h.el("next-btn").querySelector("svg").dispatchEvent(
    new h.window.MouseEvent("click", { bubbles: true }),
  );
  assert.equal(src(h), IMAGES[1].src);
  assert.equal(hidden(h.el("modal")), false);
  assert.equal(hidden(h.el("prev-btn")), false);
  assert.equal(hidden(h.el("next-btn")), false);
  h.el("next-btn").click();
  assert.equal(src(h), IMAGES[2].src);
  assert.ok(hidden(h.el("next-btn")));
  h.key("ArrowRight");
  assert.equal(src(h), IMAGES[2].src);
  h.el("prev-btn").click();
  assert.equal(src(h), IMAGES[1].src);
  h.key("ArrowLeft");
  h.key("ArrowLeft");
  assert.equal(src(h), IMAGES[0].src);
});

test("1枚だけの一覧では両矢印を隠し、左右キーでも画像を変えない", async t => {
  const h = await createViewerHarness(t, { images: [IMAGES[0]] });
  h.open();
  assert.ok(hidden(h.el("prev-btn")));
  assert.ok(hidden(h.el("next-btn")));
  h.key("ArrowLeft");
  h.key("ArrowRight");
  assert.equal(src(h), IMAGES[0].src);
});

test("読み込み待ち中も移動でき、原寸・ドラッグ状態と前画像の表示をリセットする", async t => {
  const h = await createViewerHarness(t);
  h.open();
  h.imageClick();
  h.mouse(h.img, "mousedown");
  h.mouse(h.document, "mousemove", { clientX: 150 });
  assert.ok(h.img.classList.contains("dragging"));
  assert.equal(h.key("ArrowRight").defaultPrevented, true);
  assert.equal(src(h), IMAGES[1].src);
  assert.equal(original(h), false);
  assert.equal(h.img.classList.contains("dragging"), false);
  assert.equal(h.img.style.visibility, "hidden");
  assert.ok(hidden(h.el("zoom-btn")));
  h.mouse(h.document, "mousemove", { clientX: 300 });
  assert.equal(h.img.style.left, "0px", "前画像のドラッグが続かない");
  h.key("ArrowRight");
  assert.equal(src(h), IMAGES[2].src);
  h.loadModal();
  assert.equal(h.img.style.visibility, "visible");
  assert.ok(hidden(h.el("zoom-btn")));
});

for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
  test(modifier + " 付き矢印キーは奪わない", async t => {
    const h = await createViewerHarness(t);
    h.open(1);
    for (const key of ["ArrowLeft", "ArrowRight"]) {
      assert.equal(h.key(key, { [modifier]: true }).defaultPrevented, false);
      assert.equal(src(h), IMAGES[1].src);
    }
  });
}

test("Shift 付き矢印キーは移動し、無関係なキーは奪わない", async t => {
  const h = await createViewerHarness(t);
  h.open();
  assert.equal(h.key("ArrowRight", { shiftKey: true }).defaultPrevented, true);
  assert.equal(src(h), IMAGES[1].src);
  assert.equal(h.key("ArrowLeft", { shiftKey: true }).defaultPrevented, true);
  assert.equal(src(h), IMAGES[0].src);
  assert.equal(h.key("a").defaultPrevented, false);
});

for (const tag of ["input", "textarea", "select", "contenteditable"]) {
  test(tag + " への矢印入力では画像を移動しない", async t => {
    const h = await createViewerHarness(t);
    h.open(1);
    // 背景の inert に依存せず、入力要素をモーダル内に置いてガード自体を確認する。
    const target = h.document.createElement(tag === "contenteditable" ? "div" : tag);
    if (tag === "contenteditable") {
      target.setAttribute("contenteditable", "true");
      // jsdom は isContentEditable を実装しないため、このブラウザー判定値だけ補う。
      Object.defineProperty(target, "isContentEditable", { value: true });
    }
    h.el("modal").appendChild(target);
    for (const key of ["ArrowLeft", "ArrowRight"]) {
      assert.equal(h.key(key, {}, target).defaultPrevented, false);
      assert.equal(src(h), IMAGES[1].src);
    }
    assert.equal(h.key("Escape", {}, target).defaultPrevented, true);
    assertClosed(h);
  });
}

for (const mode of ["zoom", "original", "loading"]) {
  for (const control of ["Escape", "close-btn", "overlay"]) {
    test(mode + " から " + control + " で閉じ、再度開ける", async t => {
      const h = await createViewerHarness(t);
      h.open(0, { load: mode !== "loading" });
      if (mode === "original") h.imageClick();
      if (control === "Escape") assert.equal(h.key("Escape").defaultPrevented, true);
      else h.el(control).click();
      assertClosed(h);
      h.img.dispatchEvent(new h.window.Event("load"));
      assertClosed(h);
      h.open(1);
      assert.equal(src(h), IMAGES[1].src);
      assert.equal(original(h), false);
      assert.equal(h.img.style.left, "0px");
      assert.equal(h.document.activeElement, h.el("close-btn"));
    });
  }
}

test("一覧表示中の矢印・Escape はブラウザー操作を妨げない", async t => {
  const h = await createViewerHarness(t);
  for (const key of ["ArrowLeft", "ArrowRight", "Escape"]) {
    assert.equal(h.key(key).defaultPrevented, false);
    assert.ok(hidden(h.el("modal")));
    assert.equal(src(h), null);
  }
});

test("リサイズで拡大時の原寸可否を更新し、原寸時は中央に戻してパンを解除する", async t => {
  const h = await createViewerHarness(t);
  h.open(2);
  h.window.innerWidth = 500;
  h.window.dispatchEvent(new h.window.Event("resize"));
  assert.equal(hidden(h.el("zoom-btn")), false);
  h.imageClick();
  h.mouse(h.img, "mousedown");
  h.mouse(h.document, "mousemove", { clientX: 110 });
  assert.ok(h.img.classList.contains("dragging"));
  h.window.innerWidth = 550;
  h.window.dispatchEvent(new h.window.Event("resize"));
  assert.equal(h.img.style.left, "-25px");
  assert.equal(h.img.style.top, "150px");
  assert.equal(h.img.classList.contains("dragging"), false);
  h.mouse(h.document, "mousemove", { clientX: 400 });
  assert.equal(h.img.style.left, "-25px");
});
