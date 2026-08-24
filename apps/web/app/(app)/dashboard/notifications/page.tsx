"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatNotificationTime, NOTIFICATION_TYPE_ICON } from "@/features/dashboard/notification-presenter";
import { useNotifications } from "@/features/dashboard/notifications-provider";
import { isSafeLocalHref } from "@/lib/safe-local-href";
import { cn } from "@/lib/utils";

// Notification feed backed by the real notifications API: site-visit
// create/cancel and support-ticket create each emit one entry server-side.
export default function NotificationsPage() {
  const {
    items,
    unreadCount,
    feedStatus: status,
    feedError: error,
    feedErrorStatus: errorStatus,
    loadNotifications,
    markRead,
    markAllRead,
  } = useNotifications();
  const [markingAll, setMarkingAll] = React.useState(false);

  const retry = React.useCallback(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  React.useEffect(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  const listedUnreadCount = items.filter((notification) => !notification.readAt).length;
  const linkedCount = items.filter(
    (notification) => notification.href && isSafeLocalHref(notification.href),
  ).length;

  async function handleMarkRead(id: string) {
    await markRead(id);
  }

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    await markAllRead();
    setMarkingAll(false);
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Notifications"
        description="Review application, payout, assignment, property, and account updates in one place."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markingAll}
            onClick={handleMarkAllRead}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            {markingAll ? "Marking read..." : "Mark all as read"}
          </Button>
        }
      />

      {status === "loading" ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <Bell className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No notifications yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Updates on your site visits, support tickets, and account will show up here.
          </p>
        </div>
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="All updates" value={items.length} icon={Bell} />
            <MetricCard label="Unread" value={listedUnreadCount} icon={Bell} attention={listedUnreadCount > 0} />
            <MetricCard label="Action links" value={linkedCount} icon={DASHBOARD_ICONS.explore} hint="Safe dashboard destinations" />
            <MetricCard label="Read" value={items.length - listedUnreadCount} icon={CheckCheck} />
          </MetricGrid>

          <DashboardPanel title="Recent updates" description="Unread items are highlighted and may link to the relevant workspace.">
          <ul className="space-y-3">
            {items.map((n) => {
              const Icon = NOTIFICATION_TYPE_ICON[n.type];
              const unread = !n.readAt;
              const body = (
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-text-primary">{n.title}</p>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {formatNotificationTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-text-secondary">{n.body}</p>
                </div>
              );
              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                    unread ? "border-loans-accent/30 bg-loans-soft/40" : "border-border bg-card",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loans-soft text-loans-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  {n.href && isSafeLocalHref(n.href) ? (
                    <Link href={n.href} className="min-w-0 flex-1 hover:opacity-80">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                  {unread && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkRead(n.id)}
                      className="shrink-0 text-xs text-text-secondary"
                    >
                      Mark read
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
