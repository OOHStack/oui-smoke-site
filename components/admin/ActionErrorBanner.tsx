"use client";

/** Inline staff action error with optional one-tap retry. */
export default function ActionErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="action-error" role="alert">
      <p className="action-error__msg">{message}</p>
      <div className="action-error__actions">
        {onRetry ? (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
