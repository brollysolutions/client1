"use client";

import Link from "next/link";
import {
  BadgePercent,
  Building2,
  ClipboardCheck,
  Clock,
  FileText,
  Gift,
  Landmark,
  Megaphone,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";

import { useAdminHome } from "./use-admin-home";

const KIND_LABEL: Record<string, string> = {
  agent_application: "Agent application",
  banner: "Banner",
  property_submission: "Property listing",
};

const KIND_HREF: Record<string, string> = {
  agent_application: "/dashboard/agents",
  banner: "/dashboard/banners",
  property_submission: "/dashboard/property-review",
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

// Admin's composed landing page (Admin Dashboard slice 1): a cross-domain
// approval queue (agent applications, banners, property listings) with live
// counts, backed by one aggregated GET (services.admin_home.get_admin_home).
// The Manage grid below is the reachability fix for five surfaces that were
// previously admin-permitted but had no entry point anywhere in the app.
export function AdminHome() {
  const { home, status, error, errorStatus, retry } = useAdminHome();

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

  const pendingTotal =
    home.pending_agent_applications_count +
    home.pending_banners_count +
    home.pending_property_submissions_count;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review what is waiting on you, then manage staff, pipelines, and marketing content.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-text-primary">Waiting on you</h2>
        {home.pending_review.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            Nothing is waiting on your approval right now.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {home.pending_review.map((item) => (
                <li key={item.id}>
                  <Link
                    href={KIND_HREF[item.kind] ?? "/dashboard"}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:border-brand-cta"
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
                  </Link>
                </li>
              ))}
            </ul>
            {pendingTotal > home.pending_review.length ? (
              <p className="mt-3 text-xs text-text-secondary">
                Showing {home.pending_review.length} of {pendingTotal}.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/loan-applications">
          <Card className="h-full transition-colors hover:border-brand-cta">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-text-secondary">
                Open loan applications
              </CardTitle>
              <p className="mt-1 text-2xl font-semibold text-text-primary">
                {home.open_loan_applications_count}
              </p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/property-deals">
          <Card className="h-full transition-colors hover:border-brand-cta">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-text-secondary">
                Open property deals
              </CardTitle>
              <p className="mt-1 text-2xl font-semibold text-text-primary">
                {home.open_property_deals_count}
              </p>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/admin-leads"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-cta"
        >
          <p className="text-sm text-text-secondary">Unassigned leads</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.unassigned_leads_count}
          </p>
        </Link>
        <Link
          href="/dashboard/admin-tasks"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-cta"
        >
          <p className="text-sm text-text-secondary">Unassigned tasks</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.unassigned_tasks_count}
          </p>
        </Link>
        <Link
          href="/dashboard/payouts"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-cta"
        >
          <p className="text-sm text-text-secondary">Payouts awaiting approval</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {home.payouts_awaiting_approval_count}
          </p>
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">People and pipeline</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/dashboard/users">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <UserPlus className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Provision staff</CardTitle>
                <CardDescription>
                  Create Sub Admin, Telecaller, or Employee accounts with a temp password.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/agents">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <ClipboardCheck className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Agent applications</CardTitle>
                <CardDescription>
                  Review pending real-estate agent applications and approve or reject them.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/loan-applications">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <Landmark className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Loan applications</CardTitle>
                <CardDescription>
                  Review any loan application and progress its status or deal terms.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/property-deals">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <Building2 className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Property deals</CardTitle>
                <CardDescription>
                  Track every real-estate deal through site visit, negotiation, and booking.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/property-review">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <ClipboardCheck className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Listing approvals</CardTitle>
                <CardDescription>
                  Approve or reject property listings submitted for review.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Marketing</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/dashboard/banners">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <Megaphone className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Banners</CardTitle>
                <CardDescription>
                  Approve or reject banner drafts submitted by the content team.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/offers">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <BadgePercent className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Offers</CardTitle>
                <CardDescription>
                  Review the discount offers the content team has scheduled.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/content">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <FileText className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Website content</CardTitle>
                <CardDescription>
                  Review copy the content team has written for the public site.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/dashboard/referrals">
            <Card className="h-full transition-colors hover:border-brand-cta">
              <CardHeader>
                <Gift className="h-6 w-6 text-brand-cta" aria-hidden="true" />
                <CardTitle className="mt-2">Referral bonus</CardTitle>
                <CardDescription>
                  Review referral bonus rules and recent payout activity.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
