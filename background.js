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

function addAction(action) {
  actionQueue.push(action);
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
    actions.push(...actionQueue);
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
