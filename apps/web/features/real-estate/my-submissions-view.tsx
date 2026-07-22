"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPaiseCompact } from "@/lib/format";
import type { Submission } from "@/lib/property-submissions-api";
import { useMySubmissions } from "./use-my-submissions";

const STATUS_VARIANT: Record<Submission["status"], "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};
const STATUS_LABEL: Record<Submission["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export function MySubmissionsView() {
  const { items, loading, error, reload } = useMySubmissions();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">My submissions</h1>
          <p className="mt-1 text-sm text-text-secondary">Listings you have submitted for review.</p>
        </div>
        <Button asChild size="sm"><Link href="/dashboard/property-submit">New listing</Link></Button>
      </div>

      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()}>Try again</Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-secondary">No submissions yet.</p>
          <Button asChild size="sm" className="mt-4"><Link href="/dashboard/property-submit">Submit your first listing</Link></Button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text-primary">{s.title}</p>
                  <p className="text-sm text-text-secondary">{s.location}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{formatPaiseCompact(s.price_paise)}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Submitted{" "}
                    {new Date(s.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              </div>
              {s.status === "rejected" && s.review_note && (
                <p className="mt-2 rounded bg-destructive/5 p-2 text-sm text-text-secondary">
                  Reviewer note: {s.review_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
