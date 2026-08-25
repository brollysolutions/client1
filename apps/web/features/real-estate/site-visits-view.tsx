"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { useSiteVisits } from "@/features/real-estate/use-site-visits";
import { cancelSiteVisit, type SiteVisit, type SiteVisitStatus } from "@/lib/site-visits";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<SiteVisitStatus, string> = {
  requested: "bg-brand-cta-tint text-brand-cta",
  confirmed: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
  cancelled: "bg-muted text-text-secondary",
};

const STATUS_LABEL: Record<SiteVisitStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  done: "Done",
  cancelled: "Cancelled",
};

const SLOT_LABEL: Record<SiteVisit["preferredTimeSlot"], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const VEHICLE_STATUS_LABEL = {
  requested: "Pickup requested",
  arranged: "Vehicle arranged",
  assigned: "Driver assigned",
  completed: "Pickup completed",
  cancelled: "Pickup cancelled",
} as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

// Scheduled site visits, requested via the "Book a site visit" action on a
// property card. Backed by the real site-visits API (RLS-scoped to the
// logged-in client); a visit can be cancelled from here until it's done.
export function SiteVisitsView() {
  const { siteVisits: visits, setSiteVisits: setVisits, status, error, errorStatus, retry } =
    useSiteVisits();
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);

  async function handleCancel(id: string) {
    if (cancellingId) return;
    setCancellingId(id);
    const res = await cancelSiteVisit(id);
    setCancellingId(null);
    if (res.ok) {
      setVisits((prev) => prev.map((v) => (v.id === id ? res.data : v)));
      toast.success("Site visit cancelled.");
    } else {
      toast.error(res.error || "Couldn't cancel this visit. Please try again.");
    }
  }

  const upcomingCount = visits.filter((visit) =>
    ["requested", "confirmed"].includes(visit.status),
  ).length;
  const completedCount = visits.filter((visit) => visit.status === "done").length;
  const pickupCount = visits.filter((visit) => visit.vehicleArrangement != null).length;

  return (
    <DashboardPage>
      <DashboardHeader
        title="Site Visits"
        description="Track visit confirmation, preferred slots, pickup arrangements, and completion."
      />

      {status === "loading" ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : visits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <CalendarCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No site visits yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Book a visit on a property from Explore to see it here.
          </p>
        </div>
      ) : (
        <>
        <MetricGrid>
          <MetricCard label="All visits" value={visits.length} icon={DASHBOARD_ICONS.siteVisits} />
          <MetricCard label="Upcoming" value={upcomingCount} icon={DASHBOARD_ICONS.siteVisits} attention={upcomingCount > 0} />
          <MetricCard label="Completed" value={completedCount} icon={DASHBOARD_ICONS.listingApprovals} />
          <MetricCard label="Pickup requested" value={pickupCount} icon={DASHBOARD_ICONS.vehicleArrangements} />
        </MetricGrid>
        <DashboardPanel title="Visit schedule" description="Client-owned visits and company-managed pickup status.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Property</th>
                <th className="px-5 py-3 font-medium">Preferred date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Pickup</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const cancellable = v.status !== "done" && v.status !== "cancelled";
                return (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-medium text-text-primary">{v.title}</p>
                      <p className="text-xs text-text-secondary">
                        {v.locality}, {v.city}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {formatDate(v.preferredDate)}
                      <span className="block text-xs">{SLOT_LABEL[v.preferredTimeSlot]}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_STYLE[v.status],
                        )}
                      >
                        {STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {v.vehicleArrangement ? (
                        <div className="max-w-xs space-y-1">
                          <p className="font-medium text-text-primary">
                            {VEHICLE_STATUS_LABEL[v.vehicleArrangement.status]}
                          </p>
                          <p className="text-xs">
                            {formatDateTime(v.vehicleArrangement.pickupAt)}
                          </p>
                          {v.vehicleArrangement.driverName ? (
                            <p className="text-xs">
                              {v.vehicleArrangement.driverName}
                              {v.vehicleArrangement.driverMobile
                                ? ` · ${v.vehicleArrangement.driverMobile}`
                                : ""}
                            </p>
                          ) : null}
                          {v.vehicleArrangement.vehicleMakeModel ? (
                            <p className="text-xs">
                              {v.vehicleArrangement.vehicleMakeModel}
                              {v.vehicleArrangement.vehicleRegistration
                                ? ` · ${v.vehicleArrangement.vehicleRegistration}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        "Not requested"
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!cancellable || cancellingId === v.id}
                        onClick={() => handleCancel(v.id)}
                      >
                        {cancellingId === v.id ? "Cancelling..." : "Cancel"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
