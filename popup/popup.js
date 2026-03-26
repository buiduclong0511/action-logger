// ─────────────────────────────────────────────
//  POPUP LOGIC
// ─────────────────────────────────────────────

let allActions = [];
let isRecording = false;
let activeFilter = 'all';
let consoleFilter = '';

// ── DOM refs
const actionsList       = document.getElementById('actionsList');
const emptyState        = document.getElementById('emptyState');
const btnRecord         = document.getElementById('btnRecord');
const btnClear          = document.getElementById('btnClear');
const btnCopy           = document.getElementById('btnCopy');
const logoDot           = document.getElementById('logoDot');
const statusText        = document.getElementById('statusText');
const copiedToast       = document.getElementById('copiedToast');
const statUser          = document.getElementById('statUser');
const statAuto          = document.getElementById('statAuto');
const statConsole       = document.getElementById('statConsole');
const statTotal         = document.getElementById('statTotal');
const consoleBar        = document.getElementById('consoleBar');
const consoleToggle     = document.getElementById('consoleToggle');
const consoleFilterInput = document.getElementById('consoleFilterInput');

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function getSummary(action) {
  switch (action.type) {
    case 'click':
      return `<span class="highlight">${action.selector || '?'}</span>${action.text ? ` "${action.text.slice(0, 30)}"` : ''}`;
    case 'input':
      return `<span class="highlight">${action.selector || '?'}</span> = <span class="highlight">${JSON.stringify(action.value)?.slice(0, 40) || ''}</span>`;
    case 'keydown':
      return `key: <span class="highlight">${action.key}</span> on ${action.selector || '?'}`;
    case 'scroll':
      return `scrollY: <span class="highlight">${action.scrollY}</span>`;
    case 'dom_mutation':
      return `<span class="highlight">${action.selector || '?'}</span> [${action.mutationKind}] → <span class="highlight">${JSON.stringify(action.newValue)?.slice(0, 30) || ''}</span>`;
    case 'navigate':
      return `→ <span class="highlight">${action.to || ''}</span>`;
    case 'console': {
      const methodBadge = `<span class="console-method method-${action.method || 'log'}">${action.method || 'log'}</span>`;
      const preview = (action.args || []).join(' ').slice(0, 60);
      const uncaughtTag = action.isUncaught ? ' <span style="color:var(--danger)">[uncaught]</span>' : '';
      return `${methodBadge}${uncaughtTag} <span class="highlight">${escapeHtml(preview)}</span>`;
    }
    case 'recording_started':
      return 'Recording started';
    default:
      return action.type;
  }
}

/**
 * Syntax highlight JSON string
 */
function highlightJson(obj) {
  const str = JSON.stringify(obj, null, 2);
  return str.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

function getFilteredActions() {
  const consoleEnabled = consoleToggle.checked;

  return allActions.filter(a => {
    // Ẩn console actions khi console capture tắt
    if (a.type === 'console' && !consoleEnabled) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'user') return a.trigger === 'user';
    if (activeFilter === 'auto') return a.trigger === 'auto';
    if (activeFilter === 'console') {
      if (a.type !== 'console') return false;
      if (consoleFilter) {
        const text = (a.args || []).join(' ').toLowerCase();
        return text.includes(consoleFilter.toLowerCase());
      }
      return true;
    }
    return a.type === activeFilter;
  });
}

function updateStats() {
  const userCount = allActions.filter(a => a.trigger === 'user').length;
  const autoCount = allActions.filter(a => a.trigger === 'auto' && a.type !== 'console').length;
  const consoleCount = allActions.filter(a => a.type === 'console').length;
  statUser.textContent = userCount;
  statAuto.textContent = autoCount;
  statConsole.textContent = consoleCount;
  statTotal.textContent = allActions.length;
}

