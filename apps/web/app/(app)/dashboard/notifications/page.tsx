"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CalendarX,
  CheckCheck,
  ClipboardList,
  Gift,
  Headset,
  Home,
  Landmark,
  PhoneCall,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  site_visit_requested: CalendarCheck,
  site_visit_cancelled: CalendarX,
  support_ticket_received: Headset,
  support_ticket_resolved: Headset,
  lead_assigned: PhoneCall,
  lead_released: Undo2,
  task_assigned: ClipboardList,
  loan_status_updated: Landmark,
  property_deal_status_updated: Home,
  referral_converted: Gift,
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Status = "loading" | "ready" | "error";

// Notification feed backed by the real notifications API: site-visit
// create/cancel and support-ticket create each emit one entry server-side.
export default function NotificationsPage() {
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [markingAll, setMarkingAll] = React.useState(false);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getNotifications();
      if (!active) return;
      if (res.ok) {
        setItems(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const hasUnread = items.some((n) => !n.readAt);

  async function handleMarkRead(id: string) {
    const prevItems = items;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    );
    const res = await markNotificationRead(id);
    if (!res.ok) setItems(prevItems);
  }

  async function handleMarkAllRead() {
    if (markingAll || !hasUnread) return;
    setMarkingAll(true);
    const prevItems = items;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    const res = await markAllNotificationsRead();
    setMarkingAll(false);
    if (!res.ok) setItems(prevItems);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Notifications</h1>
        <p className="text-sm text-text-secondary">
          Updates on your applications, payouts, and account.
        </p>
      </div>

      {status === "loading" ? (
        <Skeleton className="h-40 rounded-xl" />
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
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!hasUnread || markingAll}
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-loans-accent transition-colors hover:text-loans-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-60"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </button>
          </div>

          <ul className="space-y-3">
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type];
              const unread = !n.readAt;
              const body = (
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-text-primary">{n.title}</p>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {formatRelativeTime(n.createdAt)}
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
                  {n.href ? (
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
        </>
      )}
    </div>
  );
}
