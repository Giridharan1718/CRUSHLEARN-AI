import { Link } from 'react-router-dom';

const TONE_STYLES = {
  empty: 'border-line bg-surface-muted text-ink-muted',
  loading: 'border-info/30 bg-info-soft/40 text-info',
  error: 'border-danger/30 bg-danger-soft/40 text-danger',
  success: 'border-success/30 bg-success-soft/40 text-success',
  info: 'border-line bg-surface-muted text-ink-muted',
};

const ICONS = {
  empty: '○',
  loading: '◌',
  error: '!',
  success: '✓',
  info: 'i',
};

/**
 * Shared, honest state surface for every panel.
 *
 * A panel should use one of these states rather than rendering nothing. The
 * `action` is a real next step; it is never a decorative retry for work the app
 * cannot perform.
 */
export default function PanelState({
  tone = 'empty',
  title,
  children,
  action = null,
  actionTo = '',
  actionLabel = '',
  role = null,
  className = '',
}) {
  const style = TONE_STYLES[tone] || TONE_STYLES.empty;
  const resolvedRole = role || (tone === 'error' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      aria-live={resolvedRole === 'status' ? 'polite' : undefined}
      className={`rounded-xl border p-4 text-sm ${style} ${className}`}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-[11px] font-bold"
        >
          {ICONS[tone] || ICONS.empty}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title}</p>
          {children ? <div className="mt-1 leading-6">{children}</div> : null}
          {action ? (
            <button
              type="button"
              onClick={action}
              className="mt-3 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {actionLabel || 'Try again'}
            </button>
          ) : null}
          {actionTo && actionLabel ? (
            <Link
              to={actionTo}
              className="mt-3 inline-block rounded-lg border border-current px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
