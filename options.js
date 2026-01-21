const form = document.getElementById("add-form");
const input = document.getElementById("domain-input");
const listEl = document.getElementById("domain-list");
const emptyEl = document.getElementById("empty");
const resetBtn = document.getElementById("reset");

let currentAllowlist = [];
let defaultAllowlist = [];

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

function saveAllowlist(next) {
  currentAllowlist = normalizeAllowlist(next);
  chrome.storage.sync.set({ allowlist: currentAllowlist }, renderList);
}

function removeDomain(domain) {
  saveAllowlist(currentAllowlist.filter((entry) => entry !== domain));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = normalizeDomain(input.value);
  if (!domain) return;
  saveAllowlist([...currentAllowlist, domain]);
  input.value = "";
});

resetBtn.addEventListener("click", () => {
  saveAllowlist(defaultAllowlist);
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
  chrome.storage.sync.get({ allowlist: defaultAllowlist }, (data) => {
    currentAllowlist = normalizeAllowlist(data.allowlist);
    renderList();
  });
});
