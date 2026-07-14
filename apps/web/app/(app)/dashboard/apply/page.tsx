"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useMe } from "@/features/dashboard/me-provider";
import { submitLead } from "@/lib/leads";

const LOAN_TYPES = [
  "Home Loan",
  "Personal Loan",
  "Business Loan",
  "Vehicle Loan",
  "Education Loan",
  "Gold Loan",
] as const;

// Loan application intent. The tracked loan_applications record lands in a later
// phase; today this captures the client's interest as a loans lead (the live
// /leads endpoint) so the team can follow up. Name + mobile come from the session.
export default function ApplyPage() {
  const { me, status, error, errorStatus, retry } = useMe();
  const [loanType, setLoanType] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const canSubmit = loanType !== "" && amount.trim() !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !me) return;
    setSubmitting(true);
    const amountLine = amount.trim() ? `Requested amount: ${amount.trim()}. ` : "";
    const res = await submitLead({
      name: `${me.firstName} ${me.lastName}`.trim(),
      mobile: me.mobile,
      business_line: "loans",
      origin: "dashboard-apply",
      product: loanType,
      message: `${amountLine}${notes.trim()}`.trim() || undefined,
      email: me.email,
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      toast.error(res.error || "Couldn't submit your request.", {
        description: "Please try again in a moment.",
      });
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Skeleton className="h-5 w-32 rounded" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-xl">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to your loans
      </Link>

      {done ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-loans-soft text-loans-accent">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-lg font-semibold text-text-primary">Request received</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
            Thanks. Our loans team will reach out shortly to help you with the next steps.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-loans-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2"
          >
            Back to your loans
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Apply for a loan</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Tell us what you need and our team will guide you through the application.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6">
            <div className="space-y-2">
              <Label htmlFor="loan-type">Loan type</Label>
              <Select value={loanType} onValueChange={setLoanType}>
                <SelectTrigger id="loan-type" className="w-full">
                  <SelectValue placeholder="Select a loan type" />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount you need</Label>
              <Input
                id="amount"
                inputMode="numeric"
                placeholder="e.g. 20,00,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Anything else? (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Purpose of the loan, preferred tenure, questions…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-loans-accent px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
