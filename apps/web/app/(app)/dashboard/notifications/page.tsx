"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "@/features/admin/admin-list-tools";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  formatNotificationTime,
  NOTIFICATION_TYPE_ICON,
  NOTIFICATION_TYPE_LABEL,
} from "@/features/dashboard/notification-presenter";
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
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(0);

  const retry = React.useCallback(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  React.useEffect(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  const filteredItems = React.useMemo(
    () =>
      items.filter(
        (n) =>
          (!unreadOnly || !n.readAt) &&
          (typeFilter === "all" || n.type === typeFilter) &&
          isInDateRange(n.createdAt, dateFrom, dateTo) &&
          `${n.title} ${n.body}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [items, unreadOnly, typeFilter, dateFrom, dateTo, search],
  );

  React.useEffect(() => {
    setPage(0);
  }, [unreadOnly, typeFilter, dateFrom, dateTo, search]);

  const pageItems = filteredItems.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

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
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={unreadOnly ? "unread" : "all"} onValueChange={(v) => setUnreadOnly(v === "unread")}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
              <Input
                aria-label="Search notifications"
                placeholder="Title or description"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="Filter notifications by type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(NOTIFICATION_TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Notifications from date"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                aria-label="Notifications to date"
                type="date"
                min={dateFrom || undefined}
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>

          <DashboardPanel title="Recent updates" description="Unread items are highlighted and may link to the relevant workspace.">
            {filteredItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">No notifications match your filters.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {pageItems.map((n) => {
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
                          unread ? "border-border bg-muted/40" : "border-border bg-card",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-text-primary">
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
                <AdminPagination page={page} total={filteredItems.length} onPageChange={setPage} />
              </>
            )}
          </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
