chrome.storage.session.get("images").then(({ images }) => {
  const grid = document.getElementById("grid");
  const info = document.getElementById("info");

  if (!images || images.length === 0) {
    info.textContent = "画像がありません";
    return;
  }

  info.textContent = `${images.length} 件の画像`;

  images.forEach((url) => {
    const div = document.createElement("div");
    div.className = "item";

    const img = document.createElement("img");
    img.src = url;

    div.appendChild(img);
    grid.appendChild(div);
  });
});
