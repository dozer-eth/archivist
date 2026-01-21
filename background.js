const ARCHIVE_BASE = "https://archive.is/newest/";
const ARCHIVE_HOSTS = new Set(["archive.is", "archive.today"]);
const MIXPANEL_TOKEN = "152d139c7fa274e92fdfd1551c63df0b";
const MIXPANEL_ENDPOINT = "https://api.mixpanel.com/track";
const MIXPANEL_STORAGE_KEY = "mixpanel_distinct_id";
const ANALYTICS_STORAGE_KEY = "analytics_enabled";
const lastAutoUrlByTab = new Map();
const pendingAutoArchiveByTab = new Map();
let allowlist = [];
let defaultAllowlist = [];
let mixpanelDistinctId = null;
let allowlistReady = false;
let analyticsEnabled = true;
let analyticsReady = false;
let analyticsLoadPromise = null;

function base64EncodeJson(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function getMixpanelDistinctId() {
  if (mixpanelDistinctId) return Promise.resolve(mixpanelDistinctId);
  return new Promise((resolve) => {
    chrome.storage.local.get({ [MIXPANEL_STORAGE_KEY]: null }, (data) => {
      let id = data[MIXPANEL_STORAGE_KEY];
      if (!id) {
        id = crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        chrome.storage.local.set({ [MIXPANEL_STORAGE_KEY]: id }, () => {
          mixpanelDistinctId = id;
          resolve(id);
        });
        return;
      }
      mixpanelDistinctId = id;
      resolve(id);
    });
  });
}

function loadAnalyticsSetting() {
  if (analyticsLoadPromise) return analyticsLoadPromise;
  analyticsLoadPromise = new Promise((resolve) => {
    chrome.storage.sync.get({ [ANALYTICS_STORAGE_KEY]: true }, (data) => {
      analyticsEnabled = Boolean(data[ANALYTICS_STORAGE_KEY]);
      analyticsReady = true;
      resolve(analyticsEnabled);
    });
  });
  return analyticsLoadPromise;
}

function ensureAnalyticsEnabled() {
  if (analyticsReady) return Promise.resolve(analyticsEnabled);
  return loadAnalyticsSetting();
}

function clearMixpanelDistinctId() {
  mixpanelDistinctId = null;
  chrome.storage.local.remove(MIXPANEL_STORAGE_KEY, () => {});
}

function trackEvent(eventName, properties) {
  if (!MIXPANEL_TOKEN) return Promise.resolve();
  return ensureAnalyticsEnabled()
    .then((enabled) => {
      if (!enabled) return undefined;
      return getMixpanelDistinctId().then((distinctId) => {
        const payload = {
          event: eventName,
          properties: {
            token: MIXPANEL_TOKEN,
            distinct_id: distinctId,
            ip: 1,
            time: Date.now(),
            extension_version: chrome.runtime.getManifest().version,
            ...properties
          }
        };
        const body = new URLSearchParams({
          data: base64EncodeJson(payload)
        });
        return fetch(MIXPANEL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          keepalive: true
        });
      });
    })
    .catch(() => undefined);
}

function trackDomainChange(domain, action, source) {
  if (!domain) return Promise.resolve();
  const eventName = action === "remove" ? "domain_removed" : "domain_added";
  return trackEvent(eventName, {
    domain,
    source,
    list_type: "allowlist"
  });
}

function isAllowlistedHost(hostname) {
  const host = hostname.toLowerCase();
  return allowlist.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function buildNewestUrl(originalUrl) {
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

function normalizeAllowlist(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((d) => d.trim().toLowerCase()).filter(Boolean))];
}

function loadDefaultAllowlist(callback) {
  fetch(chrome.runtime.getURL("defaults.json"))
    .then((res) => res.json())
    .then((data) => {
      defaultAllowlist = normalizeAllowlist(data);
      callback();
    })
    .catch(() => {
      defaultAllowlist = [];
      callback();
    });
}

function loadAllowlist() {
  chrome.storage.sync.get({ allowlist: defaultAllowlist }, (data) => {
    allowlist = normalizeAllowlist(data.allowlist);
    allowlistReady = true;
    flushPendingAutoArchives();
  });
}

function setAllowlist(next) {
  allowlist = normalizeAllowlist(next);
  chrome.storage.sync.set({ allowlist });
}

