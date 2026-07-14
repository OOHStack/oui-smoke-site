"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type PushState = "loading" | "unsupported" | "denied" | "off" | "on" | "error";

export default function PushEnable() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) {
        setState("error");
        return;
      }
      const { publicKey } = await vapidRes.json();

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) {
        setState("error");
        return;
      }

      setState("on");
    } catch (err) {
      console.error(err);
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <span className="admin-nav-link" title="Notifications blocked in browser settings">
        Push blocked
      </span>
    );
  }

  if (state === "on") {
    return (
      <button
        type="button"
        className="admin-nav-link"
        disabled={busy}
        onClick={disable}
        title="Turn off push alerts on this device"
      >
        Push on
      </button>
    );
  }

  return (
    <button
      type="button"
      className="admin-nav-link"
      disabled={busy}
      onClick={enable}
      title="Get alerts when guests request help — even if this tab is closed"
    >
      {state === "error" ? "Retry push" : "Enable push"}
    </button>
  );
}
