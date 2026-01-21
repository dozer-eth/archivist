const ARCHIVE_BASE = "https://archive.is/timegate/";
const ALLOWLIST = ["nytimes.com", "wsj.com", "wired.com"];
const ARCHIVE_HOSTS = new Set(["archive.is", "archive.today"]);
const lastAutoUrlByTab = new Map();

function isAllowlistedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWLIST.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function buildTimegateUrl(originalUrl) {
  if (!originalUrl) return null;
  // Preserve scheme/slashes while encoding spaces and other unsafe characters.
  return ARCHIVE_BASE + encodeURI(originalUrl);
}

function shouldAutoArchive(rawUrl) {
  if (!rawUrl) return false;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (ARCHIVE_HOSTS.has(url.hostname.toLowerCase())) return false;
  if (!isAllowlistedHost(url.hostname)) return false;

  const path = url.pathname || "/";
  if (path === "/" || path === "") return false;

  return true;
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

function handleAutoArchive(tabId, rawUrl) {
  if (!shouldAutoArchive(rawUrl)) return;
  const lastUrl = lastAutoUrlByTab.get(tabId);
  if (lastUrl === rawUrl) return;
  lastAutoUrlByTab.set(tabId, rawUrl);
  openLatestArchive(tabId, rawUrl);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleAutoArchive(tabId, changeInfo.url);
    return;
  }
  if (!tab || !tab.url) return;
  if (changeInfo.status !== "loading" && changeInfo.status !== "complete") return;
  handleAutoArchive(tabId, tab.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (!details || !details.url) return;
  if (details.frameId !== 0) return;
  handleAutoArchive(details.tabId, details.url);
});
