/* Oui Smoke ops — Web Push service worker */
self.addEventListener("push", (event) => {
  let data = {
    title: "Oui Smoke",
    body: "Guest needs help",
    url: "/admin/live",
    tag: "oui-service",
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* ignore bad payload */
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Oui Smoke", {
      body: data.body || "Guest service call",
      icon: "/logo-white.png",
      badge: "/logo-white.png",
      tag: data.tag || "oui-service",
      renotify: true,
      data: { url: data.url || "/admin/live" },
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/live";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
