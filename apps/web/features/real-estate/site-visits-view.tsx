"use client";

import { CalendarCheck } from "lucide-react";

import { useSiteVisits, type VisitStatus } from "@/features/real-estate/store";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<VisitStatus, string> = {
  requested: "bg-brand-cta-tint text-brand-cta",
  confirmed: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
};

const STATUS_LABEL: Record<VisitStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  done: "Done",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Scheduled site visits, requested via the "book visit" action on a property
// card. Frontend-only: persisted in the site-visits store.
export function SiteVisitsView() {
  const { items } = useSiteVisits();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Site Visits</h1>
        <p className="text-sm text-text-secondary">Your scheduled property visits.</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <CalendarCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No site visits yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Book a visit on a property from Explore or Home to see it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Property</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-text-primary">{v.title}</p>
                    <p className="text-xs text-text-secondary">{v.location}</p>
                  </td>
                  <td className="px-5 py-4 text-text-secondary">{formatDate(v.date)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
