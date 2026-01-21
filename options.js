const form = document.getElementById("add-form");
const input = document.getElementById("domain-input");
const listEl = document.getElementById("domain-list");
const emptyEl = document.getElementById("empty");
const resetBtn = document.getElementById("reset");
const analyticsToggle = document.getElementById("analytics-toggle");

let currentAllowlist = [];
let defaultAllowlist = [];
const ANALYTICS_STORAGE_KEY = "analytics_enabled";

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

function renderList() {
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
  chrome.storage.sync.set({ allowlist: currentAllowlist }, renderList);
  sendDomainChanges(added, removed, source);
}

function removeDomain(domain) {
  saveAllowlist(currentAllowlist.filter((entry) => entry !== domain), "options");
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

analyticsToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ [ANALYTICS_STORAGE_KEY]: analyticsToggle.checked });
});

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

loadDefaultAllowlist(() => {
  chrome.storage.sync.get(
    { allowlist: defaultAllowlist, [ANALYTICS_STORAGE_KEY]: true },
    (data) => {
    currentAllowlist = normalizeAllowlist(data.allowlist);
    analyticsToggle.checked = Boolean(data[ANALYTICS_STORAGE_KEY]);
    renderList();
    }
  );
});
