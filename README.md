# Action Logger - Chrome Extension

Chrome Extension ghi lại toàn bộ thao tác người dùng (click, input, scroll, keydown, navigate) và thay đổi DOM tự động thành chuỗi JSON để debug.

## Tính năng

- Ghi lại các thao tác người dùng: click, input, keydown, scroll, navigate
- Theo dõi thay đổi DOM (DOM Mutations)
- Capture console logs (log, warn, error, info, debug)
- Phân loại hành động theo nguồn: User / Auto / System
- Lọc theo loại hành động
- Export dữ liệu dưới dạng JSON
- Giao diện dark mode

## Cài đặt lên Chrome

1. Clone hoặc tải source code về máy:

   ```bash
   git clone https://github.com/buiduclong0511/action-logger.git
   ```

2. Mở Chrome, truy cập `chrome://extensions/`

3. Bật **Developer mode** (góc trên bên phải)

4. Nhấn **Load unpacked**

5. Chọn thư mục chứa source code vừa clone về

6. Extension sẽ xuất hiện trên thanh toolbar của Chrome. Nhấn vào icon **Action Logger** để sử dụng.

## Sử dụng

1. Nhấn **Start** để bắt đầu ghi lại các thao tác
2. Thao tác trên trang web như bình thường
3. Bật **Console capture** nếu muốn ghi lại console logs
4. Sử dụng các bộ lọc (All, User, Auto, Click, Input, Mutation, Console) để xem theo loại
5. Nhấn **Copy JSON** để copy toàn bộ dữ liệu đã ghi
6. Nhấn **Clear** để xóa dữ liệu

## Cấu trúc thư mục

```
├── manifest.json       # Cấu hình Chrome Extension (Manifest V3)
├── background.js       # Service worker
├── content.js          # Content script - inject vào trang web
├── injected.js         # Script inject trực tiếp vào page context
├── popup/
│   ├── popup.html      # Giao diện popup
│   └── popup.js        # Logic popup
└── icons/              # Icon extension
```
