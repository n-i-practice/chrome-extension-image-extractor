(() => {
  const imgs = Array.from(document.querySelectorAll("img"));
  const srcList = imgs.map((img) => img.src);

  chrome.runtime.sendMessage({
    type: "image-urls",
    payload: srcList,
  });
})();
