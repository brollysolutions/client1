"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  DashboardTextLink,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { useLine } from "@/features/dashboard/line-provider";
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
  const { activeLine } = useLine();
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
  }, [activeLine, reloadKey]);

  if (status === "loading") {
    return (
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </DashboardPage>
    );
  }

  if (status === "error" || !home) {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  const assignedTotal = Object.values(home.counts_by_status).reduce((sum, count) => sum + count, 0);

  return (
    <DashboardPage>
      <DashboardHeader
        title="Lead follow-up workspace"
        description="Work the most urgent callbacks first, then keep every assigned lead moving."
        actions={<DashboardTextLink href="/dashboard/leads">Open lead queue</DashboardTextLink>}
      />

      <MetricGrid>
        <MetricCard
          label="Follow-ups due"
          value={home.follow_ups_due.length}
          icon={DASHBOARD_ICONS.leads}
          href="/dashboard/leads"
          attention={home.follow_ups_due.length > 0}
        />
        <MetricCard
          label="Assigned leads"
          value={assignedTotal}
          icon={DASHBOARD_ICONS.leads}
          href="/dashboard/leads"
        />
        <MetricCard
          label="Working"
          value={home.counts_by_status.working ?? 0}
          icon={DASHBOARD_ICONS.leads}
          href="/dashboard/leads"
        />
        <MetricCard
          label="Converted"
          value={home.counts_by_status.converted ?? 0}
          icon={DASHBOARD_ICONS.leads}
          href="/dashboard/leads"
        />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel
          title="Follow-ups due"
          description="Callbacks requiring attention now"
          action={<DashboardTextLink href="/dashboard/leads">View all leads</DashboardTextLink>}
        >
          {home.follow_ups_due.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing due right now.</p>
          ) : (
            <ul className="space-y-2">
              {home.follow_ups_due.map((item) => (
                <li key={item.lead_uuid}>
                  <Link
                    href={`/dashboard/leads/${item.lead_uuid}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:border-brand-cta"
                  >
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                      <DASHBOARD_ICONS.leads className="h-4 w-4 text-brand-cta" aria-hidden="true" />
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
        </DashboardPanel>

        <DashboardPanel title="Pipeline distribution" description="Assigned leads by current status">
          {Object.keys(home.counts_by_status).length === 0 ? (
            <p className="text-sm text-text-secondary">No leads assigned yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(home.counts_by_status).map(([key, count]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{STATUS_LABEL[key] ?? key}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel
        title="Notifications"
        description="Recent assignment and workflow updates"
        action={<DashboardTextLink href="/dashboard/notifications">View all</DashboardTextLink>}
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-text-secondary">No notifications yet.</p>
        ) : (
          <ul className="space-y-3">
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
      </DashboardPanel>
    </DashboardPage>
  );
}
