"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type {
  FormFieldDefinition,
  FormInputType,
  ProductCategory,
  ProductFormDefinition,
} from "@/lib/loan-config-api";

const INPUT_LABELS: Record<FormInputType, string> = {
  text: "Short text",
  textarea: "Long text",
  date: "Date",
  integer: "Whole number",
  currency: "Currency amount",
  select: "Single choice",
  multi_select: "Multiple choice",
  pincode: "PIN code",
  phone: "Mobile number",
};

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function nextKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`;
}

function optionLines(field: FormFieldDefinition): string {
  return (field.options ?? []).map((option) => `${option.value} | ${option.label}`).join("\n");
}

function parseOptionLines(value: string): NonNullable<FormFieldDefinition["options"]> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, ...labelParts] = line.split("|");
      const optionValue = rawValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      return { value: optionValue, label: (labelParts.join("|").trim() || rawValue.trim()) };
    });
}

export function FinancialProductFormBuilder({
  category,
  value,
  onChange,
  disabled = false,
}: {
  category: ProductCategory;
  value: ProductFormDefinition;
  onChange: (value: ProductFormDefinition) => void;
  disabled?: boolean;
}) {
  function updateSection(index: number, patch: Partial<ProductFormDefinition["sections"][number]>) {
    const sections = value.sections.map((section, sectionIndex) =>
      sectionIndex === index ? { ...section, ...patch } : section,
    );
    onChange({ sections });
  }

  function updateField(sectionIndex: number, fieldIndex: number, patch: Partial<FormFieldDefinition>) {
    const section = value.sections[sectionIndex];
    updateSection(sectionIndex, {
      fields: section.fields.map((field, index) =>
        index === fieldIndex ? { ...field, ...patch } : field,
      ),
    });
  }

  function addSection() {
    onChange({
      sections: [
        ...value.sections,
        {
          key: nextKey("section"),
          title: "New Section",
          description: null,
          fields: [
            {
              key: nextKey("field"),
              label: "New Field",
              input_type: "text",
              required: true,
              options: [],
              condition: null,
            },
          ],
        },
      ],
    });
  }

  function addField(sectionIndex: number) {
    const section = value.sections[sectionIndex];
    updateSection(sectionIndex, {
      fields: [
        ...section.fields,
        {
          key: nextKey("field"),
          label: "New Field",
          input_type: "text",
          required: true,
          options: [],
          condition: null,
        },
      ],
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/35 p-4 text-sm text-text-secondary">
        Full name and registered mobile number are filled securely from the client account and are
        always shown first. Configure only the additional information needed for this {category.replace("_", " ")} product.
      </div>

      {value.sections.map((section, sectionIndex) => (
        <section key={section.key} className="rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`section-title-${section.key}`}>Section title</Label>
                <Input
                  id={`section-title-${section.key}`}
                  value={section.title}
                  disabled={disabled}
                  onChange={(event) => updateSection(sectionIndex, { title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`section-description-${section.key}`}>Description (optional)</Label>
                <Input
                  id={`section-description-${section.key}`}
                  value={section.description ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSection(sectionIndex, { description: event.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Move ${section.title} up`}
                disabled={disabled || sectionIndex === 0}
                onClick={() => onChange({ sections: move(value.sections, sectionIndex, -1) })}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Move ${section.title} down`}
                disabled={disabled || sectionIndex === value.sections.length - 1}
                onClick={() => onChange({ sections: move(value.sections, sectionIndex, 1) })}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove ${section.title}`}
                disabled={
                  disabled ||
                  value.sections.length === 1 ||
                  (category === "loan" &&
                    section.fields.some((field) => field.key === "requested_amount"))
                }
                onClick={() =>
                  onChange({ sections: value.sections.filter((_, index) => index !== sectionIndex) })
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {section.fields.map((field, fieldIndex) => {
              const isCanonicalLoanAmount =
                category === "loan" && field.key === "requested_amount";
              const previousSelectFields = value.sections
                .slice(0, sectionIndex + 1)
                .flatMap((candidateSection, candidateSectionIndex) =>
                  candidateSection.fields.filter(
                    (candidate, candidateIndex) =>
                      candidate.input_type === "select" &&
                      (candidateSectionIndex < sectionIndex || candidateIndex < fieldIndex),
                  ),
                );
              const controllingField = previousSelectFields.find(
                (candidate) => candidate.key === field.condition?.field_key,
              );

              return (
                <div key={field.key} className="rounded-lg border border-border bg-card p-4">
                  {isCanonicalLoanAmount ? (
                    <p className="mb-3 text-xs text-text-secondary">
                      This loan amount field is always shown; its key, response type, and required
                      status are fixed.
                    </p>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`field-label-${field.key}`}>Field label</Label>
                      <Input
                        id={`field-label-${field.key}`}
                        value={field.label}
                        disabled={disabled}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, { label: event.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`field-key-${field.key}`}>Field key</Label>
                      <Input
                        id={`field-key-${field.key}`}
                        value={field.key}
                        pattern="[a-z][a-z0-9_]*"
                        disabled={disabled || isCanonicalLoanAmount}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, {
                            key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`field-type-${field.key}`}>Response type</Label>
                      <Select
                        value={field.input_type}
                        disabled={disabled || isCanonicalLoanAmount}
                        onValueChange={(inputType: FormInputType) =>
                          updateField(sectionIndex, fieldIndex, {
                            input_type: inputType,
                            options:
                              inputType === "select" || inputType === "multi_select"
                                ? field.options ?? []
                                : [],
                            condition:
                              inputType === "select" && field.condition?.field_key === field.key
                                ? null
                                : field.condition,
                          })
                        }
                      >
                        <SelectTrigger id={`field-type-${field.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(INPUT_LABELS).map(([inputType, label]) => (
                            <SelectItem key={inputType} value={inputType}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`field-help-${field.key}`}>Help text (optional)</Label>
                      <Input
                        id={`field-help-${field.key}`}
                        value={field.help_text ?? ""}
                        disabled={disabled}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, {
                            help_text: event.target.value || null,
                          })
                        }
                      />
                    </div>
                  </div>

                  {(field.input_type === "select" || field.input_type === "multi_select") && (
                    <div className="mt-3 grid gap-1.5">
                      <Label htmlFor={`field-options-${field.key}`}>Options</Label>
                      <Textarea
                        id={`field-options-${field.key}`}
                        value={optionLines(field)}
                        disabled={disabled}
                        rows={3}
                        placeholder={"salaried | Salaried\nself_employed | Self-employed"}
                        onChange={(event) =>
                          updateField(sectionIndex, fieldIndex, {
                            options: parseOptionLines(event.target.value),
                          })
                        }
                      />
                      <p className="text-xs text-text-secondary">
                        One option per line in the format key | Client-facing label.
                      </p>
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id={`field-required-${field.key}`}
                        checked={field.required}
                        disabled={disabled || isCanonicalLoanAmount}
                        onCheckedChange={(checked) =>
                          updateField(sectionIndex, fieldIndex, { required: checked === true })
                        }
                      />
                      <Label htmlFor={`field-required-${field.key}`} className="font-normal">
                        Required
                      </Label>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`field-condition-${field.key}`}>Show condition</Label>
                      <Select
                        value={field.condition?.field_key ?? "always"}
                        disabled={
                          disabled || isCanonicalLoanAmount || previousSelectFields.length === 0
                        }
                        onValueChange={(sourceKey) => {
                          const source = previousSelectFields.find(
                            (candidate) => candidate.key === sourceKey,
                          );
                          updateField(sectionIndex, fieldIndex, {
                            condition:
                              source && source.options?.[0]
                                ? { field_key: source.key, equals: source.options[0].value }
                                : null,
                          });
                        }}
                      >
                        <SelectTrigger id={`field-condition-${field.key}`}>
                          <SelectValue placeholder="Always show" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Always show</SelectItem>
                          {previousSelectFields.map((candidate) => (
                            <SelectItem key={candidate.key} value={candidate.key}>
                              When {candidate.label}…
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {controllingField && field.condition && (
                      <div className="grid gap-1.5 md:col-start-2">
                        <Label htmlFor={`field-condition-value-${field.key}`}>Equals</Label>
                        <Select
                          value={field.condition.equals}
                          disabled={disabled}
                          onValueChange={(equals) =>
                            updateField(sectionIndex, fieldIndex, {
                              condition: { ...field.condition!, equals },
                            })
                          }
                        >
                          <SelectTrigger id={`field-condition-value-${field.key}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(controllingField.options ?? []).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${field.label} up`}
                      disabled={disabled || fieldIndex === 0}
                      onClick={() =>
                        updateSection(sectionIndex, {
                          fields: move(section.fields, fieldIndex, -1),
                        })
                      }
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${field.label} down`}
                      disabled={disabled || fieldIndex === section.fields.length - 1}
                      onClick={() =>
                        updateSection(sectionIndex, {
                          fields: move(section.fields, fieldIndex, 1),
                        })
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${field.label}`}
                      disabled={
                        disabled || section.fields.length === 1 || isCanonicalLoanAmount
                      }
                      onClick={() =>
                        updateSection(sectionIndex, {
                          fields: section.fields.filter((_, index) => index !== fieldIndex),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={disabled}
            onClick={() => addField(sectionIndex)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </section>
      ))}

      <Button type="button" variant="outline" disabled={disabled} onClick={addSection}>
        <Plus className="mr-2 h-4 w-4" />
        Add section
      </Button>
    </div>
  );
}
