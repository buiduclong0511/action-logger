# Fix stop recording action leak

**Updated**: 2026-05-21 16:34
**Status**: verified
**Refs**: background.js:10-14, background.js:37-42, background.js:82-138, content.js:429-503, .serena/memories/gotchas/global-stop-recording.md

## Context
Work log cho lần sửa lỗi đã bấm Stop trong Action Logger extension nhưng action vẫn tiếp tục được ghi.

## Key findings
- Background giờ khôi phục `isRecording` khi service worker restart và dùng `bgIsRecording` làm lớp chặn cuối cho mọi `ADD_ACTION`.
- `STOP_RECORDING`, `START_RECORDING`, và `CLEAR_ACTIONS` reset `actionQueue` và tăng `queueVersion` để callback async của persist mode không flush queue cũ sau khi stop.
- Content script nghe `chrome.storage.onChanged` cho `isRecording` để tab không active cũng tự đồng bộ start/stop theo global state.
- `startRecording()` và `stopRecording()` idempotent để tránh nhân đôi listener/interval khi vừa nhận runtime message vừa nhận storage change.
- Đã verify syntax bằng `node --check background.js` và `node --check content.js`; repo không có `package.json` nên không có lint/prettier script.

## Related memories
- `gotchas/global-stop-recording.md`
- `project-architecture`
- `architecture/console-capture`