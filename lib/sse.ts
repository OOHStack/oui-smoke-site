import { NextResponse } from "next/server";

export type SsePollOptions = {
  /** How often to re-query the DB (ms). Default 1500. */
  intervalMs?: number;
  /** Heartbeat comment interval (ms). Default 15000. */
  heartbeatMs?: number;
  /** Produce the JSON-serializable payload for each tick. */
  getPayload: () => Promise<unknown>;
  /** AbortSignal from the request (client disconnect). */
  signal: AbortSignal;
};

/**
 * Long-lived text/event-stream response.
 * Emits `data:` only when the payload JSON changes; sends `: ping` heartbeats.
 * Replaces client polling on Vercel (native WebSockets aren't available on serverless).
 */
export function createSseResponse(options: SsePollOptions) {
  const intervalMs = options.intervalMs ?? 1500;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const encoder = new TextEncoder();
  let lastJson = "";
  let lastHeartbeat = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* closed */
        }
      };

      send(`retry: 2000\n\n`);

      const tick = async () => {
        if (options.signal.aborted) return false;
        try {
          const payload = await options.getPayload();
          const json = JSON.stringify(payload);
          if (json !== lastJson) {
            lastJson = json;
            send(`data: ${json}\n\n`);
          }
          const now = Date.now();
          if (now - lastHeartbeat >= heartbeatMs) {
            lastHeartbeat = now;
            send(`: ping ${now}\n\n`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "stream error";
          send(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        }
        return !options.signal.aborted;
      };

      await tick();

      while (!options.signal.aborted) {
        await sleep(intervalMs, options.signal);
        if (options.signal.aborted) break;
        const ok = await tick();
        if (!ok) break;
      }

      try {
        controller.close();
      } catch {
        /* ignore */
      }
    },
    cancel() {
      /* client gone */
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
