import type { AppNotification } from "@/lib/notifications";

export type NotificationSnapshot = {
  items: AppNotification[];
  unreadCount: number;
};

export function replaceNotificationItems(
  snapshot: NotificationSnapshot,
  items: AppNotification[],
): NotificationSnapshot {
  return { ...snapshot, items };
}

// The unread count is server-authoritative because the feed is deliberately
// capped. These helpers only apply the exact delta of a locally displayed row.
export function markNotificationReadInSnapshot(
  snapshot: NotificationSnapshot,
  id: string,
  readAt: string,
): NotificationSnapshot {
  const notification = snapshot.items.find((item) => item.id === id);
  const items = snapshot.items.map((item) =>
    item.id === id && item.readAt === null ? { ...item, readAt } : item,
  );
  return {
    items,
    unreadCount:
      notification?.readAt === null ? Math.max(0, snapshot.unreadCount - 1) : snapshot.unreadCount,
  };
}

export function markAllNotificationsReadInSnapshot(
  snapshot: NotificationSnapshot,
  readAt: string,
): NotificationSnapshot {
  return {
    items: snapshot.items.map((item) => (item.readAt === null ? { ...item, readAt } : item)),
    unreadCount: 0,
  };
}

// Preview-only projection for the bell dropdown: unread items only, capped at
// `limit`. The full snapshot (`items`) is untouched — the /dashboard/notifications
// history page reads the same snapshot and must keep showing read+unread rows.
// Filters before slicing so a read item never displaces an unread one from the
// capped preview.
export function selectUnreadPreview(
  items: AppNotification[],
  limit: number,
): AppNotification[] {
  return items.filter((item) => item.readAt === null).slice(0, limit);
}
