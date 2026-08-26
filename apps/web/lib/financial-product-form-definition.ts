import type {
  ProductCategory,
  ProductFormDefinition,
} from "@/lib/loan-config-api";

export type ProductFormDefinitionErrors = Record<string, string>;

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const OPTION_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function validateProductFormDefinition(
  category: ProductCategory,
  definition: ProductFormDefinition,
): ProductFormDefinitionErrors {
  const errors: ProductFormDefinitionErrors = {};
  if (definition.sections.length < 1 || definition.sections.length > 10) {
    errors.form = "A form must contain between 1 and 10 sections.";
  }

  const sectionKeys = new Set<string>();
  const fieldKeys = new Set<string>();
  const earlierFields = new Map<string, ProductFormDefinition["sections"][number]["fields"][number]>();
  let fieldCount = 0;

  definition.sections.forEach((section, sectionIndex) => {
    const sectionPath = `section.${sectionIndex}`;
    if (!KEY_PATTERN.test(section.key) || section.key.length > 64) {
      errors[`${sectionPath}.key`] = "Section key must use lowercase letters, numbers, and underscores.";
    } else if (sectionKeys.has(section.key)) {
      errors[`${sectionPath}.key`] = "Section keys must be unique.";
    }
    sectionKeys.add(section.key);
    if (!section.title.trim()) errors[`${sectionPath}.title`] = "Section title is required.";
    else if (section.title.trim().length > 120) {
      errors[`${sectionPath}.title`] = "Section title must be 120 characters or fewer.";
    }
    if ((section.description ?? "").trim().length > 240) {
      errors[`${sectionPath}.description`] = "Description must be 240 characters or fewer.";
    }
    if (section.fields.length < 1 || section.fields.length > 30) {
      errors[`${sectionPath}.fields`] = "A section must contain between 1 and 30 fields.";
    }

    section.fields.forEach((field, fieldIndex) => {
      fieldCount += 1;
      const fieldPath = `field.${sectionIndex}.${fieldIndex}`;
      if (!KEY_PATTERN.test(field.key) || field.key.length > 64) {
        errors[`${fieldPath}.key`] = "Field key must use lowercase letters, numbers, and underscores.";
      } else if (fieldKeys.has(field.key)) {
        errors[`${fieldPath}.key`] = "Field keys must be unique across the form.";
      }
      fieldKeys.add(field.key);
      if (!field.label.trim()) errors[`${fieldPath}.label`] = "Field label is required.";
      else if (field.label.trim().length > 120) {
        errors[`${fieldPath}.label`] = "Field label must be 120 characters or fewer.";
      }
      if ((field.placeholder ?? "").trim().length > 120) {
        errors[`${fieldPath}.placeholder`] = "Placeholder must be 120 characters or fewer.";
      }
      if ((field.help_text ?? "").trim().length > 240) {
        errors[`${fieldPath}.help`] = "Help text must be 240 characters or fewer.";
      }

      const optionField = field.input_type === "select" || field.input_type === "multi_select";
      const options = field.options ?? [];
      if (optionField && (options.length < 1 || options.length > 30)) {
        errors[`${fieldPath}.options`] = "Choice fields require between 1 and 30 options.";
      } else if (!optionField && options.length > 0) {
        errors[`${fieldPath}.options`] = "Only choice fields may have options.";
      } else if (optionField) {
        const values = new Set<string>();
        const invalid = options.some((option) => {
          const duplicate = values.has(option.value);
          values.add(option.value);
          return (
            duplicate ||
            !OPTION_KEY_PATTERN.test(option.value) ||
            option.value.length > 80 ||
            !option.label.trim() ||
            option.label.trim().length > 120
          );
        });
        if (invalid) {
          errors[`${fieldPath}.options`] =
            "Use unique option keys and non-empty labels within the supported lengths.";
        }
      }

      if (field.condition) {
        const source = earlierFields.get(field.condition.field_key);
        if (
          !source ||
          source.input_type !== "select" ||
          !(source.options ?? []).some((option) => option.value === field.condition?.equals)
        ) {
          errors[`${fieldPath}.condition`] =
            "Choose a valid earlier single-choice field and one of its options.";
        }
      }
      earlierFields.set(field.key, field);
    });
  });

  if (fieldCount > 100) errors.form = "A form may contain at most 100 fields.";
  const requestedAmount = definition.sections
    .flatMap((section) => section.fields)
    .find((field) => field.key === "requested_amount");
  if (
    category === "loan" &&
    (!requestedAmount ||
      requestedAmount.input_type !== "currency" ||
      !requestedAmount.required ||
      requestedAmount.condition)
  ) {
    errors.form = "Loan forms require an always-visible required currency field named requested_amount.";
  }
  return errors;
}
