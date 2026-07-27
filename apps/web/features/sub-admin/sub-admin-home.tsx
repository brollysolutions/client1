"use client";

import * as React from "react";
import Link from "next/link";
import {
  BadgePercent,
  Building2,
  Clock,
  FileText,
  Gift,
  Megaphone,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatPaiseCompact } from "@/lib/format";
import { getSubAdminHome, type SubAdminHome as SubAdminHomeData } from "@/lib/sub-admin-api";

const KIND_LABEL: Record<string, string> = {
  banner: "Banner",
  property_submission: "Property listing",
};

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type Status = "loading" | "ready" | "error";

// Sub Admin's composed landing page (spec §6.1): pending-approval queue ->
// live banners/offers -> content drafts -> recent referral payouts, backed by
// one aggregated GET (services.sub_admin.get_sub_admin_home). Domain cards
// stay as the secondary navigation into each surface.
export function SubAdminHome() {
  const [home, setHome] = React.useState<SubAdminHomeData | null>(null);
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
      const res = await getSubAdminHome();
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setErrorStatus(res.status);
        setStatus("error");
        return;
      }
      setHome(res.data);
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
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
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
        <h1 className="text-2xl font-semibold text-text-primary">Sub Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage marketing content and submit property listings for review.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-text-primary">Awaiting Admin approval</h2>
        {home.pending_approval.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            Nothing of yours is waiting on Admin right now.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {home.pending_approval.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
              >
                <span className="flex items-center gap-2 font-medium text-text-primary">
                  <Clock className="h-4 w-4 text-brand-cta" aria-hidden="true" />
                  {item.title}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                  <Badge variant="outline">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                  {LINE_LABEL[item.business_line] ?? item.business_line}
                  {formatDate(item.submitted_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-text-secondary">Live banners</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.live_banners_count}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-text-secondary">Active offers</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.live_offers_count}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-text-secondary">Content drafts</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.content_drafts_count}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Recent referral payouts</h2>
          <Link href="/dashboard/referral-rules" className="text-xs text-brand-cta hover:underline">
            View all
          </Link>
        </div>
        {home.recent_referral_payouts.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No referral payouts yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {home.recent_referral_payouts.map((row) => (
              <li key={row.id} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary capitalize">{row.status}</span>
                <span className="font-medium text-text-primary">
                  {formatPaiseCompact(row.amount_paise)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Manage</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/dashboard/banners">
            <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-cta">
              <Megaphone className="h-5 w-5 shrink-0 text-brand-cta" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Banners</p>
                <p className="text-sm text-text-secondary">
                  Create banner drafts and submit them for Admin approval.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/property-submit">
            <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-cta">
              <Building2 className="h-5 w-5 shrink-0 text-brand-cta" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Property listings</p>
                <p className="text-sm text-text-secondary">
                  Submit a property listing for Admin approval.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/offers">
            <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-cta">
              <BadgePercent className="h-5 w-5 shrink-0 text-brand-cta" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Offers</p>
                <p className="text-sm text-text-secondary">
                  Create and schedule discount offers.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/content">
            <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-cta">
              <FileText className="h-5 w-5 shrink-0 text-brand-cta" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Website content</p>
                <p className="text-sm text-text-secondary">
                  Write and publish copy for the public site.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard/referral-rules">
            <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-cta">
              <Gift className="h-5 w-5 shrink-0 text-brand-cta" aria-hidden="true" />
              <div>
                <p className="font-medium text-text-primary">Referral bonus</p>
                <p className="text-sm text-text-secondary">
                  Set referral bonus rules and review recent payout activity.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