function render() {
  const filtered = getFilteredActions();
  updateStats();

  if (filtered.length === 0) {
    actionsList.innerHTML = '';
    actionsList.appendChild(emptyState);
    emptyState.querySelector('.icon').textContent = allActions.length > 0 ? '🔍' : '⏺';
    emptyState.querySelector('div:last-child').innerHTML = allActions.length > 0
      ? 'Không có action nào khớp bộ lọc'
      : `Nhấn <strong>Start</strong> để bắt đầu ghi lại`;
    return;
  }

  actionsList.innerHTML = '';

  // Render từ mới nhất
  [...filtered].reverse().forEach((action, idx) => {
    const item = document.createElement('div');
    item.className = 'action-item';

    const badgeClass = `badge-${action.type}`;
    const triggerClass = `trigger-${action.trigger || 'unknown'}`;
    const triggerLabel = action.trigger === 'auto' ? '⚡ auto' :
                        action.trigger === 'user' ? '👤 user' :
                        action.trigger === 'system' ? '⚙ sys' : '? unknown';

    item.innerHTML = `
      <div class="action-header">
        <span class="action-type-badge ${badgeClass}">${action.type.replace('_', ' ')}</span>
        <span class="trigger-badge ${triggerClass}">${triggerLabel}</span>
        <span class="action-summary">${getSummary(action)}</span>
        <span class="action-time">${action.timestamp ? formatTime(action.timestamp) : ''}</span>
        <span class="expand-icon">▶</span>
      </div>
      <div class="action-json">
        <div class="json-block">${highlightJson(action)}</div>
      </div>
    `;

    // Toggle expand
    item.querySelector('.action-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

    actionsList.appendChild(item);
  });
}

// ─────────────────────────────────────────────
//  RECORDING CONTROLS
// ─────────────────────────────────────────────

function setRecordingState(recording) {
  isRecording = recording;

  if (recording) {
    btnRecord.textContent = '⏹ Stop';
    btnRecord.className = 'btn btn-stop';
    logoDot.classList.remove('stopped');
    statusText.innerHTML = '<span class="status-recording">● Đang ghi...</span>';
  } else {
    btnRecord.textContent = '▶ Start';
    btnRecord.className = 'btn btn-record';
    logoDot.classList.add('stopped');
    statusText.textContent = '⏹ Đã dừng';
  }
}

btnRecord.addEventListener('click', () => {
  if (isRecording) {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    chrome.storage.local.set({ isRecording: false });
    setRecordingState(false);
  } else {
    chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    chrome.storage.local.set({ isRecording: true });
    setRecordingState(true);
  }
});

btnClear.addEventListener('click', () => {
  allActions = [];
  chrome.runtime.sendMessage({ type: 'CLEAR_ACTIONS' });
  chrome.storage.local.set({ actions: [] });
  render();
});

btnCopy.addEventListener('click', () => {
  let filtered = getFilteredActions();

  if (!consoleToggle.checked) {
    // Console capture tắt → loại bỏ toàn bộ console actions khi copy
    filtered = filtered.filter(a => a.type !== 'console');
  } else if (consoleFilter) {
    // Console capture bật + có filter → chỉ giữ console logs khớp
    const keyword = consoleFilter.toLowerCase();
    filtered = filtered.filter(a => {
      if (a.type !== 'console') return true;
      const text = (a.args || []).join(' ').toLowerCase();
      return text.includes(keyword);
    });
  }

  navigator.clipboard.writeText(JSON.stringify(filtered, null, 2)).then(() => {
    copiedToast.classList.add('show');
    setTimeout(() => copiedToast.classList.remove('show'), 2000);
  });
});

// ─────────────────────────────────────────────
//  FILTER CHIPS
// ─────────────────────────────────────────────

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    render();
  });
});

// ─────────────────────────────────────────────
//  CONSOLE TOGGLE & FILTER
// ─────────────────────────────────────────────

consoleToggle.addEventListener('change', () => {
  const enabled = consoleToggle.checked;
  consoleFilterInput.classList.toggle('visible', enabled);
  if (!enabled) {
    consoleFilter = '';
    consoleFilterInput.value = '';
  }
  chrome.runtime.sendMessage({ type: 'SET_CAPTURE_CONSOLE', payload: enabled });
  chrome.storage.local.set({ captureConsole: enabled });
  render();
});

consoleFilterInput.addEventListener('input', () => {
  consoleFilter = consoleFilterInput.value;
  render();
});

// ─────────────────────────────────────────────
//  LOAD STATE ON OPEN
// ─────────────────────────────────────────────

chrome.storage.local.get(['actions', 'isRecording', 'captureConsole'], (result) => {
  allActions = result.actions || [];
  setRecordingState(result.isRecording || false);
  consoleToggle.checked = result.captureConsole || false;
  consoleFilterInput.classList.toggle('visible', consoleToggle.checked);
  render();
});

// ─────────────────────────────────────────────
//  LIVE UPDATES (poll storage khi popup mở)
// ─────────────────────────────────────────────

setInterval(() => {
  chrome.storage.local.get(['actions'], (result) => {
    const newActions = result.actions || [];
    if (newActions.length !== allActions.length) {
      allActions = newActions;
      render();
    }
  });
}, 500);
