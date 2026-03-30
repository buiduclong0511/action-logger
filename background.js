// ─────────────────────────────────────────────
//  BACKGROUND SERVICE WORKER
//  Nhận actions từ content.js, lưu vào storage hoặc memory
// ─────────────────────────────────────────────

let persistMode = false;
let bgIsRecording = false;
let inMemoryActions = [];

// Khôi phục persistMode khi service worker restart
chrome.storage.local.get(['persistMode'], (result) => {
  persistMode = result.persistMode || false;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ADD_ACTION') {
    addAction(msg.payload);
  }

  if (msg.type === 'CLEAR_ACTIONS') {
    inMemoryActions = [];
    chrome.storage.local.set({ actions: [] });
  }

  if (msg.type === 'START_RECORDING') {
    bgIsRecording = true;
    inMemoryActions = [];
    chrome.storage.local.set({ isRecording: true, actions: [] });
    broadcastToActiveTabs({ type: 'START_RECORDING' });
  }

  if (msg.type === 'STOP_RECORDING') {
    bgIsRecording = false;
    chrome.storage.local.set({ isRecording: false });
    broadcastToActiveTabs({ type: 'STOP_RECORDING' });
  }

  if (msg.type === 'SET_CAPTURE_CONSOLE') {
    chrome.storage.local.set({ captureConsole: msg.payload });
    broadcastToActiveTabs({ type: 'SET_CAPTURE_CONSOLE', payload: msg.payload });
  }

  if (msg.type === 'GET_ACTIONS') {
    sendResponse({ actions: inMemoryActions });
    return true;
  }

  if (msg.type === 'SET_PERSIST_MODE') {
    if (bgIsRecording) {
      sendResponse({ error: 'RECORDING_ACTIVE' });
      return true;
    }
    persistMode = msg.payload.enabled;
    chrome.storage.local.set({ persistMode });
    sendResponse({ ok: true });
    return true;
  }
});

// Queue để tránh race condition khi nhiều message đến liên tiếp (storage mode)
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
  if (persistMode) {
    // Storage mode — queue and write
    const last = actionQueue[actionQueue.length - 1];
    if (isSameAction(last, action)) {
      last.executeTimes = (last.executeTimes || 1) + 1;
    } else {
      actionQueue.push(action);
    }
    if (!isProcessingQueue) processQueue();
  } else {
    // Messaging mode — dedup in memory
    const last = inMemoryActions[inMemoryActions.length - 1];
    if (isSameAction(last, action)) {
      last.executeTimes = (last.executeTimes || 1) + 1;
    } else {
      inMemoryActions.push(action);
    }
  }
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

    chrome.storage.local.set({ actions }, processQueue);
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
