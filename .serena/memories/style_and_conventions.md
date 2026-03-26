# Code Style & Conventions

## Language
- Vanilla JavaScript (ES6+), no TypeScript
- No framework, no bundler, no dependencies
- Comments and UI text in **Vietnamese**

## Code Style
- IIFE pattern in content.js to avoid global scope pollution
- Functions use camelCase naming
- Constants use UPPER_SNAKE_CASE (e.g., `MAX_ACTIONS`, `AUTO_CAUSE_WINDOW_MS`)
- Section separators using comment blocks: `// ─────────────`
- JSDoc-style comments for key functions

## CSS
- CSS custom properties (variables) in `:root`
- Dark theme with color tokens (--bg, --surface, --accent, etc.)
- BEM-like class naming (e.g., `.action-item`, `.action-header`, `.filter-chip`)
- Inline styles avoided; all in `<style>` block within popup.html

## Architecture Patterns
- Message passing between popup ↔ background ↔ content script
- chrome.storage.local for persistence
- Polling for live updates (storage polling in popup, value polling in content)
- WeakMap for tracking input values without memory leaks
