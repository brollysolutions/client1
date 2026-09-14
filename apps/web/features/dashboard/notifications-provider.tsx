"use client";

import * as React from "react";

import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import {
  markAllNotificationsReadInSnapshot,
  markNotificationReadInSnapshot,
  replaceNotificationItems,
  type NotificationSnapshot,
} from "@/lib/notification-state";

type FeedStatus = "idle" | "loading" | "ready" | "error";

type NotificationsContextValue = NotificationSnapshot & {
  feedStatus: FeedStatus;
  feedError: string | null;
  feedErrorStatus: number | null;
  loadNotifications: (force?: boolean) => Promise<void>;
  markRead: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
};

const NotificationsContext = React.createContext<NotificationsContextValue | null>(null);

const EMPTY_SNAPSHOT: NotificationSnapshot = { items: [], unreadCount: 0 };

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<NotificationSnapshot>(EMPTY_SNAPSHOT);
  const snapshotRef = React.useRef(snapshot);
  const [feedStatus, setFeedStatus] = React.useState<FeedStatus>("idle");
  const feedStatusRef = React.useRef<FeedStatus>("idle");
  const unreadCountRequestRef = React.useRef(0);
  const pendingReads = React.useRef(new Set<string>());
  const [feedError, setFeedError] = React.useState<string | null>(null);
  const [feedErrorStatus, setFeedErrorStatus] = React.useState<number | null>(null);

  const updateSnapshot = React.useCallback((next: NotificationSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const updateFeedStatus = React.useCallback((next: FeedStatus) => {
    feedStatusRef.current = next;
    setFeedStatus(next);
  }, []);

  const refreshUnreadCount = React.useCallback(async () => {
    const requestId = ++unreadCountRequestRef.current;
    const result = await getUnreadCount();
    if (result.ok && requestId === unreadCountRequestRef.current) {
      updateSnapshot({ ...snapshotRef.current, unreadCount: result.data });
    }
  }, [updateSnapshot]);

  React.useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  const loadNotifications = React.useCallback(
    async (force = false) => {
      if (!force && (feedStatusRef.current === "loading" || feedStatusRef.current === "ready")) return;

      updateFeedStatus("loading");
      setFeedError(null);
      setFeedErrorStatus(null);
      const unreadCountRequestId = ++unreadCountRequestRef.current;
      const [notifications, unreadCount] = await Promise.all([getNotifications(), getUnreadCount()]);

      if (!notifications.ok) {
        setFeedError(notifications.error);
        setFeedErrorStatus(notifications.status);
        updateFeedStatus("error");
        return;
      }

      updateSnapshot(replaceNotificationItems(snapshotRef.current, notifications.data));
      if (unreadCount.ok && unreadCountRequestId === unreadCountRequestRef.current) {
        updateSnapshot({ ...snapshotRef.current, unreadCount: unreadCount.data });
      }
      updateFeedStatus("ready");
    },
    [updateFeedStatus, updateSnapshot],
  );

  const markRead = React.useCallback(
    async (id: string) => {
      const before = snapshotRef.current;
      const original = before.items.find((item) => item.id === id);
      if (pendingReads.current.has(id) || original?.readAt) return true;
      pendingReads.current.add(id);
      unreadCountRequestRef.current += 1;
      const optimistic = markNotificationReadInSnapshot(before, id, new Date().toISOString());
      updateSnapshot(optimistic);

      const result = await markNotificationRead(id);
      pendingReads.current.delete(id);
      if (!result.ok) {
        // Restore only this row: another notification may have been opened
        // successfully while this request was in flight.
        const current = snapshotRef.current;
        updateSnapshot({
          items: current.items.map((item) => item.id === id && original ? original : item),
          unreadCount: current.unreadCount + (original?.readAt === null ? 1 : 0),
        });
        if (pendingReads.current.size === 0) await refreshUnreadCount();
        return false;
      }

      updateSnapshot(
        replaceNotificationItems(snapshotRef.current, snapshotRef.current.items.map((item) =>
          item.id === id ? result.data : item,
        )),
      );
      if (pendingReads.current.size === 0) await refreshUnreadCount();
      return true;
    },
    [refreshUnreadCount, updateSnapshot],
  );

  const markAllRead = React.useCallback(async () => {
    const before = snapshotRef.current;
    unreadCountRequestRef.current += 1;
    updateSnapshot(markAllNotificationsReadInSnapshot(before, new Date().toISOString()));

    const result = await markAllNotificationsRead();
    if (!result.ok) {
      updateSnapshot(before);
      await refreshUnreadCount();
      return false;
    }

    await refreshUnreadCount();
    return true;
  }, [refreshUnreadCount, updateSnapshot]);

  const value = React.useMemo<NotificationsContextValue>(
    () => ({
      ...snapshot,
      feedStatus,
      feedError,
      feedErrorStatus,
      loadNotifications,
      markRead,
      markAllRead,
    }),
    [feedError, feedErrorStatus, feedStatus, loadNotifications, markAllRead, markRead, snapshot],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const value = React.useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used within NotificationsProvider.");
  return value;
}
