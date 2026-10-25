import { useEffect, useRef, useState } from 'react';

export const TOAST_EVENT = 'crushlearn-toast';
const MAX_VISIBLE_TOASTS = 3;

const TONE_STYLES = {
  info: 'border-line bg-surface text-ink',
  success: 'border-success/50 bg-success-soft text-success',
  warning: 'border-warning/50 bg-warning-soft text-warning',
  danger: 'border-danger/50 bg-danger-soft text-danger',
};

const TONE_ICONS = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  danger: '⛔',
};

let toastSequence = 0;

/**
 * Fire a transient status toast. Dispatches a custom window event so any part
 * of the app (including non-React helpers) can raise a toast without prop
 * drilling. Nothing is persisted; toasts never carry learning data.
 */
export function showToast(message, { tone = 'info', duration = 4000 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  if (!message || typeof message !== 'string') return null;

  toastSequence += 1;
  const toast = {
    id: `toast_${Date.now()}_${toastSequence}`,
    message,
    tone: TONE_STYLES[tone] ? tone : 'info',
    duration: Math.min(Math.max(duration, 1500), 10_000),
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: toast }));
  return toast.id;
}

const ToastHost = () => {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleToast = (event) => {
      const toast = event.detail;
      if (!toast || !toast.id) return;

      setToasts((current) => [...current.slice(-(MAX_VISIBLE_TOASTS - 1)), toast]);

      const timeout = window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
        timeoutsRef.current.delete(toast.id);
      }, toast.duration || 4000);
      timeoutsRef.current.set(toast.id, timeout);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast);
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const dismiss = (id) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border p-3 text-sm shadow-soft transition ${
            TONE_STYLES[toast.tone] || TONE_STYLES.info
          }`}
        >
          <span aria-hidden="true">{TONE_ICONS[toast.tone] || TONE_ICONS.info}</span>
          <p className="flex-1 break-words">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded px-1 text-ink-subtle transition hover:text-ink"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;
