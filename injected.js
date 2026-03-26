// ─────────────────────────────────────────────
//  INJECTED SCRIPT — Chạy trong main world của trang
//  Override console methods, gửi data về content script qua CustomEvent
// ─────────────────────────────────────────────

(() => {
  const METHODS = ['log', 'warn', 'error', 'info', 'debug'];
  const originals = {};

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

  METHODS.forEach(method => {
    originals[method] = console[method];

    console[method] = function (...args) {
      // Gọi console gốc trước
      originals[method].apply(console, args);

      // Gửi event về content script
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

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    window.dispatchEvent(new CustomEvent('__action_logger_console__', {
      detail: {
        method: 'error',
        args: [`Uncaught ${event.error ? `${event.error.name}: ${event.error.message}` : event.message}`],
        timestamp: Date.now(),
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
        isUncaught: true,
      },
    }));
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
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
  });
})();
