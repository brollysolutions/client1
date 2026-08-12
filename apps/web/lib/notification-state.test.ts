import { describe, expect, it } from "vitest";

import type { AppNotification } from "@/lib/notifications";

import {
  markAllNotificationsReadInSnapshot,
  markNotificationReadInSnapshot,
} from "./notification-state";

const unread: AppNotification = {
  id: "unread",
  type: "support_ticket_received",
  title: "Unread",
  body: "Body",
  href: "/dashboard/support",
  readAt: null,
  createdAt: "2026-08-12T00:00:00Z",
};

const read: AppNotification = { ...unread, id: "read", readAt: "2026-08-11T00:00:00Z" };

describe("notification unread state", () => {
  it("updates a displayed notification and the server-backed bell count together", () => {
    const result = markNotificationReadInSnapshot(
      { items: [unread, read], unreadCount: 8 },
      unread.id,
      "2026-08-12T01:00:00Z",
    );

    expect(result.items[0].readAt).toBe("2026-08-12T01:00:00Z");
    expect(result.unreadCount).toBe(7);
  });

  it("does not decrement the bell count when a row was already read", () => {
    const result = markNotificationReadInSnapshot(
      { items: [unread, read], unreadCount: 8 },
      read.id,
      "2026-08-12T01:00:00Z",
    );

    expect(result.unreadCount).toBe(8);
  });

  it("marks the preview and page rows read while clearing the shared count", () => {
    const result = markAllNotificationsReadInSnapshot(
      { items: [unread, read], unreadCount: 8 },
      "2026-08-12T01:00:00Z",
    );

    expect(result.items.every((item) => item.readAt !== null)).toBe(true);
    expect(result.unreadCount).toBe(0);
  });
});
