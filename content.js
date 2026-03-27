(() => {
  // ─────────────────────────────────────────────
  //  INJECT CONSOLE CAPTURE SCRIPT INTO MAIN WORLD
  // ─────────────────────────────────────────────
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // ─────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────
  let isRecording = false;
  let lastUserActionTime = 0;
  let lastUserActionSelector = null;
  let lastRecordedUrl = null; // chỉ gửi url khi thay đổi
  const AUTO_CAUSE_WINDOW_MS = 500; // nếu mutation xảy ra trong 500ms sau user action → gán causedBy

  // ─────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────

  /**
   * Tạo CSS selector tốt nhất có thể cho 1 element
   */
  function getSelector(el) {
    if (!el || el === document.body) return 'body';

    // Ưu tiên id
    if (el.id) return `#${el.id}`;

    // Ưu tiên name attribute (phổ biến với form fields)
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;

    // Ưu tiên data-testid / data-cy / aria-label
    for (const attr of ['data-testid', 'data-cy', 'aria-label']) {
      if (el.getAttribute(attr)) {
        return `${el.tagName.toLowerCase()}[${attr}="${el.getAttribute(attr)}"]`;
      }
    }

    // Fallback: tag + class
    const classes = Array.from(el.classList).slice(0, 2).join('.');
    const tag = el.tagName.toLowerCase();
    if (classes) return `${tag}.${classes}`;

    // Cuối cùng: nth-child
    const parent = el.parentElement;
    if (parent) {
      const index = Array.from(parent.children).indexOf(el) + 1;
      return `${getSelector(parent)} > ${tag}:nth-child(${index})`;
    }

    return tag;
  }

  /**
   * Lấy value hiện tại của một element
   */
  function getValue(el) {
    if (!el) return null;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.tagName === 'SELECT') {
      return Array.from(el.selectedOptions).map(o => o.value);
    }
    return el.value ?? el.textContent?.trim() ?? null;
  }

  /**
   * Gửi action lên background script
   */
  function sendAction(action) {
    if (!isRecording) return;
    const enriched = {
      ...action,
    };
    chrome.runtime.sendMessage({ type: 'ADD_ACTION', payload: enriched });
  }

  /**
   * Gửi item navigate khi URL thay đổi (SPA hoặc page load)
   */
  function emitNavigateIfChanged() {
    if (!isRecording) return;
    const currentUrl = window.location.href;
    if (currentUrl === lastRecordedUrl) return;

    const nav = {
      type: 'navigate',
      trigger: 'system',
      ...(lastRecordedUrl ? { from: lastRecordedUrl } : {}),
      to: currentUrl,
    };
    lastRecordedUrl = currentUrl;
    chrome.runtime.sendMessage({ type: 'ADD_ACTION', payload: nav });
  }

  // ─────────────────────────────────────────────
  //  EVENT LISTENERS — User-triggered actions
  // ─────────────────────────────────────────────

  function onPointerUp(e) {
    const el = e.target;
    if (!el) return;

    const tag = el.tagName.toLowerCase();
    const isInteractive = ['button', 'a', 'input', 'select', 'textarea', 'label'].includes(tag)
      || el.getAttribute('role') === 'button'
      || el.getAttribute('onclick') !== null
      || el.tabIndex >= 0;

    if (!isInteractive) return;

    lastUserActionTime = Date.now();
    lastUserActionSelector = getSelector(el);

    sendAction({
      type: 'click',
      trigger: 'user',
      selector: lastUserActionSelector,
      tagName: tag,
      text: el.innerText?.trim().slice(0, 80) || null,
      href: el.href || null,
    });
  }

  function onInput(e) {
    const el = e.target;
    if (!['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())) return;

    lastUserActionTime = Date.now();
    lastUserActionSelector = getSelector(el);

    sendAction({
      type: 'input',
      trigger: 'user',
      selector: lastUserActionSelector,
      inputType: el.type || el.tagName.toLowerCase(),
      value: getValue(el),
    });
  }

  function onKeyDown(e) {
    const key = e.key;
    if (!['Enter', 'Escape', 'Tab'].includes(key)) return;

    lastUserActionTime = Date.now();
    lastUserActionSelector = getSelector(e.target);

    sendAction({
      type: 'keydown',
      trigger: 'user',
      key,
      selector: lastUserActionSelector,
    });
  }

  function onScroll() {
    sendAction({
      type: 'scroll',
      trigger: 'user',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });
  }

  // ─────────────────────────────────────────────
  //  MUTATION OBSERVER — Auto-generated changes
  // ─────────────────────────────────────────────

  const observedValues = new WeakMap(); // lưu value cũ của mỗi input

  /**
   * Snapshot value ban đầu của tất cả input hiện có
   */
  function snapshotExistingInputs() {
    document.querySelectorAll('input, textarea, select').forEach(el => {
      observedValues.set(el, getValue(el));
    });
  }

  /**
   * Kiểm tra xem mutation này có phải do user thực hiện gần đây không
   */
  function getCausedBy() {
    const timeSinceUserAction = Date.now() - lastUserActionTime;
    if (timeSinceUserAction <= AUTO_CAUSE_WINDOW_MS && lastUserActionSelector) {
      return lastUserActionSelector;
    }
    return null;
  }

  const mutationObserver = new MutationObserver((mutations) => {
    if (!isRecording) return;

    for (const mutation of mutations) {
      const target = mutation.target;

      // ── Theo dõi thay đổi attribute (value, checked, disabled, hidden...)
      if (mutation.type === 'attributes') {
        const attr = mutation.attributeName;
        const newVal = target.getAttribute(attr);
        const oldVal = mutation.oldValue;

        // Bỏ qua nếu không thay đổi thực sự
        if (newVal === oldVal) continue;

        // Bỏ qua style thay đổi liên tục (quá noisy)
        if (attr === 'style') continue;

        const causedBy = getCausedBy();

        // Với class attribute → chỉ log diff thay vì full string (tiết kiệm token)
        if (attr === 'class') {
          const oldClasses = oldVal ? oldVal.split(/\s+/).filter(Boolean) : [];
          const newClasses = newVal ? newVal.split(/\s+/).filter(Boolean) : [];
          const added = newClasses.filter(c => !oldClasses.includes(c));
          const removed = oldClasses.filter(c => !newClasses.includes(c));

          // Bỏ qua nếu diff rỗng (chỉ thay đổi whitespace)
          if (added.length === 0 && removed.length === 0) continue;

          sendAction({
            type: 'dom_mutation',
            trigger: causedBy ? 'auto' : 'unknown',
            mutationKind: 'attribute',
            selector: getSelector(target),
            attribute: 'class',
            classChange: {
              ...(added.length > 0 && { added }),
              ...(removed.length > 0 && { removed }),
            },
            ...(causedBy && { causedBy }),
          });
          continue;
        }

        sendAction({
          type: 'dom_mutation',
          trigger: causedBy ? 'auto' : 'unknown',
          mutationKind: 'attribute',
          selector: getSelector(target),
          attribute: attr,
          oldValue: oldVal,
          newValue: newVal,
          ...(causedBy && { causedBy }),
        });
      }

      // ── Theo dõi thay đổi text content (label, span, error message...)
      if (mutation.type === 'characterData') {
        const el = mutation.target.parentElement;
        const tag = el?.tagName?.toLowerCase();

        // Chỉ quan tâm các element phổ biến trong form
        if (!['span', 'p', 'label', 'div', 'small', 'em', 'strong'].includes(tag)) continue;

        const causedBy = getCausedBy();
        sendAction({
          type: 'dom_mutation',
          trigger: causedBy ? 'auto' : 'unknown',
          mutationKind: 'textContent',
          selector: getSelector(el),
          oldValue: mutation.oldValue,
          newValue: mutation.target.textContent,
          ...(causedBy && { causedBy }),
        });
      }

      // ── Theo dõi thêm/xóa element khỏi DOM
      if (mutation.type === 'childList') {
        const causedBy = getCausedBy();

        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return; // chỉ elements

          // Snapshot input mới
          node.querySelectorAll?.('input, textarea, select').forEach(el => {
            observedValues.set(el, getValue(el));
          });

          // Log element được thêm vào DOM
          const text = node.textContent?.trim().slice(0, 120) || '';
          if (!text) return; // bỏ qua node rỗng

          sendAction({
            type: 'dom_mutation',
            trigger: causedBy ? 'auto' : 'unknown',
            mutationKind: 'childList:added',
            selector: getSelector(node),
            parentSelector: getSelector(mutation.target),
            tagName: node.tagName?.toLowerCase(),
            text,
            ...(causedBy && { causedBy }),
          });
        });

        mutation.removedNodes.forEach(node => {
          if (node.nodeType !== 1) return;

          const text = node.textContent?.trim().slice(0, 120) || '';
          if (!text) return;

          sendAction({
            type: 'dom_mutation',
            trigger: causedBy ? 'auto' : 'unknown',
            mutationKind: 'childList:removed',
            parentSelector: getSelector(mutation.target),
            tagName: node.tagName?.toLowerCase(),
            text,
            ...(causedBy && { causedBy }),
          });
        });
      }
    }
  });

  /**
   * Dùng polling để phát hiện .value thay đổi qua JavaScript
   * (MutationObserver KHÔNG bắt được khi JS set input.value trực tiếp)
   */
  let pollingInterval = null;

  function startValuePolling() {
    pollingInterval = setInterval(() => {
      if (!isRecording) return;

      document.querySelectorAll('input, textarea, select').forEach(el => {
        const currentValue = getValue(el);
        const previousValue = observedValues.get(el);

        // Element mới chưa được snapshot
        if (previousValue === undefined) {
          observedValues.set(el, currentValue);
          return;
        }

        // Không thay đổi
        if (JSON.stringify(currentValue) === JSON.stringify(previousValue)) return;

        // Đã thay đổi → cập nhật snapshot
        observedValues.set(el, currentValue);

        const causedBy = getCausedBy();

        sendAction({
          type: 'dom_mutation',
          trigger: causedBy ? 'auto' : 'unknown',
          mutationKind: 'value',
          selector: getSelector(el),
          fieldName: el.name || el.id || null,
          oldValue: previousValue,
          newValue: currentValue,
          ...(causedBy && { causedBy }),
        });
      });
    }, 150); // poll mỗi 150ms
  }

  function stopValuePolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // ─────────────────────────────────────────────
  //  CONSOLE CAPTURE LISTENER
  // ─────────────────────────────────────────────

  function onConsoleCapture(e) {
    const { method, args, source, isUncaught } = e.detail;

    sendAction({
      type: 'console',
      trigger: 'auto',
      method,
      args,
      ...(source && { source }),
      ...(isUncaught && { isUncaught }),
    });
  }

  // ─────────────────────────────────────────────
  //  START / STOP RECORDING
  // ─────────────────────────────────────────────

  // ── SPA Navigation detection ──
  // Monkey-patch pushState/replaceState để detect SPA navigation
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    emitNavigateIfChanged();
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    emitNavigateIfChanged();
  };

  function onPopState() {
    emitNavigateIfChanged();
  }

  function startRecording() {
    isRecording = true;
    lastRecordedUrl = null; // reset để url đầu tiên luôn được ghi
    snapshotExistingInputs();

    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('__action_logger_console__', onConsoleCapture);
    window.addEventListener('popstate', onPopState);

    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    });

    startValuePolling();

    // Ghi URL ban đầu rồi recording_started
    emitNavigateIfChanged();
    sendAction({ type: 'recording_started', trigger: 'system' });
  }

  function stopRecording() {
    isRecording = false;

    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onScroll);
    window.removeEventListener('__action_logger_console__', onConsoleCapture);
    window.removeEventListener('popstate', onPopState);

    mutationObserver.disconnect();
    stopValuePolling();
  }

  // ─────────────────────────────────────────────
  //  LISTEN TO MESSAGES FROM POPUP / BACKGROUND
  // ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START_RECORDING') startRecording();
    if (msg.type === 'STOP_RECORDING') stopRecording();
    if (msg.type === 'GET_STATUS') {
      chrome.runtime.sendMessage({ type: 'STATUS', payload: { isRecording } });
    }
  });

  // Kiểm tra trạng thái từ storage khi trang load
  chrome.storage.local.get(['isRecording'], (result) => {
    if (result.isRecording) startRecording();
  });

})();
