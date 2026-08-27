"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Bell } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  DashboardQuickAction,
  DashboardSection,
  DashboardTextLink,
  MetricCard,
  MetricGrid,
  QuickActionGrid,
} from "@/features/dashboard/dashboard-ui";
import { useLine } from "@/features/dashboard/line-provider";
import { getNotifications, type AppNotification } from "@/lib/notifications";
import { getEmployeeHome, type EmployeeHome as EmployeeHomeData } from "@/lib/employee-api";

const TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

type Status = "loading" | "ready" | "error";

// Employee landing page: today's tasks, counts by type/status, an overdue flag,
// and a notifications preview. Mirrors TelecallerHome's minimal-landing posture.
export function EmployeeHome() {
  const { activeLine } = useLine();
  const [home, setHome] = React.useState<EmployeeHomeData | null>(null);
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
      const [homeRes, notifRes] = await Promise.all([getEmployeeHome(), getNotifications()]);
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

  const inProgressCount = home.counts_by_status.in_progress ?? 0;
  const completedCount = home.counts_by_status.completed ?? 0;

  return (
    <DashboardPage>
      <DashboardHeader
        title="Field operations"
        description="Prioritize today's assigned work, overdue tasks, and field follow-through."
      />

      <MetricGrid>
        <MetricCard
          label="Due today"
          value={home.tasks_today.length}
          icon={DASHBOARD_ICONS.tasks}
          href="/dashboard/tasks"
        />
        <MetricCard
          label="In progress"
          value={inProgressCount}
          icon={DASHBOARD_ICONS.tasks}
          href="/dashboard/tasks"
        />
        <MetricCard
          label="Overdue"
          value={home.overdue_count}
          icon={AlertTriangle}
          href="/dashboard/tasks"
          attention={home.overdue_count > 0}
        />
        <MetricCard
          label="Completed"
          value={completedCount}
          icon={DASHBOARD_ICONS.tasks}
          href="/dashboard/tasks"
        />
      </MetricGrid>

      {home.overdue_count > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {home.overdue_count} {home.overdue_count === 1 ? "task is" : "tasks are"} overdue.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel
          title="Today's tasks"
          description="Assignments due before the end of the day"
          action={<DashboardTextLink href="/dashboard/tasks">View all tasks</DashboardTextLink>}
        >
          {home.tasks_today.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing due today.</p>
          ) : (
            <ul className="space-y-2">
              {home.tasks_today.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:border-brand-cta"
                  >
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                      <DASHBOARD_ICONS.tasks className="h-4 w-4 text-brand-cta" aria-hidden="true" />
                      {task.lead_name ?? task.lead_mobile}
                    </span>
                    <span className="text-xs text-text-secondary">{formatDateTime(task.due_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>

        <DashboardPanel title="Task distribution" description="Current workload by status and type">
          {Object.keys(home.counts_by_status).length === 0 ? (
            <p className="text-sm text-text-secondary">No tasks assigned yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {Object.entries(home.counts_by_status).map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{STATUS_LABEL[key] ?? key}</span>
                    <span className="font-medium text-text-primary">{count}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 space-y-2 border-t border-border pt-3">
                {Object.entries(home.counts_by_type).map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{TYPE_LABEL[key] ?? key}</span>
                    <span className="font-medium text-text-primary">{count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DashboardPanel>
      </div>

      {activeLine === "real_estate" ? (
        <DashboardSection
          title="Real Estate field work"
          description="Pickup coordination is separate from your assigned property and document tasks."
        >
          <QuickActionGrid>
            <DashboardQuickAction
              href="/dashboard/vehicle-arrangements"
              title="Vehicle arrangements"
              description="Review assigned pickups and record completion or cancellation."
              icon={DASHBOARD_ICONS.vehicleArrangements}
            />
          </QuickActionGrid>
        </DashboardSection>
      ) : null}

      <DashboardPanel
        title="Notifications"
        description="Recent updates about your assigned work"
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
