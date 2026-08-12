"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isSafeLocalHref } from "@/lib/safe-local-href";
import { cn } from "@/lib/utils";

import { formatNotificationTime, NOTIFICATION_TYPE_ICON } from "./notification-presenter";
import { useNotifications } from "./notifications-provider";

const PREVIEW_LIMIT = 5;

// Shared top-bar notification control for every role. The cheap unread count
// loads on mount; the bounded owner-scoped feed loads only when the preview is
// first opened by hover, focus, or click. The full page remains authoritative.
export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const { items, unreadCount: count, feedStatus: previewStatus, loadNotifications } = useNotifications();
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = React.useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  const showPreview = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    void loadPreview();
  }, [loadPreview]);

  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }, []);

  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPreview();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
          className="relative rounded-md p-1.5 text-text-secondary transition-colors hover:bg-brand-cta-tint hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          onMouseEnter={showPreview}
          onMouseLeave={scheduleClose}
          onFocus={showPreview}
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge
              variant="destructive"
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {count > 9 ? "9+" : count}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden"
        onMouseEnter={showPreview}
        onMouseLeave={scheduleClose}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-semibold text-text-primary">Notifications</p>
            <p className="text-xs text-text-secondary">
              {count > 0 ? `${count} unread update${count === 1 ? "" : "s"}` : "You are all caught up"}
            </p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-cta-tint text-brand-cta">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>

        {previewStatus === "loading" || previewStatus === "idle" ? (
          <div className="flex min-h-32 items-center justify-center text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading notifications" />
          </div>
        ) : previewStatus === "error" ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">Couldn&apos;t load notification previews.</p>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-brand-cta hover:underline"
              onClick={() => {
                void loadNotifications(true);
              }}
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-text-primary">No notifications yet</p>
            <p className="mt-1 text-xs text-text-secondary">Important workspace updates will appear here.</p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.slice(0, PREVIEW_LIMIT).map((notification) => {
              const Icon = NOTIFICATION_TYPE_ICON[notification.type];
              const content = (
                <>
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-cta-tint text-brand-cta">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="truncate text-sm font-medium text-text-primary">{notification.title}</span>
                      <span className="shrink-0 text-[11px] text-text-secondary">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-secondary">
                      {notification.body}
                    </span>
                  </span>
                  {!notification.readAt ? (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-cta" aria-label="Unread" />
                  ) : null}
                </>
              );

              return (
                <li key={notification.id}>
                  {notification.href && isSafeLocalHref(notification.href) ? (
                    <Link
                      href={notification.href}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
                      onClick={() => setOpen(false)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={cn("flex gap-3 px-4 py-3", !notification.readAt && "bg-brand-cta-tint/20")}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-brand-cta transition-colors hover:bg-brand-cta-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
        >
          View all notifications
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
