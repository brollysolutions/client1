import { describe, expect, it } from "vitest";

import type { AppNotification } from "@/lib/notifications";

import {
  markAllNotificationsReadInSnapshot,
  markNotificationReadInSnapshot,
  selectUnreadPreview,
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

describe("selectUnreadPreview", () => {
  it("filters out read items", () => {
    expect(selectUnreadPreview([unread, read], 5)).toEqual([unread]);
  });

  it("returns an empty list once every item is read (post mark-all-read state)", () => {
    const allRead = [unread, read].map((item) => ({ ...item, readAt: "2026-08-12T01:00:00Z" }));
    expect(selectUnreadPreview(allRead, 5)).toEqual([]);
  });

  it("caps at the limit after filtering, not before", () => {
    // A naive slice-then-filter would under-fill the preview if a read item
    // occupied one of the first `limit` slots. Filter-then-slice must not.
    const items: AppNotification[] = [
      read,
      ...Array.from({ length: 6 }, (_, i) => ({ ...unread, id: `unread-${i}` })),
    ];

    const preview = selectUnreadPreview(items, 5);

    expect(preview).toHaveLength(5);
    expect(preview.every((item) => item.readAt === null)).toBe(true);
  });
});
