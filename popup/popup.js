// ─────────────────────────────────────────────
//  POPUP LOGIC
// ─────────────────────────────────────────────

let allActions = [];
let isRecording = false;
let activeFilter = 'all';
let consoleFilter = '';
let persistMode = false;

// ── DOM refs
const actionsList       = document.getElementById('actionsList');
const emptyState        = document.getElementById('emptyState');
const btnRecord         = document.getElementById('btnRecord');
const btnClear          = document.getElementById('btnClear');
const btnCopy           = document.getElementById('btnCopy');
const btnCopyPretty     = document.getElementById('btnCopyPretty');
const logoDot           = document.getElementById('logoDot');
const statusText        = document.getElementById('statusText');
const copiedToast       = document.getElementById('copiedToast');
const statUser          = document.getElementById('statUser');
const statAuto          = document.getElementById('statAuto');
const statConsole       = document.getElementById('statConsole');
const statTotal         = document.getElementById('statTotal');
const statTokens        = document.getElementById('statTokens');
const btnTheme          = document.getElementById('btnTheme');
const consoleFilterBar  = document.getElementById('consoleFilterBar');
const consoleToggle     = document.getElementById('consoleToggle');
const consoleFilterInput = document.getElementById('consoleFilterInput');
const persistToggle     = document.getElementById('persistToggle');

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────

const USER_TYPES = new Set(['click', 'input', 'keydown']);

function isUserAction(a) {
  return USER_TYPES.has(a.type);
}

