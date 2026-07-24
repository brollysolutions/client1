"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, CalendarClock, Inbox, Loader2, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activateOffer,
  archiveOffer,
  scheduleOffer,
  updateOffer,
  type Offer,
} from "@/lib/offers-api";
import { useOfferQueue } from "./use-offer-queue";

const STATUS_LABEL: Record<Offer["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
  archived: "Archived",
};

const STATUS_VARIANT: Record<Offer["status"], "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "secondary",
  expired: "destructive",
  archived: "outline",
};

const DISCOUNT_LABEL: Record<string, string> = {
  percentage: "% off",
  flat: "flat off",
  "cashback-tie": "cashback",
};

const EDITABLE_STATUSES = new Set<Offer["status"]>(["draft", "scheduled"]);

function discountText(offer: Offer): string {
  const suffix = DISCOUNT_LABEL[offer.discount_type] ?? offer.discount_type;
  return offer.discount_type === "percentage"
    ? `${offer.discount_value}${suffix}`
    : `₹${offer.discount_value} ${suffix}`;
}

export function OffersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useOfferQueue();
  const [active, setActive] = React.useState<Offer | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftDescription, setDraftDescription] = React.useState("");
  const [draftCode, setDraftCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function openOffer(offer: Offer) {
    setActive(offer);
    setDraftTitle(offer.title);
    setDraftDescription(offer.description ?? "");
    setDraftCode(offer.code ?? "");
  }

  async function onSaveEdit(offer: Offer) {
    if (draftTitle.trim().length === 0) {
      toast.error("Title can't be empty");
      return;
    }
    setBusy(true);
    const res = await updateOffer(offer.id, {
      title: draftTitle.trim(),
      description: draftDescription.trim() || null,
      code: draftCode.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Offer updated");
      setActive(res.data);
      void reload();
    } else {
      toast.error("Could not update offer", { description: res.error });
    }
  }

  async function onAdvance(action: typeof scheduleOffer, offer: Offer, successMsg: string) {
    setBusy(true);
    const res = await action(offer.id);
    setBusy(false);
    if (res.ok) {
      toast.success(successMsg);
      setActive(null);
      void reload();
    } else {
      toast.error("Could not update offer", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Offers</h1>
          <p className="text-sm text-text-secondary">
            {isAdmin
              ? "Read-only view of every discount offer the content team manages."
              : "Create discount offers, then schedule, activate, and archive them."}
          </p>
        </div>
        {!isAdmin ? (
          <Link href="/dashboard/offers/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New offer
            </Button>
          </Link>
        ) : null}
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
          <p className="mt-3 font-medium text-text-primary">No offers yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            {isAdmin
              ? "Offers the content team creates will show up here."
              : "Create your first discount offer to get started."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((offer) => (
            <li key={offer.id}>
              <button
                type="button"
                onClick={() => openOffer(offer)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{offer.title}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {discountText(offer)} ·{" "}
                    {offer.business_line === "both" ? "Both lines" : offer.business_line}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[offer.status]} className="shrink-0">
                  {STATUS_LABEL[offer.status]}
                </Badge>
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
                <DialogDescription>
                  {STATUS_LABEL[active.status]} ·{" "}
                  {active.business_line === "both" ? "Both lines" : active.business_line}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {!isAdmin && EDITABLE_STATUSES.has(active.status) ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="edit-title">Title</Label>
                      <Input
                        id="edit-title"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        maxLength={500}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-description">Description</Label>
                      <Input
                        id="edit-description"
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        maxLength={2000}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-code">Promo code</Label>
                      <Input
                        id="edit-code"
                        value={draftCode}
                        onChange={(e) => setDraftCode(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-text-secondary">Discount</dt>
                      <dd className="font-medium text-text-primary">{discountText(active)}</dd>
                    </div>
                    {active.code ? (
                      <div>
                        <dt className="text-text-secondary">Code</dt>
                        <dd className="font-medium text-text-primary">{active.code}</dd>
                      </div>
                    ) : null}
                    {active.description ? (
                      <div className="col-span-2">
                        <dt className="text-text-secondary">Description</dt>
                        <dd className="font-medium text-text-primary">{active.description}</dd>
                      </div>
                    ) : null}
                  </dl>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {!isAdmin && EDITABLE_STATUSES.has(active.status) ? (
                  <Button variant="outline" onClick={() => void onSaveEdit(active)} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                ) : null}
                {!isAdmin && active.status === "draft" ? (
                  <Button
                    onClick={() => void onAdvance(scheduleOffer, active, "Offer scheduled")}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )}
                    Schedule
                  </Button>
                ) : null}
                {!isAdmin && active.status === "scheduled" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void onAdvance(archiveOffer, active, "Offer archived")}
                      disabled={busy}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                    <Button
                      onClick={() => void onAdvance(activateOffer, active, "Offer activated")}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      Activate
                    </Button>
                  </>
                ) : null}
                {!isAdmin && active.status === "active" ? (
                  <Button
                    variant="outline"
                    onClick={() => void onAdvance(archiveOffer, active, "Offer archived")}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Archive
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
