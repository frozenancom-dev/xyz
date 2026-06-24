// Background service worker — handles context menu creation and click dispatch.

const MENU_ID_EXTRACT = "extract-tweet";
const MENU_ID_CLEAR = "clear-tweets";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_EXTRACT,
      title: "Extract Tweet (Tweet Scraper)",
      contexts: ["page", "image", "link", "selection"],
      documentUrlPatterns: [
        "https://twitter.com/*",
        "https://x.com/*",
        "https://mobile.twitter.com/*"
      ]
    });

    chrome.contextMenus.create({
      id: MENU_ID_CLEAR,
      title: "Clear all saved tweets",
      contexts: ["action"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === MENU_ID_EXTRACT) {
    chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_TWEET_AT_POINT" }, (resp) => {
      if (chrome.runtime.lastError) {
        // Content script may not have loaded; ignore silently.
      }
    });
  } else if (info.menuItemId === MENU_ID_CLEAR) {
    chrome.storage.local.set({ tweets: [] });
  }
});
