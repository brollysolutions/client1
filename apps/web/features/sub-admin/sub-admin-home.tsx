"use client";

import Link from "next/link";
import { BadgePercent, Building2, Megaphone } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Minimal Sub Admin landing. Deliberately small: this slice ships banners +
// the property-listing reuse + offers — content blocks and referral-bonus
// config are deferred to later slices, each adding a card here.
export function SubAdminHome() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Sub Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage marketing content and submit property listings for review.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/banners">
          <Card className="h-full transition-colors hover:border-brand-cta">
            <CardHeader>
              <Megaphone className="h-6 w-6 text-brand-cta" aria-hidden="true" />
              <CardTitle className="mt-2">Banners</CardTitle>
              <CardDescription>
                Create banner drafts and submit them for Admin approval.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/dashboard/property-submit">
          <Card className="h-full transition-colors hover:border-brand-cta">
            <CardHeader>
              <Building2 className="h-6 w-6 text-brand-cta" aria-hidden="true" />
              <CardTitle className="mt-2">Property listings</CardTitle>
              <CardDescription>
                Submit a property listing for Admin approval.
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
                Create and schedule discount offers.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
