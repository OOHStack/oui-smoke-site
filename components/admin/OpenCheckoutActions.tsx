"use client";

/** Open + copy helpers for staff floor UI. */
export function OpenCheckoutActions({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  return (
    <div className={className ?? "checkout-link-actions"}>
      <a
        className="btn btn-sm"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open pay link
      </a>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => {
          void navigator.clipboard.writeText(url);
        }}
      >
        Copy link
      </button>
    </div>
  );
}
