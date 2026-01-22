# Archivist

Archivist is a Chrome extension that opens the latest archive.is snapshot for pages on selected domains. It supports automatic redirects for your allowlist and quick manual access via the toolbar button or context menu.

## Features
- Auto-redirect for pages on allowlisted domains
- Manage your allowlist in Options
- Open the latest archive.is snapshot from the toolbar or right-click menu
- Optional analytics toggle

## Install (Load Unpacked)
1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked" and select this folder.

## Usage
- Click the extension icon to open the latest snapshot for the current tab.
- Right-click a page and use the context menu to open a snapshot or add/remove the domain from your allowlist.
- Open Options to manage domains and analytics settings.

## Privacy
See `PRIVACY_POLICY.md`.

## Development
The extension code lives in `background.js`, `options.html`, and `options.js`.

## License
Unlicense (public domain).
