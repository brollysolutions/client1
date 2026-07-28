"use client";

import * as React from "react";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setBankAvailability } from "@/lib/loan-config-api";
import { isAvailable } from "@/lib/loan-config";
import { useBankAvailability } from "./use-bank-availability";

export function BankAvailabilityView() {
  const { matrix, loading, error, reload } = useBankAvailability();
  const [bankId, setBankId] = React.useState<string>("");
  const [checkedByLoanType, setCheckedByLoanType] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);

  const banks = React.useMemo(() => matrix?.banks ?? [], [matrix]);
  const loanTypes = React.useMemo(() => matrix?.loan_types ?? [], [matrix]);
  const entries = React.useMemo(() => matrix?.entries ?? [], [matrix]);

  // Default to the first bank once the matrix loads; re-sync the checkbox
  // state whenever the selected bank or the underlying entries change.
  React.useEffect(() => {
    if (bankId || banks.length === 0) return;
    setBankId(banks[0].id);
  }, [banks, bankId]);

  React.useEffect(() => {
    if (!bankId) return;
    const next: Record<string, boolean> = {};
    for (const lt of loanTypes) {
      next[lt.id] = isAvailable(entries, bankId, lt.id);
    }
    setCheckedByLoanType(next);
  }, [bankId, loanTypes, entries]);

  async function onSave() {
    if (!bankId) return;
    setBusy(true);
    const res = await setBankAvailability(bankId, {
      entries: loanTypes.map((lt) => ({
        loan_type_id: lt.id,
        available: checkedByLoanType[lt.id] ?? true,
      })),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Availability updated");
      void reload();
    } else {
      toast.error("Couldn't update availability", { description: res.error });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-text-secondary">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (banks.length === 0 || loanTypes.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
        <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
        <p className="mt-3 font-medium text-text-primary">Add a bank and a loan type first</p>
        <p className="mt-1 text-sm text-text-secondary">
          Availability is configured once both exist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Every loan type is available at every bank by default. Uncheck a loan type here to stop
        staff from assigning that bank on that kind of loan -- for example, a bank that only
        offers personal loans.
      </p>

      <div className="max-w-xs">
        <Label htmlFor="availability-bank">Bank</Label>
        <Select value={bankId} onValueChange={setBankId}>
          <SelectTrigger id="availability-bank" className="w-full">
            <SelectValue placeholder="Choose a bank" />
          </SelectTrigger>
          <SelectContent>
            {banks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {bankId ? (
        <div className="rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {loanTypes.map((lt) => (
              <li key={lt.id} className="flex items-center gap-3 p-4">
                <Checkbox
                  id={`avail-${lt.id}`}
                  checked={checkedByLoanType[lt.id] ?? true}
                  onCheckedChange={(v) =>
                    setCheckedByLoanType((prev) => ({ ...prev, [lt.id]: v === true }))
                  }
                />
                <Label htmlFor={`avail-${lt.id}`} className="flex-1 font-normal">
                  {lt.label}
                  {!lt.active ? (
                    <span className="ml-2 text-xs text-text-secondary">(disabled)</span>
                  ) : null}
                </Label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-border p-4">
            <Button onClick={() => void onSave()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save availability
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
