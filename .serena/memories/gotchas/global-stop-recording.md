# Global stop recording must gate background writes

**Updated**: 2026-05-21 00:00
**Status**: verified
**Refs**: background.js:10-14, background.js:37-42, background.js:82-138, content.js:429-503

## Context
Đọc khi debug lỗi đã bấm Stop nhưng action vẫn tiếp tục tăng trong Action Logger extension.

## Key findings
- `STOP_RECORDING` broadcast cũ chỉ gửi tới active tab/current window, nên content script ở tab khác có thể chưa nhận stop và vẫn gửi `ADD_ACTION`.
- Background phải là lớp chặn cuối: `addAction()` cần bỏ qua action khi `bgIsRecording === false` để mọi message trễ hoặc từ tab stale không thể ghi thêm.
- Persist mode có queue async; khi stop/clear/start cần reset `actionQueue` và tăng `queueVersion` để callback `processQueue()` đang pending không flush dữ liệu cũ sau stop.
- Content script nên nghe `chrome.storage.onChanged` cho `isRecording` để các tab đồng bộ start/stop theo trạng thái global; `startRecording()`/`stopRecording()` phải idempotent để tránh tạo nhiều interval/listener khi vừa nhận broadcast vừa nhận storage change.

## Related memories
- `project-architecture`
- `architecture/console-capture`