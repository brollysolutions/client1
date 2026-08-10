"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { getEnquiries, type Enquiry, type EnquiryStatus } from "@/lib/enquiries";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: "bg-brand-cta-tint text-brand-cta",
  contacted: "bg-warning/10 text-warning",
  closed: "bg-success/10 text-success",
};

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Status = "loading" | "ready" | "error";

// List of enquiries the client has raised on properties (via the Enquire
// action on a property card). Backed by the real enquiries API (RLS-scoped
// to the logged-in client).
export function EnquiriesView() {
  const [enquiries, setEnquiries] = React.useState<Enquiry[]>([]);
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
      const res = await getEnquiries();
      if (!active) return;
      if (res.ok) {
        setEnquiries(res.data);
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

  const newCount = enquiries.filter((enquiry) => enquiry.status === "new").length;
  const contactedCount = enquiries.filter((enquiry) => enquiry.status === "contacted").length;
  const closedCount = enquiries.filter((enquiry) => enquiry.status === "closed").length;

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Real Estate activity"
        title="My Enquiries"
        description="Follow every property question from initial request through team contact and closure."
      />

      {status === "loading" ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : enquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <MessageSquare className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No enquiries yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Enquire on a property from Explore or Home to see it here.
          </p>
        </div>
      ) : (
        <>
        <MetricGrid>
          <MetricCard label="All enquiries" value={enquiries.length} icon={DASHBOARD_ICONS.enquiries} />
          <MetricCard label="New" value={newCount} icon={DASHBOARD_ICONS.enquiries} attention={newCount > 0} />
          <MetricCard label="Contacted" value={contactedCount} icon={DASHBOARD_ICONS.agent} />
          <MetricCard label="Closed" value={closedCount} icon={DASHBOARD_ICONS.listingApprovals} />
        </MetricGrid>
        <DashboardPanel title="Enquiry history" description="Properties you asked the team to contact you about.">
        <div className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Property</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-text-primary">{e.title}</p>
                    <p className="text-xs text-text-secondary">
                      {e.locality}, {e.city}
                    </p>
                  </td>
                  <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLE[e.status],
                      )}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
