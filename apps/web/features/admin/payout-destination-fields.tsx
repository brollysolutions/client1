"use client";

import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DESTINATION_OPTIONS,
  type PayoutDestinationFormState,
} from "@/lib/payout-form";

export function PayoutDestinationFields({
  idPrefix,
  form,
  errors,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  form: PayoutDestinationFormState;
  errors: Record<string, string>;
  onChange: <Key extends keyof PayoutDestinationFormState>(
    key: Key,
    value: PayoutDestinationFormState[Key],
  ) => void;
  disabled?: boolean;
}) {
  const destinationErrorId = `${idPrefix}-destination-error`;
  return (
    <>
      <div className="space-y-1.5">
        <Label id={`${idPrefix}-destination-label`}>
          Destination
          <RequiredIndicator />
        </Label>
        <RadioGroup
          value={form.destinationType}
          onValueChange={(value) =>
            onChange(
              "destinationType",
              value as PayoutDestinationFormState["destinationType"],
            )
          }
          disabled={disabled}
          className="grid-cols-1 sm:grid-cols-3"
          aria-labelledby={`${idPrefix}-destination-label`}
          aria-required="true"
          aria-invalid={Boolean(errors.destinationType)}
          aria-describedby={errors.destinationType ? destinationErrorId : undefined}
        >
          {DESTINATION_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                value={option.value}
                id={`${idPrefix}-destination-${option.value}`}
              />
              <Label
                htmlFor={`${idPrefix}-destination-${option.value}`}
                className="font-normal"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <FieldError id={destinationErrorId} className="text-xs">
          {errors.destinationType}
        </FieldError>
      </div>

      {form.destinationType === "vpa" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-vpa`}>
            UPI VPA
            <RequiredIndicator />
          </Label>
          <Input
            id={`${idPrefix}-vpa`}
            placeholder="name@bank"
            value={form.vpa}
            maxLength={100}
            disabled={disabled}
            aria-invalid={Boolean(errors.vpa)}
            aria-describedby={errors.vpa ? `${idPrefix}-vpa-error` : undefined}
            onChange={(event) => onChange("vpa", event.target.value)}
          />
          <FieldError id={`${idPrefix}-vpa-error`} className="text-xs">
            {errors.vpa}
          </FieldError>
        </div>
      ) : form.destinationType === "bank_account" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-ifsc`}>
              IFSC
              <RequiredIndicator />
            </Label>
            <Input
              id={`${idPrefix}-ifsc`}
              value={form.ifsc}
              maxLength={20}
              autoCapitalize="characters"
              disabled={disabled}
              aria-invalid={Boolean(errors.ifsc)}
              aria-describedby={errors.ifsc ? `${idPrefix}-ifsc-error` : undefined}
              onChange={(event) => onChange("ifsc", event.target.value)}
            />
            <FieldError id={`${idPrefix}-ifsc-error`} className="text-xs">
              {errors.ifsc}
            </FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-account`}>
              Account number
              <RequiredIndicator />
            </Label>
            <Input
              id={`${idPrefix}-account`}
              value={form.accountNumber}
              minLength={6}
              maxLength={40}
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled}
              aria-invalid={Boolean(errors.accountNumber)}
              aria-describedby={
                errors.accountNumber ? `${idPrefix}-account-error` : undefined
              }
              onChange={(event) => onChange("accountNumber", event.target.value)}
            />
            <FieldError id={`${idPrefix}-account-error`} className="text-xs">
              {errors.accountNumber}
            </FieldError>
          </div>
        </div>
      ) : form.destinationType === "cheque" ? (
        <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
          No bank details are stored. The cheque reference is recorded after approval and
          issuance.
        </p>
      ) : null}
    </>
  );
}
