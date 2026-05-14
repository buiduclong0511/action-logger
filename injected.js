// ─────────────────────────────────────────────
//  INJECTED SCRIPT — Chạy trong main world của trang
//  Chỉ override console.* khi đang record, restore lại khi stop
//  để DevTools hiển thị đúng vị trí log thật khi không record.
// ─────────────────────────────────────────────

(() => {
  if (window.__action_logger_loaded__) return;
  window.__action_logger_loaded__ = true;

  const METHODS = ['log', 'warn', 'error', 'info', 'debug'];
  const originals = {};
  METHODS.forEach(m => { originals[m] = console[m]; });

  let active = false;

  /**
   * Serialize argument an toàn — tránh circular reference và object quá lớn
   */
  function safeSerialize(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';

    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}`;
    }

    if (typeof arg === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }

    if (typeof arg === 'object') {
      try {
        const seen = new WeakSet();
        return JSON.stringify(arg, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
          }
          if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
          return value;
        }, 2);
      } catch {
        return String(arg);
      }
    }

    return String(arg);
  }

  function onError(event) {
    window.dispatchEvent(new CustomEvent('__action_logger_console__', {
      detail: {
        method: 'error',
        args: [`Uncaught ${event.error ? `${event.error.name}: ${event.error.message}` : event.message}`],
        timestamp: Date.now(),
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
        isUncaught: true,
      },
    }));
  }

  function onRejection(event) {
    const reason = event.reason instanceof Error
      ? `${event.reason.name}: ${event.reason.message}`
      : safeSerialize(event.reason);

    window.dispatchEvent(new CustomEvent('__action_logger_console__', {
      detail: {
        method: 'error',
        args: [`Unhandled Promise Rejection: ${reason}`],
        timestamp: Date.now(),
        isUncaught: true,
      },
    }));
  }

  function overrideConsole() {
    METHODS.forEach(method => {
      console[method] = function (...args) {
        originals[method].apply(console, args);

        try {
          const serializedArgs = args.map(safeSerialize);
          window.dispatchEvent(new CustomEvent('__action_logger_console__', {
            detail: {
              method,
              args: serializedArgs,
              timestamp: Date.now(),
            },
          }));
        } catch {
          // Không để lỗi serialize ảnh hưởng console gốc
        }
      };
    });
  }

  function restoreConsole() {
    METHODS.forEach(method => {
      console[method] = originals[method];
    });
  }

  function start() {
    if (active) return;
    active = true;
    overrideConsole();
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  }

  function stop() {
    if (!active) return;
    active = false;
    restoreConsole();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  }

  window.addEventListener('__action_logger_start__', start);
  window.addEventListener('__action_logger_stop__', stop);
})();
