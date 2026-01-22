const form = document.getElementById("add-form");
const input = document.getElementById("domain-input");
const listEl = document.getElementById("domain-list");
const emptyEl = document.getElementById("empty");
const resetBtn = document.getElementById("reset");
const exclusionForm = document.getElementById("exclusion-form");
const exclusionInput = document.getElementById("exclusion-input");
const exclusionListEl = document.getElementById("exclusion-list");
const exclusionEmptyEl = document.getElementById("exclusion-empty");
const analyticsToggle = document.getElementById("analytics-toggle");

let currentAllowlist = [];
let defaultAllowlist = [];
let currentExclusions = [];
let defaultExclusions = [];
const ANALYTICS_STORAGE_KEY = "analytics_enabled";
const EXCLUSIONS_STORAGE_KEY = "exclusions";

function normalizeDomain(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

function normalizeAllowlist(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((entry) => normalizeDomain(entry))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function normalizeExclusion(value) {
  if (!value) return null;
  let trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  trimmed = trimmed.replace(/^[a-z]+:\/\//, "");
  trimmed = trimmed.replace(/^\/\//, "");
  trimmed = trimmed.split("#")[0].split("?")[0];
  trimmed = trimmed.replace(/\*+$/, "");
  const firstSlash = trimmed.indexOf("/");
  if (firstSlash === -1) return null;
  let domain = trimmed.slice(0, firstSlash);
  let path = trimmed.slice(firstSlash);
  if (!domain || !path) return null;
  if (domain.startsWith("www.")) domain = domain.slice(4);
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return `${domain}${path}`;
}

function normalizeExclusions(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((entry) => normalizeExclusion(entry))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function renderAllowlist() {
  listEl.innerHTML = "";
  if (currentAllowlist.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  currentAllowlist.forEach((domain) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = domain;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.addEventListener("click", () => removeDomain(domain));
    li.appendChild(label);
    li.appendChild(button);
    listEl.appendChild(li);
  });
}

function renderExclusions() {
  exclusionListEl.innerHTML = "";
  if (currentExclusions.length === 0) {
    exclusionEmptyEl.hidden = false;
    return;
  }
  exclusionEmptyEl.hidden = true;
  currentExclusions.forEach((entry) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = entry;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.addEventListener("click", () => removeExclusion(entry));
    li.appendChild(label);
    li.appendChild(button);
    exclusionListEl.appendChild(li);
  });
}

function sendDomainChanges(added, removed, source) {
  if (added.length === 0 && removed.length === 0) return;
  chrome.runtime.sendMessage({
    type: "track-domain-changes",
    added,
    removed,
    source
  });
}

function saveAllowlist(next, source = "options") {
  const normalized = normalizeAllowlist(next);
  const added = normalized.filter((entry) => !currentAllowlist.includes(entry));
  const removed = currentAllowlist.filter((entry) => !normalized.includes(entry));
  currentAllowlist = normalized;
  chrome.storage.sync.set({ allowlist: currentAllowlist }, renderAllowlist);
  sendDomainChanges(added, removed, source);
}

function removeDomain(domain) {
  saveAllowlist(currentAllowlist.filter((entry) => entry !== domain), "options");
}

function saveExclusions(next) {
  const normalized = normalizeExclusions(next);
  currentExclusions = normalized;
  chrome.storage.sync.set({ [EXCLUSIONS_STORAGE_KEY]: currentExclusions }, renderExclusions);
}

function removeExclusion(entry) {
  saveExclusions(currentExclusions.filter((item) => item !== entry));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = normalizeDomain(input.value);
  if (!domain) return;
  saveAllowlist([...currentAllowlist, domain], "options");
  input.value = "";
});

resetBtn.addEventListener("click", () => {
  saveAllowlist(defaultAllowlist, "options");
});

exclusionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = normalizeExclusion(exclusionInput.value);
  if (!entry) return;
  saveExclusions([...currentExclusions, entry]);
  exclusionInput.value = "";
});

analyticsToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ [ANALYTICS_STORAGE_KEY]: analyticsToggle.checked });
});

function loadDefaultAllowlist(callback) {
  fetch(chrome.runtime.getURL("defaults-allowlist.json"))
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

function loadDefaultExclusions(callback) {
  fetch(chrome.runtime.getURL("defaults-exclusions.json"))
    .then((res) => res.json())
    .then((data) => {
      defaultExclusions = normalizeExclusions(data);
      callback();
    })
    .catch(() => {
      defaultExclusions = [];
      callback();
    });
}

loadDefaultAllowlist(() => {
  loadDefaultExclusions(() => {
    chrome.storage.sync.get(
      {
        allowlist: defaultAllowlist,
        [EXCLUSIONS_STORAGE_KEY]: defaultExclusions,
        [ANALYTICS_STORAGE_KEY]: true
      },
      (data) => {
        currentAllowlist = normalizeAllowlist(data.allowlist);
        currentExclusions = normalizeExclusions(data[EXCLUSIONS_STORAGE_KEY]);
        analyticsToggle.checked = Boolean(data[ANALYTICS_STORAGE_KEY]);
        renderAllowlist();
        renderExclusions();
      }
    );
  });
});
