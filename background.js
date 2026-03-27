// ─────────────────────────────────────────────
//  BACKGROUND SERVICE WORKER
//  Nhận actions từ content.js, lưu vào storage
// ─────────────────────────────────────────────

const MAX_ACTIONS = 500; // giới hạn số action lưu trữ

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'ADD_ACTION') {
    addAction(msg.payload);
  }

  if (msg.type === 'CLEAR_ACTIONS') {
    chrome.storage.local.set({ actions: [] });
  }

  if (msg.type === 'START_RECORDING') {
    chrome.storage.local.set({ isRecording: true });
    // Gửi tới tất cả tabs đang active
    broadcastToActiveTabs({ type: 'START_RECORDING' });
  }

  if (msg.type === 'STOP_RECORDING') {
    chrome.storage.local.set({ isRecording: false });
    broadcastToActiveTabs({ type: 'STOP_RECORDING' });
  }

  if (msg.type === 'SET_CAPTURE_CONSOLE') {
    chrome.storage.local.set({ captureConsole: msg.payload });
    broadcastToActiveTabs({ type: 'SET_CAPTURE_CONSOLE', payload: msg.payload });
  }
});

// Queue để tránh race condition khi nhiều message đến liên tiếp
let actionQueue = [];
let isProcessingQueue = false;

/**
 * So sánh 2 action có trùng nhau không (bỏ qua field count)
 */
function isSameAction(a, b) {
  if (!a || !b) return false;
  const { executeTimes: _a, ...restA } = a;
  const { executeTimes: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

function addAction(action) {
  // Dedup ngay trong queue
  const last = actionQueue[actionQueue.length - 1];
  if (isSameAction(last, action)) {
    last.executeTimes = (last.executeTimes || 1) + 1;
  } else {
    actionQueue.push(action);
  }
  if (!isProcessingQueue) processQueue();
}

function processQueue() {
  if (actionQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  isProcessingQueue = true;
  chrome.storage.local.get(['actions'], (result) => {
    const actions = result.actions || [];

    // Dedup item đầu queue với item cuối storage
    for (const item of actionQueue) {
      const last = actions[actions.length - 1];
      if (isSameAction(last, item)) {
        last.executeTimes = (last.executeTimes || 1) + (item.executeTimes || 1);
      } else {
        actions.push(item);
      }
    }
    actionQueue = [];

    // Giữ tối đa MAX_ACTIONS action gần nhất
    const trimmed = actions.slice(-MAX_ACTIONS);
    chrome.storage.local.set({ actions: trimmed }, processQueue);
  });
}

function broadcastToActiveTabs(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}
