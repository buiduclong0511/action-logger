# Action Logger - Debug Tool

## Purpose
Chrome Extension (Manifest V3) that records all user interactions and DOM changes on any web page, outputting them as structured JSON for debugging purposes.

## Key Features
- **Record user actions**: click, input, keydown, scroll events
- **Track DOM mutations**: attribute changes, text content changes, value changes (via MutationObserver + polling)
- **Causal linking**: mutations occurring within 500ms of a user action are linked via `causedBy`
- **Popup UI**: dark-themed panel with filtering (by trigger type/action type), stats, JSON viewer with syntax highlighting, copy to clipboard
- **Storage**: actions stored in `chrome.storage.local`, max 500 actions

## Tech Stack
- **Vanilla JavaScript** (no frameworks, no build tools)
- **Chrome Extension Manifest V3**
- **CSS**: custom properties, dark theme, JetBrains Mono + Inter fonts

## Architecture
```
manifest.json          — Extension config (MV3)
background.js          — Service worker: receives actions, stores in chrome.storage, broadcasts recording state
content.js             — Content script: listens to DOM events + MutationObserver, sends actions to background
popup/
  popup.html           — Popup UI (dark theme, filters, JSON viewer)
  popup.js             — Popup logic: renders actions, controls recording, copy JSON
icons/                 — Extension icons
```

## Communication Flow
1. Popup sends START/STOP_RECORDING → background → broadcasts to active tabs
2. Content script captures events → sends ADD_ACTION → background stores in chrome.storage
3. Popup polls chrome.storage every 500ms for live updates
