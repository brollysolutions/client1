"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getUnreadCount } from "@/lib/notifications";

// Top-bar bell linking to /dashboard/notifications, with an unread-count
// badge. Fetches once on mount; the count doesn't need to be real-time —
// opening the page itself shows the authoritative state.
export function NotificationBell() {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    void getUnreadCount().then((res) => {
      if (active && res.ok) setCount(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className="relative rounded-md p-1.5 text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none"
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
    </Link>
  );
}
