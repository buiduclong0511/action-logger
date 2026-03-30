# Action Logger Extension - Architecture & Business Logic

## Purpose
Chrome Extension (Manifest V3) that records all user interactions, DOM mutations, and console output on any webpage, exports as JSON for debugging/analysis.

## Architecture (3 layers)
1. **injected.js** (main world) - Console capture via overriding console methods, sends CustomEvent
2. **content.js** (content script) - Event tracking (click, input, keydown, scroll, navigate) + MutationObserver + value polling (150ms)
3. **background.js** (service worker) - Storage, message relay, deduplication, action queue
4. **popup.js** (UI) - Display, filtering, theme, copy JSON, polls storage every 500ms

## Key Files
- manifest.json - Manifest V3 config
- content.js - Main event tracking + DOM mutation observer
- injected.js - Console capture in page's main world
- background.js - Service worker for storage & broadcast
- popup/popup.html + popup.js - Extension popup UI

## Event Types Tracked
- User: click, input, keydown (Enter/Escape/Tab only), scroll, navigate (SPA detection)
- Auto: DOM mutations (attribute, class, textContent, childList, value changes)
- Console: log, warn, error, info, debug + uncaught errors

## Key Features
- Smart selector generation (id → name → data-testid → class → nth-child)
- Deduplication of consecutive identical actions (executeTimes counter)
- Causality detection (mutations within 500ms of user action → trigger: 'auto')
- Theme system (light/dark/system)
- Filter chips (All, User, Auto, Click, Input, Mutation, Console)
- Max 500 actions, capture phase event listeners
- Action queue in background worker prevents race conditions