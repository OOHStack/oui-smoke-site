"use client";

import { useEffect, useRef } from "react";

/**
 * Subscribe to a same-origin SSE endpoint. Reconnects automatically via EventSource.
 */
export function useSse<T>(
  url: string | null,
  onData: (data: T) => void,
  enabled = true,
) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!enabled || !url) return;

    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as T;
          onDataRef.current(data);
        } catch {
          /* ignore bad frame */
        }
      };
      es.onerror = () => {
        // EventSource reconnects; if permanently closed, recreate after delay
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      es?.close();
    };
  }, [url, enabled]);
}
