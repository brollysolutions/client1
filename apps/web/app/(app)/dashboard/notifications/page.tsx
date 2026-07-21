"use client";

import * as React from "react";
import { CheckCheck, FileText, Gift, Sparkles, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Frontend-only preview. No event producers are wired yet, so this feed renders
// sample notifications to show the intended layout. Read state is local only.
type Notice = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

const SAMPLE: Notice[] = [
  {
    id: "1",
    icon: TrendingUp,
    title: "Your home loan was disbursed",
    body: "The sanctioned amount has been released by the bank.",
    time: "2h ago",
    unread: true,
  },
  {
    id: "2",
    icon: FileText,
    title: "Documents requested",
    body: "Your advisor asked for an updated income proof to move ahead.",
    time: "Yesterday",
    unread: true,
  },
  {
    id: "3",
    icon: Gift,
    title: "Referral converted",
    body: "Meera K. completed her loan. A referral payout is on the way.",
    time: "3 days ago",
    unread: false,
  },
];

export default function NotificationsPage() {
  const [items, setItems] = React.useState<Notice[]>(SAMPLE);
  const hasUnread = items.some((n) => n.unread);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Notifications</h1>
          <p className="text-sm text-text-secondary">
            Updates on your applications, payouts, and account.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-text-secondary">
          <Sparkles className="h-3.5 w-3.5" />
          Sample data
        </span>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!hasUnread}
          onClick={() => setItems((prev) => prev.map((n) => ({ ...n, unread: false })))}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-loans-accent transition-colors hover:text-loans-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-60"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <ul className="space-y-3">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <li
              key={n.id}
              className={cn(
                "flex gap-3 rounded-xl border p-4 transition-colors",
                n.unread ? "border-loans-accent/30 bg-loans-soft/40" : "border-border bg-card",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loans-soft text-loans-accent">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-text-primary">{n.title}</p>
                  <span className="shrink-0 text-xs text-text-secondary">{n.time}</span>
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">{n.body}</p>
              </div>
              {n.unread && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-loans-accent" aria-label="Unread" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
