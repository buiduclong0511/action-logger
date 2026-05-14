# Console capture — lazy inject + restore

**Updated**: 2026-05-14 00:00
**Status**: verified
**Refs**: injected.js:1-115, content.js:1-12, content.js:374-505

## Context
Extension cần bắt `console.log/warn/error/info/debug` từ page để ghi vào action log. Đọc memory này khi đụng tới: console capture, injected script, override console, DevTools source location của log.

## Key findings
- `injected.js` chạy trong **main world** (content script ở isolated world không share `window.console` với page → không override trực tiếp được). Inject qua `<script>` element bằng content.js, với `web_accessible_resources` khai báo trong manifest.json.
- **KHÔNG inject sẵn ở đầu content.js** (cũ làm vậy → page nào cũng bị override → DevTools luôn hiển thị nguồn log là `injected.js` chứ không phải file thật). Lazy inject trong `startRecording()` qua `injectIfNeeded()` (content.js:382-394).
- Khi `stopRecording` → dispatch `__action_logger_stop__` → injected.js restore `console[m] = originals[m]` (injected.js:103-110). Khi không record, console nguyên bản → DevTools hiển thị đúng file:line gốc của log.
- Re-record: chỉ dispatch `__action_logger_start__` (script đã loaded, cờ `injectedLoaded`). Cờ `__action_logger_loaded__` trên window chống load 2 lần.
- Race xử lý: nếu user Start → Stop trước khi `script.onload` → cờ `isRecording` lúc onload sẽ là `false` → không dispatch start (content.js:388-392). Stop event dispatch trước onload thì bị mất, nhưng vô hại vì console chưa override.
- Bridge cross-world: content script ↔ main world giao tiếp qua `CustomEvent` dispatch trên `window` (DOM event bubble cross-world). Event names: `__action_logger_console__` (main → content, payload log), `__action_logger_start__` / `__action_logger_stop__` (content → main, điều khiển override).
- Ngoài override console, injected.js còn add listener `error` + `unhandledrejection` để bắt uncaught error / promise rejection (chỉ active khi recording).

## Related memories
- `project-architecture`
