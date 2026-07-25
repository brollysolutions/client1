"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReferralBonusConfig } from "@/lib/referral-bonus-api";

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;

export function ReferralConfigForm({ onCreated }: { onCreated: () => void }) {
  const [businessLine, setBusinessLine] = React.useState<(typeof LINE_OPTIONS)[number]["value"]>(
    "loans",
  );
  const [bonusAmount, setBonusAmount] = React.useState("");
  const [minConversion, setMinConversion] = React.useState("1");
  const [cap, setCap] = React.useState("");
  const [active, setActive] = React.useState(false);
  const [bonusError, setBonusError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // bonusAmount is already digit/dot-only (see the input's onChange filter);
    // validate without a Number()/String() round trip so the decimal string
    // sent to the API is exactly what the user typed.
    if (!bonusAmount || Number.isNaN(Number(bonusAmount)) || Number(bonusAmount) < 0) {
      setBonusError("Enter a valid bonus amount.");
      return;
    }
    setBonusError(undefined);

    const rule: Record<string, number> = {};
    const minConv = Number(minConversion);
    if (minConversion && !Number.isNaN(minConv)) rule.min_conversion = minConv;
    const capValue = Number(cap);
    if (cap && !Number.isNaN(capValue)) rule.cap = capValue;

    setSubmitting(true);
    const res = await createReferralBonusConfig({
      business_line: businessLine,
      bonus_amount: bonusAmount,
      rule,
      active,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Referral bonus rule saved");
      setBonusAmount("");
      setMinConversion("1");
      setCap("");
      setActive(false);
      onCreated();
    } else {
      toast.error("Could not save the rule", { description: res.error });
    }
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-card p-6"
      onSubmit={onSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-text-primary">New bonus rule</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Set the amount and conditions. This only configures the rule, it never sends a payout.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ref-line">Line</Label>
          <Select value={businessLine} onValueChange={(v) => setBusinessLine(v as typeof businessLine)}>
            <SelectTrigger id="ref-line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ref-amount">Bonus amount (₹)</Label>
          <Input
            id="ref-amount"
            inputMode="decimal"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          {bonusError ? <p className="mt-1 text-sm text-destructive">{bonusError}</p> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ref-min-conversion">Minimum conversions</Label>
          <Input
            id="ref-min-conversion"
            inputMode="numeric"
            value={minConversion}
            onChange={(e) => setMinConversion(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div>
          <Label htmlFor="ref-cap">Cap per referrer</Label>
          <Input
            id="ref-cap"
            inputMode="numeric"
            placeholder="Optional"
            value={cap}
            onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
        Active immediately
      </label>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save rule
      </Button>
    </form>
  );
}
