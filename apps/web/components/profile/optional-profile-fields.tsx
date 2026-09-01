"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Gender, IncomePeriod, IncomeSource } from "@/lib/auth";

const NOT_SUPPLIED = "not_supplied";
const LOCATION_MAX_LENGTH = 500;

export type OptionalProfileDraft = {
  gender: Gender | "";
  genderSelfDescription: string;
  incomeSource: IncomeSource | "";
  incomeAmountRupees: string;
  incomePeriod: IncomePeriod | "";
  occupation: string;
  location: string;
};

export const EMPTY_OPTIONAL_PROFILE: OptionalProfileDraft = {
  gender: "",
  genderSelfDescription: "",
  incomeSource: "",
  incomeAmountRupees: "",
  incomePeriod: "",
  occupation: "",
  location: "",
};

export function OptionalProfileFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
  errors = {},
}: {
  value: OptionalProfileDraft;
  onChange: (value: OptionalProfileDraft) => void;
  disabled?: boolean;
  idPrefix: string;
  errors?: Partial<Record<keyof OptionalProfileDraft, string>>;
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
            aria-invalid={Boolean(errors.genderSelfDescription)}
            aria-describedby={errors.genderSelfDescription ? `${idPrefix}-gender-description-error` : undefined}
          />
          <FieldError id={`${idPrefix}-gender-description-error`}>
            {errors.genderSelfDescription}
          </FieldError>
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
            <SelectItem value="salaried">Salaried</SelectItem>
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
          aria-invalid={Boolean(errors.incomeAmountRupees)}
          aria-describedby={errors.incomeAmountRupees ? `${idPrefix}-income-amount-error` : undefined}
        />
        <FieldError id={`${idPrefix}-income-amount-error`}>
          {errors.incomeAmountRupees}
        </FieldError>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-income-period`}>Income period</Label>
        <Select
          value={value.incomePeriod || "monthly"}
          onValueChange={(next) => set("incomePeriod", next as IncomePeriod)}
          disabled={disabled || !value.incomeSource}
        >
          <SelectTrigger id={`${idPrefix}-income-period`} className="w-full" aria-invalid={Boolean(errors.incomePeriod)} aria-describedby={errors.incomePeriod ? `${idPrefix}-income-period-error` : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
        <FieldError id={`${idPrefix}-income-period-error`}>{errors.incomePeriod}</FieldError>
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
          aria-invalid={Boolean(errors.occupation)}
          aria-describedby={errors.occupation ? `${idPrefix}-occupation-error` : undefined}
        />
        <FieldError id={`${idPrefix}-occupation-error`}>{errors.occupation}</FieldError>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-location`}>Location</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <Input
            id={`${idPrefix}-location`}
            name="location"
            type="search"
            value={value.location}
            onChange={(event) => set("location", event.target.value)}
            maxLength={LOCATION_MAX_LENGTH}
            autoComplete="address-level2"
            disabled={disabled}
            placeholder="Search or enter a city or locality"
            className="pl-9"
            aria-invalid={Boolean(errors.location)}
            aria-describedby={
              [
                `${idPrefix}-location-help`,
                errors.location ? `${idPrefix}-location-error` : undefined,
              ].filter(Boolean).join(" ")
            }
          />
        </div>
        <p id={`${idPrefix}-location-help`} className="text-xs text-text-secondary">
          Optional. Search for or enter a city or locality. Only this editable place name is saved.
        </p>
        <FieldError id={`${idPrefix}-location-error`}>{errors.location}</FieldError>
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
        location: string | null;
      };
    }
  | { ok: false; error: string; field: keyof OptionalProfileDraft } {
  const errors = validateOptionalProfile(value);
  const first = (Object.keys(errors) as (keyof OptionalProfileDraft)[])[0];
  if (first && errors[first]) {
    return { ok: false, error: errors[first], field: first };
  }

  const description = value.genderSelfDescription.trim();

  let incomeAmountMinor: number | null = null;
  if (value.incomeSource) {
    incomeAmountMinor = Math.round(Number(value.incomeAmountRupees) * 100);
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
      location: value.location.trim() || null,
    },
  };
}

export function validateOptionalProfile(
  value: OptionalProfileDraft,
): Partial<Record<keyof OptionalProfileDraft, string>> {
  const errors: Partial<Record<keyof OptionalProfileDraft, string>> = {};
  if (value.gender === "self_described" && !value.genderSelfDescription.trim()) {
    errors.genderSelfDescription = "Describe your gender or choose another option.";
  }
  if (value.incomeSource) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.incomeAmountRupees)) {
      errors.incomeAmountRupees = "Enter a valid income amount with up to two decimals.";
    } else {
      const amountMinor = Math.round(Number(value.incomeAmountRupees) * 100);
      if (amountMinor < 1 || amountMinor > 1_000_000_000_000) {
        errors.incomeAmountRupees = "Enter an income amount within the supported range.";
      }
    }
    if (!value.incomePeriod) {
      errors.incomePeriod = "Choose whether the income amount is monthly or annual.";
    }
  }
  if (value.occupation.trim().length > 120) {
    errors.occupation = "Occupation must be 120 characters or fewer.";
  }
  if (value.location.trim().length > LOCATION_MAX_LENGTH) {
    errors.location = `Location must be ${LOCATION_MAX_LENGTH} characters or fewer.`;
  }
  return errors;
}
