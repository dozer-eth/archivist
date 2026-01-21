const ARCHIVE_BASE = "https://archive.is/timegate/";

function buildTimegateUrl(originalUrl) {
  if (!originalUrl) return null;
  // Preserve scheme/slashes while encoding spaces and other unsafe characters.
  return ARCHIVE_BASE + encodeURI(originalUrl);
}

function openLatestArchive(tabId, originalUrl) {
  const target = buildTimegateUrl(originalUrl);
  if (!target) return;
  chrome.tabs.update(tabId, { url: target });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  openLatestArchive(tab.id, tab.url);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-archive-latest",
    title: "Open latest archive.is snapshot",
    contexts: ["page", "link"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  const url = info.linkUrl || tab.url;
  openLatestArchive(tab.id, url);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-latest-archive") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    openLatestArchive(tab.id, tab.url);
  });
});