function getTrigger(a) {
  if (a.trigger) return a.trigger;
  if (isUserAction(a)) return 'user';
  if (a.type === 'navigate') return 'system';
  return 'unknown';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getSummary(action) {
  switch (action.type) {
    case 'click':
      return `<span class="highlight">${action.selector || '?'}</span>${action.text ? ` "${action.text.slice(0, 30)}"` : ''}`;
    case 'input':
      return `<span class="highlight">${action.selector || '?'}</span> = <span class="highlight">${JSON.stringify(action.value)?.slice(0, 40) || ''}</span>`;
    case 'keydown':
      return `key: <span class="highlight">${action.key}</span> on ${action.selector || '?'}`;
    case 'dom': {
      let mutationDetail = '';
      if (action.classChange) {
        const parts = [];
        if (action.classChange.added) parts.push(`+${action.classChange.added.join(' +')}`);
        if (action.classChange.removed) parts.push(`-${action.classChange.removed.join(' -')}`);
        mutationDetail = parts.join(' ');
      } else if (action.newValue !== undefined) {
        mutationDetail = JSON.stringify(action.newValue)?.slice(0, 30) || '';
      } else if (action.text) {
        mutationDetail = action.text.slice(0, 30);
      }
      return `<span class="highlight">${action.selector || action.parentSelector || '?'}</span> [${action.mutationKind}] → <span class="highlight">${escapeHtml(mutationDetail)}</span>`;
    }
    case 'navigate':
      return `→ <span class="highlight">${action.to || ''}</span>`;
    case 'console': {
      const methodBadge = `<span class="console-method method-${action.method || 'log'}">${action.method || 'log'}</span>`;
      const preview = (action.args || []).join(' ').slice(0, 60);
      const uncaughtTag = action.isUncaught ? ' <span style="color:var(--danger)">[uncaught]</span>' : '';
      return `${methodBadge}${uncaughtTag} <span class="highlight">${escapeHtml(preview)}</span>`;
    }
    default:
      return action.type;
  }
}

/**
 * Syntax highlight JSON string — chỉ gọi khi expand
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
//  VIRTUAL SCROLL
// ─────────────────────────────────────────────

const ITEM_HEIGHT = 38;   // collapsed item height (padding 7*2 + border 2 + margin 4 ≈ 38)
const BUFFER = 10;        // extra items above/below viewport

let filteredActions = [];  // cached filtered list (reversed)
let expandedSet = new Set(); // track expanded item indices

// Spacer elements for virtual scroll
const topSpacer = document.createElement('div');
const bottomSpacer = document.createElement('div');
topSpacer.style.flexShrink = '0';
bottomSpacer.style.flexShrink = '0';

function createItemElement(action, idx) {
  const item = document.createElement('div');
  item.className = 'action-item';
  item.dataset.idx = idx;

  const badgeClass = `badge-${action.type}`;
  const trigger = getTrigger(action);
  const triggerClass = `trigger-${trigger}`;
  const triggerLabel = trigger === 'auto' ? '⚡ auto' :
                      trigger === 'user' ? '👤 user' :
                      trigger === 'system' ? '⚙ sys' : '? unknown';

  item.innerHTML = `
    <div class="action-header">
      <span class="action-type-badge ${badgeClass}">${action.type}</span>
      <span class="trigger-badge ${triggerClass}">${triggerLabel}</span>
      <span class="action-summary">${getSummary(action)}</span>
      ${action.executeTimes ? `<span class="action-count">×${action.executeTimes}</span>` : ''}
      <span class="expand-icon">▶</span>
    </div>
    <div class="action-json"></div>
  `;

  item.querySelector('.action-header').addEventListener('click', () => {
    const isExpanded = item.classList.toggle('expanded');
    if (isExpanded) {
      expandedSet.add(idx);
      // Lazy render JSON chỉ khi expand lần đầu
      const jsonContainer = item.querySelector('.action-json');
      if (!jsonContainer.hasChildNodes()) {
        const block = document.createElement('div');
        block.className = 'json-block';
        block.innerHTML = highlightJson(action);
        jsonContainer.appendChild(block);
      }
    } else {
      expandedSet.delete(idx);
    }
  });

  // Restore expanded state
  if (expandedSet.has(idx)) {
    item.classList.add('expanded');
    const jsonContainer = item.querySelector('.action-json');
    const block = document.createElement('div');
    block.className = 'json-block';
    block.innerHTML = highlightJson(action);
    jsonContainer.appendChild(block);
  }

  return item;
}

let lastRenderedRange = { start: -1, end: -1 };

function renderVisibleItems() {
  const containerHeight = actionsList.clientHeight;
  const scrollTop = actionsList.scrollTop;
  const totalItems = filteredActions.length;

  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + BUFFER * 2;
  const endIdx = Math.min(totalItems, startIdx + visibleCount);

  // Skip nếu range không đổi
  if (startIdx === lastRenderedRange.start && endIdx === lastRenderedRange.end) return;
  lastRenderedRange = { start: startIdx, end: endIdx };

  // Update spacers
  topSpacer.style.height = (startIdx * ITEM_HEIGHT) + 'px';
  bottomSpacer.style.height = ((totalItems - endIdx) * ITEM_HEIGHT) + 'px';

  // Build fragment
  const fragment = document.createDocumentFragment();
  fragment.appendChild(topSpacer);

  for (let i = startIdx; i < endIdx; i++) {
    fragment.appendChild(createItemElement(filteredActions[i], i));
  }

  fragment.appendChild(bottomSpacer);

  // Replace content
  actionsList.innerHTML = '';
  actionsList.appendChild(fragment);
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

function getFilteredActions() {
  const consoleEnabled = consoleToggle.checked;

  return allActions.filter(a => {
    if (a.type === 'console' && !consoleEnabled) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'user') return isUserAction(a);
    if (activeFilter === 'auto') return !isUserAction(a) && a.type !== 'console' && a.type !== 'navigate';
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
  let userCount = 0;
  let autoCount = 0;
  let consoleCount = 0;

  for (let i = 0; i < allActions.length; i++) {
    const a = allActions[i];
    if (isUserAction(a)) {
      userCount++;
    } else if (a.type === 'console') {
      consoleCount++;
    } else if (a.type !== 'navigate') {
      autoCount++;
    }
  }

  statUser.textContent = userCount;
  statAuto.textContent = autoCount;
  statConsole.textContent = consoleCount;
  statTotal.textContent = allActions.length;

  // Token count theo filtered list (tab đang active)
  const tokens = estimateTokens(JSON.stringify(filteredActions));
  statTokens.textContent = formatTokenCount(tokens);
}

function render() {
  filteredActions = [...getFilteredActions()].reverse();
  expandedSet.clear();
  lastRenderedRange = { start: -1, end: -1 };
  updateStats();

  if (filteredActions.length === 0) {
    actionsList.innerHTML = '';
    actionsList.appendChild(emptyState);
    emptyState.querySelector('.icon').textContent = allActions.length > 0 ? '🔍' : '⏺';
    emptyState.querySelector('div:last-child').innerHTML = allActions.length > 0
      ? 'Không có action nào khớp bộ lọc'
      : `Nhấn <strong>Start</strong> để bắt đầu ghi lại`;
    return;
  }

  renderVisibleItems();
}

// Scroll listener for virtual scroll
actionsList.addEventListener('scroll', renderVisibleItems);

// ─────────────────────────────────────────────
//  RECORDING CONTROLS
// ─────────────────────────────────────────────

function setRecordingState(recording) {
  isRecording = recording;

  if (recording) {
    btnRecord.textContent = '⏹';
    btnRecord.className = 'btn btn-stop';
    logoDot.classList.remove('stopped');
    statusText.innerHTML = '<span class="status-recording">● Đang ghi...</span>';
    persistToggle.disabled = true;
  } else {
    btnRecord.textContent = '▶';
    btnRecord.className = 'btn btn-record';
    logoDot.classList.add('stopped');
    statusText.textContent = '⏹ Đã dừng';
    persistToggle.disabled = false;
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

function getActionsForCopy() {
  // Reuse cached filteredActions (đã reversed), reverse lại về chronological
  let filtered = [...filteredActions].reverse();

  if (!consoleToggle.checked) {
    filtered = filtered.filter(a => a.type !== 'console');
  } else if (consoleFilter) {
    const keyword = consoleFilter.toLowerCase();
    filtered = filtered.filter(a => {
      if (a.type !== 'console') return true;
      const text = (a.args || []).join(' ').toLowerCase();
      return text.includes(keyword);
    });
  }

  return filtered.map(a => {
    if (a.type !== 'console') return a;
    // Ước lượng nhanh bằng length thay vì JSON.stringify từng item
    const len = (a.args || []).reduce((sum, arg) => sum + String(arg).length, 0);
    if (len <= 1500) return a; // ~1500 chars ≈ ~375 tokens + overhead < 500
    return { ...a, args: ['...'], truncated: true };
  });
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function formatTokenCount(tokens) {
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(tokens);
}

function copyAndToast(text) {
  navigator.clipboard.writeText(text).then(() => {
    copiedToast.classList.add('show');
    setTimeout(() => copiedToast.classList.remove('show'), 2000);
  });
}

btnCopy.addEventListener('click', () => {
  copyAndToast(JSON.stringify(getActionsForCopy()));
});

btnCopyPretty.addEventListener('click', () => {
  copyAndToast(JSON.stringify(getActionsForCopy(), null, 2));
});

// ─────────────────────────────────────────────
//  FILTER CHIPS
// ─────────────────────────────────────────────

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    chrome.storage.local.set({ activeFilter });
    render();
  });
});

// ─────────────────────────────────────────────
//  CONSOLE TOGGLE & FILTER
// ─────────────────────────────────────────────

consoleToggle.addEventListener('change', () => {
  const enabled = consoleToggle.checked;
  consoleFilterBar.classList.toggle('visible', enabled);
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
//  PERSIST TOGGLE
// ─────────────────────────────────────────────

persistToggle.addEventListener('change', () => {
  if (isRecording) {
    persistToggle.checked = persistMode;
    return;
  }

  const enabled = persistToggle.checked;
  chrome.runtime.sendMessage(
    { type: 'SET_PERSIST_MODE', payload: { enabled } },
    (response) => {
      if (response && response.error) {
        persistToggle.checked = persistMode;
        return;
      }
      persistMode = enabled;
    }
  );
});

// ─────────────────────────────────────────────
//  THEME TOGGLE
// ─────────────────────────────────────────────

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
    btnTheme.textContent = getSystemTheme() === 'dark' ? '☀️' : '🌙';
    btnTheme.title = 'Theo hệ thống — nhấn để chuyển';
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
    btnTheme.title = theme === 'dark' ? 'Chuyển sang Light' : 'Chuyển sang Dark';
  }
}

// Cycle: system → dark → light → system
btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  let next;
  if (!current) {
    next = getSystemTheme() === 'dark' ? 'light' : 'dark';
  } else if (current === 'dark') {
    next = 'light';
  } else {
    next = 'system';
  }
  chrome.storage.local.set({ theme: next });
  applyTheme(next);
});

// ─────────────────────────────────────────────
//  LOAD STATE ON OPEN
// ─────────────────────────────────────────────

chrome.storage.local.get(['actions', 'isRecording', 'captureConsole', 'theme', 'activeFilter', 'persistMode'], (result) => {
  applyTheme(result.theme || 'system');
  persistMode = result.persistMode || false;
  persistToggle.checked = persistMode;
  setRecordingState(result.isRecording || false);
  consoleToggle.checked = result.captureConsole || false;
  consoleFilterBar.classList.toggle('visible', consoleToggle.checked);

  const savedFilter = result.activeFilter || 'all';
  activeFilter = savedFilter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const targetChip = document.querySelector(`.filter-chip[data-filter="${savedFilter}"]`);
  if (targetChip) {
    targetChip.classList.add('active');
  }

  if (persistMode) {
    allActions = result.actions || [];
    render();
  } else {
    chrome.runtime.sendMessage({ type: 'GET_ACTIONS' }, (response) => {
      if (response && response.actions) {
        allActions = response.actions;
      }
      render();
    });
  }
});

// ─────────────────────────────────────────────
//  LIVE UPDATES — chỉ append items mới, không full re-render
// ─────────────────────────────────────────────

setInterval(() => {
  const fetchActions = (cb) => {
    if (persistMode) {
      chrome.storage.local.get(['actions'], (result) => cb(result.actions || []));
    } else {
      chrome.runtime.sendMessage({ type: 'GET_ACTIONS' }, (response) => {
        if (chrome.runtime.lastError) return;
        cb((response && response.actions) || []);
      });
    }
  };

  fetchActions((newActions) => {
    if (newActions.length !== allActions.length) {
      allActions = newActions;
      // Incremental update: chỉ rebuild filtered list và re-render visible
      filteredActions = [...getFilteredActions()].reverse();
      updateStats();
      lastRenderedRange = { start: -1, end: -1 };
      if (filteredActions.length > 0) {
        renderVisibleItems();
      } else {
        render();
      }
    }
  });
}, 500);
