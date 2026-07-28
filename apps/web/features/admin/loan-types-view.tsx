"use client";

import * as React from "react";
import { Inbox, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createLoanType, updateLoanType, type AdminLoanType } from "@/lib/loan-config-api";
import { useLoanTypes } from "./use-loan-types";

export function LoanTypesView() {
  const { items, loading, error, reload } = useLoanTypes();
  const [active, setActive] = React.useState<AdminLoanType | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftActive, setDraftActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  function openEdit(loanType: AdminLoanType) {
    setActive(loanType);
    setDraftLabel(loanType.label);
    setDraftActive(loanType.active);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newLabel.trim().length === 0) {
      toast.error("Name can't be empty");
      return;
    }
    setBusy(true);
    const res = await createLoanType({ label: newLabel.trim() });
    setBusy(false);
    if (res.ok) {
      toast.success("Loan type added");
      setNewLabel("");
      setCreating(false);
      void reload();
    } else {
      toast.error("Couldn't add loan type", { description: res.error });
    }
  }

  async function onSaveEdit() {
    if (!active) return;
    if (draftLabel.trim().length === 0) {
      toast.error("Name can't be empty");
      return;
    }
    const labelChanged = draftLabel.trim() !== active.label;
    const activeChanged = draftActive !== active.active;
    if (!labelChanged && !activeChanged) {
      setActive(null);
      return;
    }
    setBusy(true);
    const res = await updateLoanType(active.id, {
      label: labelChanged ? draftLabel.trim() : undefined,
      active: activeChanged ? draftActive : undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Loan type updated");
      setActive(null);
      void reload();
    } else {
      toast.error("Couldn't update loan type", { description: res.error });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          Loan types offered across the platform. Disable one instead of deleting it -- it stays
          on record for every application that already used it.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New loan type
        </Button>
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
          <p className="mt-3 font-medium text-text-primary">No loan types yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add the first one so clients can pick it on the apply form.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((lt) => (
            <li key={lt.id}>
              <button
                type="button"
                onClick={() => openEdit(lt)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{lt.label}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {lt.application_count === 0
                      ? "Not used yet"
                      : `Used on ${lt.application_count} application${lt.application_count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Badge variant={lt.active ? "secondary" : "outline"} className="shrink-0">
                  {lt.active ? "Active" : "Disabled"}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New loan type</DialogTitle>
            <DialogDescription>
              It shows up right away on the client apply form.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
            <div>
              <Label htmlFor="new-loan-type-label">Name</Label>
              <Input
                id="new-loan-type-label"
                value={newLabel}
                onChange={(ev) => setNewLabel(ev.target.value)}
                placeholder="Education Loan"
                maxLength={200}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-sm">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit loan type</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-loan-type-label">Name</Label>
                  <Input
                    id="edit-loan-type-label"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-loan-type-active"
                    checked={draftActive}
                    onCheckedChange={(v) => setDraftActive(v === true)}
                  />
                  <Label htmlFor="edit-loan-type-active" className="font-normal">
                    Active (visible to clients)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => void onSaveEdit()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
