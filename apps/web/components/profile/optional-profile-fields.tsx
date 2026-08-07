"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Gender, IncomePeriod, IncomeSource } from "@/lib/auth";

const NOT_SUPPLIED = "not_supplied";

export type OptionalProfileDraft = {
  gender: Gender | "";
  genderSelfDescription: string;
  incomeSource: IncomeSource | "";
  incomeAmountRupees: string;
  incomePeriod: IncomePeriod | "";
  occupation: string;
  address: string;
};

export const EMPTY_OPTIONAL_PROFILE: OptionalProfileDraft = {
  gender: "",
  genderSelfDescription: "",
  incomeSource: "",
  incomeAmountRupees: "",
  incomePeriod: "",
  occupation: "",
  address: "",
};

export function OptionalProfileFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: OptionalProfileDraft;
  onChange: (value: OptionalProfileDraft) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  function set<K extends keyof OptionalProfileDraft>(key: K, next: OptionalProfileDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-gender`}>Gender</Label>
        <Select
          value={value.gender || NOT_SUPPLIED}
          onValueChange={(next) => {
            const gender = next === NOT_SUPPLIED ? "" : (next as Gender);
            onChange({
              ...value,
              gender,
              genderSelfDescription:
                gender === "self_described" ? value.genderSelfDescription : "",
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-gender`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOT_SUPPLIED}>Not supplied</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="non_binary">Non-binary</SelectItem>
            <SelectItem value="self_described">Self-describe</SelectItem>
            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.gender === "self_described" ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-gender-description`}>How you describe your gender</Label>
          <Input
            id={`${idPrefix}-gender-description`}
            value={value.genderSelfDescription}
            onChange={(event) => set("genderSelfDescription", event.target.value)}
            maxLength={100}
            disabled={disabled}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-income-source`}>Income source</Label>
        <Select
          value={value.incomeSource || NOT_SUPPLIED}
          onValueChange={(next) => {
            const incomeSource = next === NOT_SUPPLIED ? "" : (next as IncomeSource);
            onChange({
              ...value,
              incomeSource,
              incomeAmountRupees: incomeSource ? value.incomeAmountRupees : "",
              incomePeriod: incomeSource ? value.incomePeriod || "monthly" : "",
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-income-source`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOT_SUPPLIED}>Not supplied</SelectItem>
            <SelectItem value="net_salary">Net salary</SelectItem>
            <SelectItem value="business_income">Business income</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-income-amount`}>Income amount (₹)</Label>
        <Input
          id={`${idPrefix}-income-amount`}
          type="number"
          min="0.01"
          max="10000000000"
          step="0.01"
          inputMode="decimal"
          value={value.incomeAmountRupees}
          onChange={(event) => set("incomeAmountRupees", event.target.value)}
          disabled={disabled || !value.incomeSource}
          placeholder={value.incomeSource ? "50000" : "Choose an income source first"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-income-period`}>Income period</Label>
        <Select
          value={value.incomePeriod || "monthly"}
          onValueChange={(next) => set("incomePeriod", next as IncomePeriod)}
          disabled={disabled || !value.incomeSource}
        >
          <SelectTrigger id={`${idPrefix}-income-period`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-occupation`}>Occupation</Label>
        <Input
          id={`${idPrefix}-occupation`}
          value={value.occupation}
          onChange={(event) => set("occupation", event.target.value)}
          maxLength={120}
          autoComplete="organization-title"
          disabled={disabled}
          placeholder="e.g. Teacher or business owner"
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Postal address</Label>
        <Textarea
          id={`${idPrefix}-address`}
          value={value.address}
          onChange={(event) => set("address", event.target.value)}
          maxLength={500}
          autoComplete="street-address"
          disabled={disabled}
          placeholder="House or flat, street, city, state, and PIN code"
        />
      </div>
    </div>
  );
}

export function optionalProfilePayload(value: OptionalProfileDraft):
  | {
      ok: true;
      data: {
        gender: Gender | null;
        genderSelfDescription: string | null;
        incomeSource: IncomeSource | null;
        incomeAmountMinor: number | null;
        incomePeriod: IncomePeriod | null;
        occupation: string | null;
        address: string | null;
      };
    }
  | { ok: false; error: string } {
  const description = value.genderSelfDescription.trim();
  if (value.gender === "self_described" && !description) {
    return { ok: false, error: "Describe your gender or choose another option." };
  }

  let incomeAmountMinor: number | null = null;
  if (value.incomeSource) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.incomeAmountRupees)) {
      return { ok: false, error: "Enter a valid income amount with up to two decimals." };
    }
    incomeAmountMinor = Math.round(Number(value.incomeAmountRupees) * 100);
    if (incomeAmountMinor < 1 || incomeAmountMinor > 1_000_000_000_000) {
      return { ok: false, error: "Enter an income amount within the supported range." };
    }
    if (!value.incomePeriod) {
      return { ok: false, error: "Choose whether the income amount is monthly or annual." };
    }
  }

  return {
    ok: true,
    data: {
      gender: value.gender || null,
      genderSelfDescription: value.gender === "self_described" ? description : null,
      incomeSource: value.incomeSource || null,
      incomeAmountMinor,
      incomePeriod: value.incomeSource ? value.incomePeriod || null : null,
      occupation: value.occupation.trim() || null,
      address: value.address.trim() || null,
    },
  };
}
