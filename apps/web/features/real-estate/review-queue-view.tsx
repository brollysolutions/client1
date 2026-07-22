"use client";

import * as React from "react";
import { CheckCircle2, ImageOff, Inbox, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSubmission,
  rejectSubmission,
  type Submission,
} from "@/lib/property-submissions-api";
import { useSubmissionQueue } from "./use-submission-queue";

function formatPrice(paise: number): string {
  const rupees = Math.floor(paise / 100);
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  const lakh = rupees / 100_000;
  return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(2)} L`;
}

export function ReviewQueueView() {
  const { items, loading, error, reload } = useSubmissionQueue();
  const [active, setActive] = React.useState<Submission | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onApprove(sub: Submission) {
    setBusy(true);
    const res = await approveSubmission(sub.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Listing approved", { description: `${sub.title} is now live in the catalog.` });
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(sub: Submission) {
    if (note.trim().length === 0) {
      toast.error("Add a reason", { description: "Tell the agent why this was rejected." });
      return;
    }
    setBusy(true);
    const res = await rejectSubmission(sub.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Submission rejected");
      setActive(null);
      setRejecting(false);
      setNote("");
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Property review</h1>
        <p className="text-sm text-text-secondary">
          Approve agent-submitted listings into the catalog, or send them back with a reason.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No submissions awaiting review</p>
          <p className="mt-1 text-sm text-text-secondary">
            New agent listings will show up here for approval.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((sub) => (
            <li key={sub.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(sub);
                  setRejecting(false);
                  setNote("");
                }}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{sub.title}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{sub.location}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-text-primary">
                    {formatPrice(sub.price_paise)}
                  </span>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>{active.location}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {active.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={active.image}
                    alt={active.title}
                    className="h-44 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center rounded-xl bg-muted">
                    <ImageOff className="h-6 w-6 text-text-secondary" aria-hidden="true" />
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-text-secondary">Price</dt>
                    <dd className="font-medium text-text-primary">{formatPrice(active.price_paise)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">Type</dt>
                    <dd className="font-medium text-text-primary">{active.type}</dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">Config</dt>
                    <dd className="font-medium text-text-primary">
                      {active.bhk > 0 ? `${active.bhk} BHK · ` : ""}
                      {active.area_sqft} sqft
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">RERA</dt>
                    <dd className="font-medium text-text-primary">{active.rera_number}</dd>
                  </div>
                </dl>

                {rejecting ? (
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason for rejection (shown to the agent)"
                    rows={3}
                  />
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={() => void onReject(active)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Confirm reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                      Reject
                    </Button>
                    <Button onClick={() => void onApprove(active)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
