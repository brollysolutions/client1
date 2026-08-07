"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Headset } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  createSupportTicket,
  getSupportTickets,
  STATUS_STYLES,
  type SupportCategory,
  type SupportTicket,
} from "@/lib/support-tickets";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Status = "loading" | "ready" | "error";

export default function SupportPage() {
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
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
      const res = await getSupportTickets();
      if (!active) return;
      if (res.ok) {
        setTickets(res.data);
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Support</h1>
        <p className="text-sm text-text-secondary">
          Raise a ticket and our team will get back to you.
        </p>
      </div>

      <NewTicketForm onCreated={(t) => setTickets((prev) => [t, ...prev])} />

      <section className="flex flex-col gap-4 rounded-2xl border border-brand-cta/25 bg-brand-cta-tint/40 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium text-text-primary">Need a new login number?</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Verify the replacement number, then support will complete a two-person identity review.
          </p>
        </div>
        <Link
          href="/change-mobile"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-cta px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta"
        >
          Start number change
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Your tickets</h2>
        {status === "loading" ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : status === "error" ? (
          <FetchError status={errorStatus} message={error} onRetry={retry} />
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-loans-soft text-loans-accent">
              <Headset className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm text-text-secondary">
              You have not raised any tickets yet. Use the form above if you need a hand.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => {
              const s = STATUS_STYLES[t.status];
              return (
                <li key={t.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {CATEGORY_LABEL[t.category]} · {formatDate(t.createdOn)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        s.className,
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{t.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewTicketForm({ onCreated }: { onCreated: (ticket: SupportTicket) => void }) {
  const [category, setCategory] = React.useState<SupportCategory | "">("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const canSubmit =
    category !== "" && subject.trim() !== "" && body.trim() !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return; // canSubmit narrows category to a real SupportCategory
    setSubmitting(true);
    const res = await createSupportTicket({
      category,
      subject: subject.trim(),
      body: body.trim(),
    });
    setSubmitting(false);
    if (res.ok) {
      onCreated(res.data);
      setCategory("");
      setSubject("");
      setBody("");
      toast.success("Ticket raised.", {
        description: "Our team will get back to you soon.",
      });
    } else {
      toast.error(res.error || "Couldn't raise your ticket.", {
        description: "Please try again in a moment.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div className="space-y-2">
        <Label htmlFor="category">What do you need help with?</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Choose a topic" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="A short summary"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Details</Label>
        <Textarea
          id="body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell us what happened so we can help."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-loans-accent px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Sending..." : "Raise ticket"}
        </button>
      </div>
    </form>
  );
}
