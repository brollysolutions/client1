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
import { createBank, updateBank, type AdminBank } from "@/lib/loan-config-api";
import { formatLastUpdated } from "@/lib/format";
import { useBanks } from "./use-banks";

export function BanksView() {
  const { items, loading, error, reload } = useBanks();
  const [active, setActive] = React.useState<AdminBank | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [draftName, setDraftName] = React.useState("");
  const [draftActive, setDraftActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  function openEdit(bank: AdminBank) {
    setActive(bank);
    setDraftName(bank.name);
    setDraftActive(bank.active);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim().length === 0) {
      toast.error("Name can't be empty");
      return;
    }
    setBusy(true);
    const res = await createBank({ name: newName.trim() });
    setBusy(false);
    if (res.ok) {
      toast.success("Bank added");
      setNewName("");
      setCreating(false);
      void reload();
    } else {
      toast.error("Couldn't add bank", { description: res.error });
    }
  }

  async function onSaveEdit() {
    if (!active) return;
    if (draftName.trim().length === 0) {
      toast.error("Name can't be empty");
      return;
    }
    const nameChanged = draftName.trim() !== active.name;
    const activeChanged = draftActive !== active.active;
    if (!nameChanged && !activeChanged) {
      setActive(null);
      return;
    }
    setBusy(true);
    const res = await updateBank(active.id, {
      name: nameChanged ? draftName.trim() : undefined,
      active: activeChanged ? draftActive : undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Bank updated");
      setActive(null);
      void reload();
    } else {
      toast.error("Couldn't update bank", { description: res.error });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          Banks a loan can be submitted to. Disable one instead of deleting it -- it stays on
          record for every application it already funded.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New bank
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
          <p className="mt-3 font-medium text-text-primary">No banks yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add the first one so staff can assign it while progressing a loan.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((bank) => (
            <li key={bank.id}>
              <button
                type="button"
                onClick={() => openEdit(bank)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{bank.name}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {bank.application_count === 0
                      ? "Not used yet"
                      : `Funded ${bank.application_count} application${bank.application_count === 1 ? "" : "s"}`}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatLastUpdated(bank.updated_at)}
                  </p>
                </div>
                <Badge variant={bank.active ? "secondary" : "outline"} className="shrink-0">
                  {bank.active ? "Active" : "Disabled"}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New bank</DialogTitle>
            <DialogDescription>
              It shows up right away in the bank picker staff use while progressing a loan.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
            <div>
              <Label htmlFor="new-bank-name">Name</Label>
              <Input
                id="new-bank-name"
                value={newName}
                onChange={(ev) => setNewName(ev.target.value)}
                placeholder="Enter lender name"
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
                <DialogTitle>Edit bank</DialogTitle>
                <DialogDescription>{formatLastUpdated(active.updated_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-bank-name">Name</Label>
                  <Input
                    id="edit-bank-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-bank-active"
                    checked={draftActive}
                    onCheckedChange={(v) => setDraftActive(v === true)}
                  />
                  <Label htmlFor="edit-bank-active" className="font-normal">
                    Active (selectable by staff)
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
