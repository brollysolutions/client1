// Web Push service worker. Plain JS, no build step, no PWA framework — this
// is scoped to push delivery only, not full offline/installable PWA support.
//
// The payload shape is set by services/push.py::send_to_user on the backend:
// { title, body, href }. `href` may be null (falls back to the notifications
// feed).

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, href } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/push-icon-192.png",
      badge: "/icons/push-badge-96.png",
      data: { href: href || "/dashboard/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.href;
  if (!targetUrl) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const existingClient of clientList) {
        const clientUrl = new URL(existingClient.url);
        if (clientUrl.origin === self.location.origin && "focus" in existingClient) {
          existingClient.navigate(targetUrl);
          return existingClient.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
