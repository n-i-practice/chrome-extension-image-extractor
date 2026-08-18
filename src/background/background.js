chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/content.js"],
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "image-urls") {
    console.log("Received image URLs:", message.payload);

    chrome.storage.session.set({ images: message.payload }).then(() => {
      console.log("saved to session");

      chrome.tabs.create({
        url: chrome.runtime.getURL("src/viewer/viewer.html"),
      });
    });
  }
});
