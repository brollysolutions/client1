"use client";

import Link from "next/link";
import { ClipboardCheck, UserPlus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Minimal admin landing. Deliberately small: this slice only ships staff
// provisioning + the agent approval queue — the rest of the admin dashboard
// (properties, loans, banks, banners, offers, reports, audit) is deferred.
export function AdminHome() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Provision staff accounts and review pending agent applications.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
    </div>
  );
}