function getHostname(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeAllowlistDomain(host) {
  if (!host) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}

function updateContextMenusForUrl(rawUrl) {
  const host = getHostname(rawUrl);
  const isAllowed = host ? isAllowlistedHost(host) : false;
  const canToggle = Boolean(host);
  chrome.contextMenus.update("allowlist-domain", {
    visible: canToggle && !isAllowed
  });
  chrome.contextMenus.update("unallowlist-domain", {
    visible: canToggle && isAllowed
  });
}

function openLatestArchive(tabId, originalUrl) {
  const target = buildNewestUrl(originalUrl);
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
  chrome.contextMenus.create({
    id: "allowlist-domain",
    title: "Always redirect pages on this domain to archived snapshot",
    contexts: ["page"],
    visible: false
  });
  chrome.contextMenus.create({
    id: "unallowlist-domain",
    title: "Stop redirecting pages on this domain to archived snapshot",
    contexts: ["page"],
    visible: false
  });

  loadDefaultAllowlist(() => {
    chrome.storage.sync.get({ allowlist: defaultAllowlist }, (data) => {
      allowlist = normalizeAllowlist(data.allowlist);
      updateContextMenusForUrl("");
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  const url = info.linkUrl || tab.url;
  if (info.menuItemId === "open-archive-latest") {
    openLatestArchive(tab.id, url);
    return;
  }

  const host = getHostname(tab.url);
  if (!host) return;
  if (info.menuItemId === "allowlist-domain") {
    const domain = normalizeAllowlistDomain(host);
    if (!allowlist.includes(domain)) {
      setAllowlist([...allowlist, domain]);
      trackDomainChange(domain, "add", "context_menu");
      updateContextMenusForUrl(tab.url);
    }
    return;
  }
  if (info.menuItemId === "unallowlist-domain") {
    const domain = normalizeAllowlistDomain(host);
    if (allowlist.includes(domain)) {
      setAllowlist(allowlist.filter((entry) => entry !== domain));
      trackDomainChange(domain, "remove", "context_menu");
      updateContextMenusForUrl(tab.url);
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-latest-archive") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    openLatestArchive(tab.id, tab.url);
  });
});

function attemptAutoArchive(tabId, rawUrl) {
  if (!shouldAutoArchive(rawUrl)) return;
  const lastUrl = lastAutoUrlByTab.get(tabId);
  if (lastUrl === rawUrl) return;
  lastAutoUrlByTab.set(tabId, rawUrl);
  openLatestArchive(tabId, rawUrl);
}

function handleAutoArchive(tabId, rawUrl) {
  if (!rawUrl) return;
  if (!allowlistReady) {
    pendingAutoArchiveByTab.set(tabId, rawUrl);
    return;
  }
  attemptAutoArchive(tabId, rawUrl);
}

function flushPendingAutoArchives() {
  if (!allowlistReady || pendingAutoArchiveByTab.size === 0) return;
  for (const [tabId, pendingUrl] of pendingAutoArchiveByTab.entries()) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      const currentUrl = tab.pendingUrl || tab.url;
      if (!currentUrl || currentUrl !== pendingUrl) return;
      attemptAutoArchive(tabId, pendingUrl);
    });
  }
  pendingAutoArchiveByTab.clear();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url || (tab && (tab.pendingUrl || tab.url));
  if (!candidateUrl) return;
  if (changeInfo.url) {
    handleAutoArchive(tabId, changeInfo.url);
    updateContextMenusForUrl(changeInfo.url);
    return;
  }
  if (changeInfo.status !== "loading" && changeInfo.status !== "complete") return;
  handleAutoArchive(tabId, candidateUrl);
  updateContextMenusForUrl(candidateUrl);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (!details || !details.url) return;
  if (details.frameId !== 0) return;
  handleAutoArchive(details.tabId, details.url);
  updateContextMenusForUrl(details.url);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab || !tab.url) return;
    updateContextMenusForUrl(tab.url);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "track-domain-changes") return;
  const added = Array.isArray(message.added) ? message.added : [];
  const removed = Array.isArray(message.removed) ? message.removed : [];
  const source = message.source || "options";
  const tasks = [];
  added.forEach((domain) => tasks.push(trackDomainChange(domain, "add", source)));
  removed.forEach((domain) => tasks.push(trackDomainChange(domain, "remove", source)));
  Promise.all(tasks)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.allowlist) {
    allowlist = normalizeAllowlist(changes.allowlist.newValue);
  }
  if (changes[ANALYTICS_STORAGE_KEY]) {
    analyticsEnabled = Boolean(changes[ANALYTICS_STORAGE_KEY].newValue);
    analyticsReady = true;
    if (!analyticsEnabled) {
      clearMixpanelDistinctId();
    }
  }
});

loadDefaultAllowlist(loadAllowlist);
loadAnalyticsSetting();
