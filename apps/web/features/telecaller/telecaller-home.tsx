"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, PhoneCall } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { getNotifications, type AppNotification } from "@/lib/notifications";
import { getTelecallerHome, type TelecallerHome as TelecallerHomeData } from "@/lib/telecaller-api";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

type Status = "loading" | "ready" | "error";

// Telecaller landing page: follow-ups due today, assigned-lead counts, and a
// notifications preview. Mirrors AdminHome's minimal-landing posture — this
// slice ships the lead-follow-up flow only.
export function TelecallerHome() {
  const [home, setHome] = React.useState<TelecallerHomeData | null>(null);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const [homeRes, notifRes] = await Promise.all([getTelecallerHome(), getNotifications()]);
      if (!active) return;
      if (!homeRes.ok) {
        setError(homeRes.error);
        setErrorStatus(homeRes.status);
        setStatus("error");
        return;
      }
      setHome(homeRes.data);
      setNotifications(notifRes.ok ? notifRes.data.slice(0, 3) : []);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !home) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Home</h1>
        <p className="mt-1 text-sm text-text-secondary">Your leads and follow-ups for today.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-text-primary">Follow-ups due</h2>
          {home.follow_ups_due.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">Nothing due right now.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {home.follow_ups_due.map((item) => (
                <li key={item.lead_uuid}>
                  <Link
                    href={`/dashboard/leads/${item.lead_uuid}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:border-brand-cta"
                  >
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                      <PhoneCall className="h-4 w-4 text-brand-cta" aria-hidden="true" />
                      {item.name ?? item.mobile}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {formatDateTime(item.follow_up_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-text-primary">Assigned leads</h2>
          {Object.keys(home.counts_by_status).length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">No leads assigned yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {Object.entries(home.counts_by_status).map(([key, count]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{STATUS_LABEL[key] ?? key}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/leads"
            className="mt-4 inline-block text-sm font-medium text-brand-cta hover:underline"
          >
            View all leads
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
          <Link href="/dashboard/notifications" className="text-xs text-brand-cta hover:underline">
            View all
          </Link>
        </div>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No notifications yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-sm">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <div>
                  <p className="font-medium text-text-primary">{n.title}</p>
                  <p className="text-text-secondary">{n.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
