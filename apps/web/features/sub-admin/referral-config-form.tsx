"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardFormSection } from "@/features/dashboard/dashboard-ui";
import { createReferralBonusConfig } from "@/lib/referral-bonus-api";
import { apiIssuesToFieldErrors, decimalError, focusFirstInvalidField, integerError } from "@/lib/form-validation";

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
] as const;

export function ReferralConfigForm({ onCreated, onDirtyChange }: { onCreated: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [businessLine, setBusinessLine] = React.useState<(typeof LINE_OPTIONS)[number]["value"]>(
    "loans",
  );
  const [bonusAmount, setBonusAmount] = React.useState("");
  const [minConversion, setMinConversion] = React.useState("1");
  const [cap, setCap] = React.useState("");
  const [active, setActive] = React.useState(false);
  const [bonusError, setBonusError] = React.useState<string | undefined>();
  const [minConversionError, setMinConversionError] = React.useState<string | undefined>();
  const [capError, setCapError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const dirty = Boolean(bonusAmount || minConversion !== "1" || cap || active || businessLine !== "loans");
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // bonusAmount is already digit/dot-only (see the input's onChange filter);
    // validate without a Number()/String() round trip so the decimal string
    // sent to the API is exactly what the user typed.
    const nextBonusError = decimalError(bonusAmount, "Bonus amount", {
      required: true,
      min: 0,
      max: 999_999_999_999.99,
    });
    const nextMinConversionError = integerError(minConversion, "Minimum conversions", {
      required: true,
      min: 1,
      max: 2_147_483_647,
    });
    const nextCapError = integerError(cap, "Cap per referrer", {
      min: 1,
      max: 2_147_483_647,
    });
    setBonusError(nextBonusError);
    setMinConversionError(nextMinConversionError);
    setCapError(nextCapError);
    if (nextBonusError || nextMinConversionError || nextCapError) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }

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
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        bonus_amount: "bonusAmount",
        rule: "minConversion",
      });
      if (serverErrors.bonusAmount) setBonusError(serverErrors.bonusAmount);
      if (serverErrors.minConversion) setMinConversionError(serverErrors.minConversion);
      toast.error("Could not save the rule", { description: res.error });
    }
  }

  return (
    <form ref={formRef} className="space-y-5" onSubmit={onSubmit} noValidate>
      <DashboardFormSection
        title="Reward and scope"
        description="Choose the business line and bonus amount paid for an eligible referral."
      >
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
            onChange={(e) => { setBonusAmount(e.target.value.replace(/[^0-9.]/g, "")); setBonusError(undefined); }}
            aria-invalid={Boolean(bonusError)}
            aria-describedby={bonusError ? "ref-amount-error" : undefined}
          />
          <FieldError id="ref-amount-error" className="mt-1">{bonusError}</FieldError>
        </div>
      </div>
      </DashboardFormSection>

      <DashboardFormSection
        title="Eligibility limits"
        description="Set the conversion threshold, optional referrer cap, and initial activation state."
      >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ref-min-conversion">Minimum conversions<RequiredIndicator /></Label>
          <Input
            id="ref-min-conversion"
            inputMode="numeric"
            value={minConversion}
            onChange={(e) => { setMinConversion(e.target.value.replace(/[^0-9]/g, "")); setMinConversionError(undefined); }}
            aria-invalid={Boolean(minConversionError)}
            aria-describedby={minConversionError ? "ref-min-conversion-error" : undefined}
          />
          <FieldError id="ref-min-conversion-error" className="mt-1">{minConversionError}</FieldError>
        </div>
        <div>
          <Label htmlFor="ref-cap">Cap per referrer</Label>
          <Input
            id="ref-cap"
            inputMode="numeric"
            placeholder="Optional"
            value={cap}
            onChange={(e) => { setCap(e.target.value.replace(/[^0-9]/g, "")); setCapError(undefined); }}
            aria-invalid={Boolean(capError)}
            aria-describedby={capError ? "ref-cap-error" : undefined}
          />
          <FieldError id="ref-cap-error" className="mt-1">{capError}</FieldError>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
        Make this rule live immediately
      </label>
      </DashboardFormSection>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {submitting ? "Saving rule…" : "Save rule"}
      </Button>
    </form>
  );
}
