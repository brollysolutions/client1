"use client";

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
import { Textarea } from "@/components/ui/textarea";
import type { FinancialProduct } from "@/lib/loans";

export type ProductAnswers = Record<string, string | string[]>;
export type ProductAnswerErrors = Record<string, string>;

function isVisible(
  field: FinancialProduct["form_schema"]["sections"][number]["fields"][number],
  answers: ProductAnswers,
): boolean {
  return !field.condition || answers[field.condition.field_key] === field.condition.equals;
}

export function validateProductAnswers(
  product: FinancialProduct,
  answers: ProductAnswers,
): ProductAnswerErrors {
  const errors: ProductAnswerErrors = {};
  for (const section of product.form_schema.sections) {
    for (const field of section.fields) {
      if (!isVisible(field, answers)) continue;
      const value = answers[field.key];
      const empty = Array.isArray(value) ? value.length === 0 : !value?.trim();
      if (field.required && empty) {
        errors[field.key] = `${field.label} is required.`;
        continue;
      }
      if (empty || Array.isArray(value)) continue;
      if (field.input_type === "pincode" && !/^[1-9][0-9]{5}$/.test(value)) {
        errors[field.key] = "Enter a valid 6-digit PIN code.";
      } else if (field.input_type === "phone" && !/^[6-9][0-9]{9}$/.test(value)) {
        errors[field.key] = "Enter a valid 10-digit mobile number.";
      } else if (field.input_type === "currency" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
        errors[field.key] = "Enter a valid positive amount.";
      } else if (field.input_type === "integer" && !/^[0-9]+$/.test(value)) {
        errors[field.key] = "Enter a valid whole number.";
      }
    }
  }
  return errors;
}

export function FinancialProductFormFields({
  product,
  fullName,
  mobile,
  answers,
  errors,
  onAnswersChange,
  disabled = false,
}: {
  product: FinancialProduct;
  fullName: string;
  mobile: string;
  answers: ProductAnswers;
  errors: ProductAnswerErrors;
  onAnswersChange: (answers: ProductAnswers) => void;
  disabled?: boolean;
}) {
  function update(key: string, value: string | string[]) {
    const next = { ...answers, [key]: value };
    for (const section of product.form_schema.sections) {
      for (const field of section.fields) {
        if (!isVisible(field, next)) delete next[field.key];
      }
    }
    onAnswersChange(next);
  }

  return (
    <div className="space-y-8">
      <fieldset className="grid min-w-0 gap-4 border-0 p-0">
        <legend className="font-heading text-lg font-semibold text-foreground">
          Registered applicant
        </legend>
        <p className="text-sm text-text-secondary">
          These details come from your verified account and cannot be changed in this form.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="applicant-full-name">Full Name</Label>
            <Input id="applicant-full-name" value={fullName} readOnly aria-readonly="true" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="applicant-mobile">Registered Mobile Number</Label>
            <Input id="applicant-mobile" value={mobile} readOnly aria-readonly="true" />
          </div>
        </div>
      </fieldset>

      {product.form_schema.sections.map((section) => (
        <fieldset key={section.key} className="grid min-w-0 gap-4 border-0 border-t border-border p-0 pt-8">
          <legend className="font-heading text-lg font-semibold text-foreground">
            {section.title}
          </legend>
          {section.description ? (
            <p className="text-sm text-text-secondary">{section.description}</p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            {section.fields.map((field) => {
              if (!isVisible(field, answers)) return null;
              const id = `product-field-${field.key}`;
              const errorId = `${id}-error`;
              const helpId = `${id}-help`;
              const describedBy = [field.help_text ? helpId : null, errors[field.key] ? errorId : null]
                .filter(Boolean)
                .join(" ") || undefined;
              const value = answers[field.key];

              return (
                <div
                  key={field.key}
                  className={field.input_type === "textarea" || field.input_type === "multi_select" ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}
                >
                  <Label id={`${id}-label`} htmlFor={field.input_type === "multi_select" ? undefined : id}>
                    {field.label}
                    {field.required ? (
                      <>
                        <span aria-hidden="true"> *</span>
                        <span className="sr-only"> (required)</span>
                      </>
                    ) : null}
                  </Label>

                  {field.input_type === "textarea" ? (
                    <Textarea
                      id={id}
                      value={typeof value === "string" ? value : ""}
                      disabled={disabled}
                      required={field.required}
                      maxLength={2000}
                      aria-invalid={Boolean(errors[field.key])}
                      aria-describedby={describedBy}
                      placeholder={field.placeholder ?? undefined}
                      onChange={(event) => update(field.key, event.target.value)}
                    />
                  ) : field.input_type === "select" ? (
                    <Select
                      value={typeof value === "string" ? value : ""}
                      disabled={disabled}
                      onValueChange={(selected) => update(field.key, selected)}
                    >
                      <SelectTrigger
                        id={id}
                        aria-required={field.required}
                        aria-invalid={Boolean(errors[field.key])}
                        aria-describedby={describedBy}
                      >
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.input_type === "multi_select" ? (
                    <div
                      className="grid gap-2 rounded-lg border border-border p-3"
                      role="group"
                      aria-labelledby={`${id}-label`}
                      aria-describedby={describedBy}
                    >
                      {(field.options ?? []).map((option) => {
                        const selected = Array.isArray(value) ? value : [];
                        const checked = selected.includes(option.value);
                        return (
                          <div key={option.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`${id}-${option.value}`}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(nextChecked) =>
                                update(
                                  field.key,
                                  nextChecked === true
                                    ? [...selected, option.value]
                                    : selected.filter((item) => item !== option.value),
                                )
                              }
                            />
                            <Label htmlFor={`${id}-${option.value}`} className="font-normal">
                              {option.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      id={id}
                      type={field.input_type === "date" ? "date" : field.input_type === "phone" ? "tel" : "text"}
                      inputMode={
                        field.input_type === "currency"
                          ? "decimal"
                          : field.input_type === "integer" || field.input_type === "pincode" || field.input_type === "phone"
                            ? "numeric"
                            : undefined
                      }
                      value={typeof value === "string" ? value : ""}
                      disabled={disabled}
                      required={field.required}
                      maxLength={field.input_type === "pincode" ? 6 : field.input_type === "phone" ? 10 : 200}
                      aria-invalid={Boolean(errors[field.key])}
                      aria-describedby={describedBy}
                      placeholder={field.placeholder ?? undefined}
                      onChange={(event) => update(field.key, event.target.value)}
                    />
                  )}

                  {field.help_text ? (
                    <p id={helpId} className="text-xs text-text-secondary">{field.help_text}</p>
                  ) : null}
                  {errors[field.key] ? (
                    <p id={errorId} role="alert" className="text-sm text-destructive">
                      {errors[field.key]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
